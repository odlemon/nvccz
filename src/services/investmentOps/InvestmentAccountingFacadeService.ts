// @ts-nocheck
import { createHash } from "crypto";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { Decimal } from "@prisma/client/runtime/library";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { assertFourEyeSeparation } from "./investmentOpsFourEye";
import { prisma } from "../../utils/database";
import { createJournalEntryWithAuditSequence } from "../AuditTrailSequenceService";
import PeriodLockoutService from "../PeriodLockoutService";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { InvestmentOpsAuditService } from "./InvestmentOpsAuditService";
import { paginatedResult, parsePagination } from "./investmentOpsSupport";

const db = prisma as any;

function fail(code: string, message: string, status = 400, details: unknown = null): never {
  throw new InvestmentOpsError(code, message, status, details);
}

function dec(value: unknown): Decimal {
  try {
    return new Decimal(String(value ?? 0));
  } catch {
    return new Decimal(0);
  }
}

function periodKey(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function csvCell(value: unknown): string {
  const raw = value == null ? "" : String(value);
  if (/[",\r\n]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`;
  return raw;
}

function buildLedgerExportCsv(
  exportBatchRef: string,
  fundName: string,
  rows: Array<Record<string, unknown>>
): string {
  const headers = [
    "export_batch_ref",
    "portfolio",
    "event_id",
    "event_type",
    "source_type",
    "trade_ref",
    "posted_at",
    "currency",
    "amount",
    "journal_ref",
    "account_no",
    "account_name",
    "debit",
    "credit",
    "line_description",
  ];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      headers.map((h) => csvCell(row[h])).join(",")
    );
  }
  return `${lines.join("\r\n")}\r\n`;
}

async function assertPeriodOpen(date: Date) {
  const locked = await PeriodLockoutService.isPeriodLocked(periodKey(date));
  if (locked) {
    fail("PERIOD_LOCKED", `Accounting period ${periodKey(date)} is locked`, 409, {
      period: periodKey(date),
    });
  }
}

export function journalBalance(lines: Array<{ debitAmount?: any; creditAmount?: any }>) {
  const debit = lines.reduce((s, l) => s.plus(dec(l.debitAmount)), new Decimal(0));
  const credit = lines.reduce((s, l) => s.plus(dec(l.creditAmount)), new Decimal(0));
  return { debit, credit, balanced: debit.minus(credit).abs().lte(new Decimal("0.01")) };
}

async function nextWorkflowSeq(tx: any, accountingEventId: string) {
  const last = await tx.investmentAccountingJournalWorkflow.findFirst({
    where: { accountingEventId },
    orderBy: { sequenceNo: "desc" },
  });
  return (last?.sequenceNo || 0) + 1;
}

async function eventAccess(eventId: string, userId: string, user: any) {
  const event = await db.investmentAccountingEvent.findUnique({
    where: { id: eventId },
    include: { journalWorkflows: { orderBy: { sequenceNo: "asc" } }, reversals: true },
  });
  if (!event) fail("ACCOUNTING_EVENT_NOT_FOUND", "Accounting event not found", 404);
  await ListedEquityAccessService.assertFundAccess(userId, event.fundId, user);
  return event;
}

function serializeEvent(event: any) {
  if (!event) return event;
  return {
    ...event,
    amount: event.amount != null ? String(event.amount) : null,
  };
}

export class InvestmentAccountingFacadeService {
  static async recordFromTradeSettlement(
    fundId: string,
    tradeId: string,
    tradeRef: string,
    journalEntryId: string,
    realizedPnl: number | null,
    tx: any = db
  ) {
    const trade = await tx.listedEquityTrade.findUnique({ where: { id: tradeId } });
    if (!trade) return;
    const amount =
      realizedPnl != null
        ? Math.abs(realizedPnl)
        : Number(trade.quantity) * Number(trade.executionPrice);
    return tx.investmentAccountingEvent.upsert({
      where: { id: `${tradeId}-gl` },
      create: {
        id: `${tradeId}-gl`,
        fundId,
        sourceType: "LISTED_EQUITY_TRADE",
        sourceId: tradeId,
        eventType: trade.side === "BUY" ? "PURCHASE" : "SALE",
        status: "POSTED",
        journalEntryId,
        tradeRef,
        amount,
        currencyCode: trade.executionCurrencyCode,
        postedAt: new Date(),
        idempotencyKey: `settle-gl:${tradeId}`,
      },
      update: {
        status: "POSTED",
        journalEntryId,
        postedAt: new Date(),
      },
    });
  }

  /** Phase 2 order settlement → durable accounting event (journal optional until GL mapping exists). */
  static async recordFromOrderSettlement(params: {
    fundId: string;
    orderId: string;
    orderRef: string;
    amount?: unknown;
    currencyCode?: string;
    idempotencyKey: string;
    userId: string;
  }) {
    const existing = await db.investmentAccountingEvent.findUnique({
      where: { idempotencyKey: params.idempotencyKey },
    });
    if (existing) return serializeEvent(existing);

    const event = await db.investmentAccountingEvent.create({
      data: {
        fundId: params.fundId,
        sourceType: "INVESTMENT_ORDER",
        sourceId: params.orderId,
        eventType: "SETTLEMENT",
        status: "NOT_POSTED",
        tradeRef: params.orderRef,
        amount: params.amount != null ? dec(params.amount) : null,
        currencyCode: params.currencyCode || null,
        idempotencyKey: params.idempotencyKey,
      },
    });
    await InvestmentOpsAuditService.log(
      "ORDER_SETTLEMENT_ACCOUNTING_RECORDED",
      "InvestmentAccountingEvent",
      event.id,
      { orderId: params.orderId, orderRef: params.orderRef },
      params.userId
    );
    return serializeEvent(event);
  }

  /**
   * Atomic settlement helper used by ListedEquityGlPostingService:
   * holdings already applied upstream; this commits JE lines + settlement + event + optional cash/txn.
   */
  static async commitSettlementBundle(params: {
    tradeId: string;
    hopId: string;
    userId: string;
    journalEntryId: string;
    realizedPnl: number | null;
    lines: Array<{
      chartOfAccountId: string;
      debitAmount: number | string;
      creditAmount: number | string;
      description: string;
    }>;
  }) {
    const trade = await db.listedEquityTrade.findUnique({ where: { id: params.tradeId } });
    if (!trade) fail("TRADE_NOT_FOUND", "Trade not found", 404);
    await assertPeriodOpen(new Date());

    const balance = journalBalance(params.lines);
    if (!balance.balanced) {
      fail("JOURNAL_UNBALANCED", "Settlement journal is unbalanced", 422, {
        debit: balance.debit.toString(),
        credit: balance.credit.toString(),
      });
    }

    return db.$transaction(async (tx: any) => {
      for (const line of params.lines) {
        await tx.journalEntryLine.create({
          data: {
            journalEntryId: params.journalEntryId,
            chartOfAccountId: line.chartOfAccountId,
            debitAmount: line.debitAmount,
            creditAmount: line.creditAmount,
            description: line.description,
          },
        });
      }

      await tx.listedEquityTradeSettlement.upsert({
        where: { tradeId: params.tradeId },
        create: {
          tradeId: params.tradeId,
          journalEntryId: params.journalEntryId,
          realizedPnl: params.realizedPnl,
        },
        update: { journalEntryId: params.journalEntryId, realizedPnl: params.realizedPnl },
      });
      await tx.listedEquityTradeRoutingHop.update({
        where: { id: params.hopId },
        data: { status: "CONFIRMED", confirmedAt: new Date() },
      });
      await tx.listedEquityTrade.update({
        where: { id: params.tradeId },
        data: { status: "SETTLED", settledAt: new Date() },
      });

      const gross = dec(trade.quantity).mul(dec(trade.executionPrice));
      const fees = dec(trade.fees);
      const net =
        trade.side === "BUY" ? gross.plus(fees) : gross.minus(fees);
      const txn = await tx.investmentTransaction.upsert({
        where: { idempotencyKey: `trade-settle:${params.tradeId}` },
        create: {
          transactionRef: `TXN-${trade.tradeRef}`,
          fundId: trade.fundId,
          transactionType: trade.side === "BUY" ? "BUY" : "SELL",
          tradeDate: trade.tradeDate || new Date(),
          settlementDate: new Date(),
          quantity: trade.quantity,
          unitPrice: trade.executionPrice,
          grossAmount: gross,
          netAmount: net,
          currencyCode: trade.executionCurrencyCode,
          status: "SETTLED",
          idempotencyKey: `trade-settle:${params.tradeId}`,
        },
        update: { status: "SETTLED", settlementDate: new Date() },
      });

      const portfolioConfig = await tx.investmentPortfolioConfig.findUnique({
        where: { fundId: trade.fundId },
      });
      if (portfolioConfig) {
        const cashAccount = await tx.investmentCashAccount.findFirst({
          where: {
            portfolioConfigId: portfolioConfig.id,
            currencyCode: trade.executionCurrencyCode,
            status: "ACTIVE",
          },
        });
        if (cashAccount) {
          const cashAmount = trade.side === "BUY" ? net.neg() : net;
          await tx.investmentCashLedgerEntry.upsert({
            where: { idempotencyKey: `cash-settle:${params.tradeId}` },
            create: {
              cashAccountId: cashAccount.id,
              transactionId: txn.id,
              entryType: trade.side === "BUY" ? "DEBIT" : "CREDIT",
              amount: cashAmount,
              currencyCode: trade.executionCurrencyCode,
              effectiveAt: new Date(),
              idempotencyKey: `cash-settle:${params.tradeId}`,
            },
            update: { amount: cashAmount },
          });
        }
      }

      await this.recordFromTradeSettlement(
        trade.fundId,
        params.tradeId,
        trade.tradeRef,
        params.journalEntryId,
        params.realizedPnl,
        tx
      );

      return {
        journal: await tx.journalEntry.findUnique({
          where: { id: params.journalEntryId },
          include: { journalEntryLines: true },
        }),
        transactionId: txn.id,
      };
    }, { maxWait: 10_000, timeout: 30_000 });

    await InvestmentOpsAuditService.log(
      "TRADE_SETTLEMENT_BUNDLE_POSTED",
      "ListedEquityTrade",
      params.tradeId,
      {
        journalEntryId: params.journalEntryId,
        hopId: params.hopId,
        transactionId: result.transactionId,
      },
      params.userId
    );
    return result.journal;
  }

  static async listEvents(
    userId: string,
    user: any,
    filters: { fundId?: string; status?: string; page?: number; pageSize?: number }
  ) {
    const scope = await ListedEquityAccessService.getAccessibleFundIds(userId, user);
    const where: any = await ListedEquityAccessService.accessibleFundIdFilter(
      userId,
      user,
      filters.fundId
    );
    if (filters.status) where.status = filters.status;

    const { page, pageSize, skip, take } = parsePagination(filters as any);
    const [events, total] = await Promise.all([
      db.investmentAccountingEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      db.investmentAccountingEvent.count({ where }),
    ]);

    if (events.length === 0 && page === 1) {
      const backfill = await this.backfillFromSettlements(scope, filters);
      return paginatedResult(
        backfill.slice(0, take).map(serializeEvent),
        backfill.length,
        page,
        pageSize
      );
    }
    return paginatedResult(events.map(serializeEvent), total, page, pageSize);
  }

  /** Accounting → Posting Statuses tab aggregate. */
  static async postingStatus(
    userId: string,
    user: any,
    filters: { fundId?: string } = {}
  ) {
    const where: any = await ListedEquityAccessService.accessibleFundIdFilter(
      userId,
      user,
      filters.fundId
    );
    const groups = await db.investmentAccountingEvent.groupBy({
      by: ["status"],
      where,
      _count: { id: true },
    });
    const byStatus: Record<string, number> = {
      POSTED: 0,
      PENDING: 0,
      NOT_POSTED: 0,
      FAILED: 0,
      REVERSED: 0,
    };
    for (const g of groups) {
      const key = String(g.status || "UNKNOWN");
      byStatus[key] = (byStatus[key] || 0) + Number(g._count.id);
    }
    // Map NOT_POSTED into PENDING for UI chips that expect PENDING
    if (!byStatus.PENDING && byStatus.NOT_POSTED) {
      byStatus.PENDING = byStatus.NOT_POSTED;
    }
    const recentFailures = await db.investmentAccountingEvent.findMany({
      where: { ...where, status: "FAILED" },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return {
      fundId: filters.fundId || null,
      byStatus,
      counts: byStatus,
      total: Object.values(byStatus).reduce((a, b) => a + b, 0),
      recentFailures: recentFailures.map(serializeEvent),
    };
  }

  static async getEvent(eventId: string, userId: string, user: any) {
    return serializeEvent(await eventAccess(eventId, userId, user));
  }

  static async retryEvent(eventId: string, idempotencyKey: string, userId: string, user: any) {
    const event = await eventAccess(eventId, userId, user);
    if (!["FAILED", "NOT_POSTED"].includes(event.status)) {
      fail("EVENT_NOT_RETRYABLE", "Only failed or unposted events can be retried", 409, {
        status: event.status,
      });
    }
    const existing = await db.investmentAccountingJournalWorkflow.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return serializeEvent(await eventAccess(eventId, userId, user));

    await db.$transaction(async (tx: any) => {
      const sequenceNo = await nextWorkflowSeq(tx, eventId);
      await tx.investmentAccountingJournalWorkflow.create({
        data: {
          accountingEventId: eventId,
          journalEntryId: event.journalEntryId,
          workflowStatus: "RETRY_QUEUED",
          sequenceNo,
          action: "RETRY",
          actorId: userId,
          idempotencyKey,
        },
      });
      await tx.investmentAccountingEvent.update({
        where: { id: eventId },
        data: { status: "NOT_POSTED", version: { increment: 1 } },
      });
    });
    await InvestmentOpsAuditService.log(
      "ACCOUNTING_EVENT_RETRY",
      "AccountingEvent",
      eventId,
      {},
      userId
    );
    return serializeEvent(await eventAccess(eventId, userId, user));
  }

  static async backfillFromSettlements(
    scope: string[] | "ALL",
    filters: { fundId?: string; status?: string }
  ) {
    const tradeWhere: any = {};
    if (filters.fundId) tradeWhere.fundId = filters.fundId;
    else if (scope !== "ALL") tradeWhere.fundId = { in: scope };

    const settlements = await db.listedEquityTradeSettlement.findMany({
      where: {
        journalEntryId: { not: null },
        ...(Object.keys(tradeWhere).length ? { trade: tradeWhere } : {}),
      },
      include: { trade: true },
      take: 200,
      orderBy: { createdAt: "desc" },
    });

    return settlements.map((s: any) => ({
      id: s.id,
      fundId: s.trade.fundId,
      sourceType: "LISTED_EQUITY_TRADE",
      sourceId: s.tradeId,
      eventType: s.trade.side === "BUY" ? "PURCHASE" : "SALE",
      status: "POSTED",
      journalEntryId: s.journalEntryId,
      tradeRef: s.trade.tradeRef,
      amount:
        s.realizedPnl != null
          ? Math.abs(Number(s.realizedPnl))
          : Number(s.trade.quantity) * Number(s.trade.executionPrice),
      currencyCode: s.trade.executionCurrencyCode,
      postedAt: s.updatedAt,
      createdAt: s.createdAt,
    }));
  }

  static async listJournals(userId: string, user: any, query: any = {}) {
    const result = await this.listEvents(userId, user, {
      fundId: query.fundId,
      status: query.status,
      page: query.page,
      pageSize: query.pageSize || 100,
    });
    const events = result.items ?? result;
    const jeIds = [
      ...new Set(
        (Array.isArray(events) ? events : [])
          .map((e: any) => e.journalEntryId)
          .filter(Boolean)
      ),
    ] as string[];
    if (!jeIds.length) return paginatedResult([], 0, 1, 50);
    const journals = await db.journalEntry.findMany({
      where: { id: { in: jeIds } },
      include: { journalEntryLines: { include: { chartOfAccount: true } } },
      orderBy: { transactionDate: "desc" },
    });
    return journals.map((j: any) => ({
      ...j,
      totalAmount: j.totalAmount != null ? String(j.totalAmount) : null,
      journalEntryLines: j.journalEntryLines?.map((l: any) => ({
        ...l,
        debitAmount: String(l.debitAmount ?? 0),
        creditAmount: String(l.creditAmount ?? 0),
      })),
    }));
  }

  static async getJournal(id: string, userId: string, user: any) {
    await ListedEquityAccessService.assertObjectFundAccess(
      userId,
      user,
      "Investment journal",
      id,
      async () =>
        (
          await db.investmentAccountingEvent.findFirst({
            where: { journalEntryId: id },
            select: { fundId: true },
          })
        )?.fundId
    );
    const journal = await db.journalEntry.findUnique({
      where: { id },
      include: {
        journalEntryLines: { include: { chartOfAccount: true } },
        currency: true,
      },
    });
    if (!journal) fail("JOURNAL_NOT_FOUND", "Journal not found", 404);
    const balance = journalBalance(journal.journalEntryLines || []);
    return {
      ...journal,
      totalAmount: journal.totalAmount != null ? String(journal.totalAmount) : null,
      debitTotal: balance.debit.toString(),
      creditTotal: balance.credit.toString(),
      balanced: balance.balanced,
      journalEntryLines: journal.journalEntryLines?.map((l: any) => ({
        ...l,
        debitAmount: String(l.debitAmount ?? 0),
        creditAmount: String(l.creditAmount ?? 0),
      })),
    };
  }

  static async journalWorkflow(
    journalId: string,
    action: "SUBMIT" | "APPROVE" | "REJECT" | "POST",
    idempotencyKey: string,
    userId: string,
    user: any,
    reason?: string
  ) {
    const event = await db.investmentAccountingEvent.findFirst({
      where: { journalEntryId: journalId },
    });
    if (!event) fail("ACCOUNTING_EVENT_NOT_FOUND", "No accounting event for journal", 404);
    await ListedEquityAccessService.assertFundAccess(userId, event.fundId, user);

    const replay = await db.investmentAccountingJournalWorkflow.findUnique({
      where: { idempotencyKey },
    });
    if (replay) return this.getJournal(journalId, userId, user);

    const journal = await db.journalEntry.findUnique({
      where: { id: journalId },
      include: { journalEntryLines: true },
    });
    if (!journal) fail("JOURNAL_NOT_FOUND", "Journal not found", 404);

    if (action === "POST") {
      if (journal.status === "POSTED") return this.getJournal(journalId, userId, user);
      await assertPeriodOpen(journal.transactionDate || new Date());
      const balance = journalBalance(journal.journalEntryLines || []);
      if (!balance.balanced) {
        fail("JOURNAL_UNBALANCED", "Unbalanced journals cannot post", 422, {
          debit: balance.debit.toString(),
          credit: balance.credit.toString(),
        });
      }
    }

    const statusMap: Record<string, string> = {
      SUBMIT: "SUBMITTED",
      APPROVE: "APPROVED",
      REJECT: "REJECTED",
      POST: "POSTED",
    };
    const workflowStatus = statusMap[action];

    await db.$transaction(async (tx: any) => {
      if (journal.status === "POSTED" && action !== "POST") {
        fail("JOURNAL_IMMUTABLE", "Posted journals cannot be edited", 409);
      }
      const sequenceNo = await nextWorkflowSeq(tx, event.id);
      await tx.investmentAccountingJournalWorkflow.create({
        data: {
          accountingEventId: event.id,
          journalEntryId: journalId,
          workflowStatus,
          sequenceNo,
          action,
          actorId: userId,
          reason: reason || null,
          idempotencyKey,
        },
      });
      if (action === "POST") {
        await tx.journalEntry.update({
          where: { id: journalId },
          data: { status: "POSTED" },
        });
        await tx.investmentAccountingEvent.update({
          where: { id: event.id },
          data: { status: "POSTED", postedAt: new Date(), version: { increment: 1 } },
        });
      } else if (action === "REJECT") {
        await tx.journalEntry.update({
          where: { id: journalId },
          data: { status: "DRAFT" },
        });
        await tx.investmentAccountingEvent.update({
          where: { id: event.id },
          data: { status: "REJECTED", version: { increment: 1 } },
        });
      } else {
        await tx.journalEntry.update({
          where: { id: journalId },
          data: { status: workflowStatus === "APPROVED" ? "APPROVED" : "PENDING_APPROVAL" },
        });
        await tx.investmentAccountingEvent.update({
          where: { id: event.id },
          data: {
            status: workflowStatus === "APPROVED" ? "APPROVED" : "PENDING_APPROVAL",
            version: { increment: 1 },
          },
        });
      }
    });

    await InvestmentOpsAuditService.log(
      `ACCOUNTING_JOURNAL_${action}`,
      "JournalEntry",
      journalId,
      { reason },
      userId
    );
    return this.getJournal(journalId, userId, user);
  }

  static async listReversals(userId: string, user: any, query: any = {}) {
    const where: any = {};
    if (query.fundId) {
      await ListedEquityAccessService.assertFundAccess(userId, query.fundId, user);
      where.accountingEvent = { fundId: query.fundId };
    } else {
      const scope = await ListedEquityAccessService.getAccessibleFundIds(userId, user);
      if (scope !== "ALL") where.accountingEvent = { fundId: { in: scope } };
    }
    if (query.status) where.status = query.status;
    const page = parsePagination(query);
    const [rows, total] = await Promise.all([
      db.investmentAccountingReversal.findMany({
        where,
        include: { accountingEvent: true },
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.take,
      }),
      db.investmentAccountingReversal.count({ where }),
    ]);
    return paginatedResult(rows, total, page.page, page.pageSize);
  }

  static async requestReversal(
    eventId: string,
    reason: string,
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    const event = await eventAccess(eventId, userId, user);
    if (!event.journalEntryId) fail("NO_JOURNAL", "No journal to reverse", 422);
    if (event.status === "REVERSED") fail("ALREADY_REVERSED", "Event already reversed", 409);
    if (!reason?.trim()) fail("VALIDATION_ERROR", "reason is required");

    const existing = await db.investmentAccountingReversal.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return existing;

    const reversal = await db.investmentAccountingReversal.create({
      data: {
        accountingEventId: eventId,
        originalJournalEntryId: event.journalEntryId,
        status: "REQUESTED",
        reason,
        requestedById: userId,
        idempotencyKey,
      },
    });
    await InvestmentOpsAuditService.log(
      "ACCOUNTING_REVERSAL_REQUESTED",
      "AccountingReversal",
      reversal.id,
      { eventId, reason },
      userId
    );
    return reversal;
  }

  /** Legacy immediate reverse — creates request then auto-approves for backward compat when approve path used */
  static async reverseEvent(eventId: string, userId: string, user: any, reason: string) {
    const key = `legacy-reverse:${eventId}:${Date.now()}`;
    const reversal = await this.requestReversal(eventId, reason, key, userId, user);
    return this.approveReversal(reversal.id, `approve-${key}`, userId, user, reason);
  }

  static async approveReversal(
    reversalId: string,
    idempotencyKey: string,
    userId: string,
    user: any,
    reason?: string
  ) {
    const reversal = await db.investmentAccountingReversal.findUnique({
      where: { id: reversalId },
      include: { accountingEvent: true },
    });
    if (!reversal) fail("REVERSAL_NOT_FOUND", "Reversal not found", 404);
    await ListedEquityAccessService.assertFundAccess(
      userId,
      reversal.accountingEvent.fundId,
      user
    );
    if (reversal.status === "APPROVED") return reversal;
    if (reversal.status !== "REQUESTED") {
      fail("REVERSAL_NOT_APPROVABLE", "Reversal is not awaiting approval", 409);
    }
    if (reversal.requestedById && reversal.requestedById === userId) {
      assertFourEyeSeparation(
        reversal.requestedById,
        userId,
        user,
        "Requester cannot approve their own reversal"
      );
    }

    const original = await db.journalEntry.findUnique({
      where: { id: reversal.originalJournalEntryId },
      include: { journalEntryLines: true },
    });
    if (!original) fail("JOURNAL_NOT_FOUND", "Original journal entry not found", 404);
    await assertPeriodOpen(original.transactionDate || new Date());

    const result = await db.$transaction(async (tx: any) => {
      let reversalJournalEntryId: string | null = null;
      if (original.status === "POSTED" && original.journalEntryLines?.length) {
        const created = await createJournalEntryWithAuditSequence({
          transactionDate: new Date(),
          referenceNumber: `VR-${original.referenceNumber}`,
          description: `REVERSAL of ${original.referenceNumber}: ${reason || reversal.reason}`,
          totalAmount: original.totalAmount,
          currencyId: original.currencyId,
          status: "POSTED",
          createdById: userId,
        });
        for (const line of original.journalEntryLines) {
          await tx.journalEntryLine.create({
            data: {
              journalEntryId: created.id,
              chartOfAccountId: line.chartOfAccountId,
              debitAmount: line.creditAmount,
              creditAmount: line.debitAmount,
              description: `REVERSAL: ${line.description}`,
              vatAmount: line.vatAmount || null,
            },
          });
        }
        reversalJournalEntryId = created.id;
      }

      const updated = await tx.investmentAccountingReversal.update({
        where: { id: reversalId },
        data: {
          status: "APPROVED",
          approvedById: userId,
          approvedAt: new Date(),
          reversalJournalEntryId,
        },
      });
      await tx.investmentAccountingEvent.update({
        where: { id: reversal.accountingEventId },
        data: {
          status: "REVERSED",
          reversalJournalEntryId,
          version: { increment: 1 },
        },
      });
      return updated;
    });

    await InvestmentOpsAuditService.log(
      "ACCOUNTING_REVERSAL_APPROVED",
      "AccountingReversal",
      reversalId,
      { reason },
      userId
    );
    return result;
  }

  static async rejectReversal(
    reversalId: string,
    idempotencyKey: string,
    userId: string,
    user: any,
    reason?: string
  ) {
    const reversal = await db.investmentAccountingReversal.findUnique({
      where: { id: reversalId },
      include: { accountingEvent: true },
    });
    if (!reversal) fail("REVERSAL_NOT_FOUND", "Reversal not found", 404);
    await ListedEquityAccessService.assertFundAccess(
      userId,
      reversal.accountingEvent.fundId,
      user
    );
    if (reversal.status !== "REQUESTED") {
      fail("REVERSAL_NOT_REJECTABLE", "Reversal is not awaiting approval", 409);
    }
    const updated = await db.investmentAccountingReversal.update({
      where: { id: reversalId },
      data: { status: "REJECTED", approvedById: userId, approvedAt: new Date() },
    });
    await InvestmentOpsAuditService.log(
      "ACCOUNTING_REVERSAL_REJECTED",
      "AccountingReversal",
      reversalId,
      { reason, idempotencyKey },
      userId
    );
    return updated;
  }

  static async serializeLedgerExport(link: any, fundNameById?: Map<string, string>) {
    const fundId = link.accountingEvent?.fundId ?? link.fundId ?? null;
    const fundName =
      link.fundName ??
      (fundId && fundNameById?.get(fundId)) ??
      (fundId
        ? (await db.fund.findUnique({ where: { id: fundId }, select: { name: true } }))?.name
        : null);
    return {
      id: link.id,
      exportBatchRef: link.exportBatchRef,
      reference: link.exportBatchRef,
      batchRef: link.exportBatchRef,
      fundId,
      fundName,
      portfolio: fundName,
      status: link.status,
      exportSystem: link.exportSystem,
      exportedAt: link.exportedAt,
      createdAt: link.createdAt,
      payloadHash: link.payloadHash,
    };
  }

  static async createLedgerExport(
    data: { fundId: string; from?: string; to?: string; exportSystem?: string; format?: string },
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    const fundId = String(data.fundId || "").trim();
    if (!fundId) fail("VALIDATION_ERROR", "fundId is required");
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);

    const existing = await db.investmentAccountingExportLink.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return this.getLedgerExport(existing.id, userId, user);

    const fund = await db.fund.findUnique({ where: { id: fundId }, select: { name: true } });
    const fundName = fund?.name ?? fundId;

    const where: any = { fundId, status: "POSTED" };
    if (data.from || data.to) {
      where.postedAt = {};
      if (data.from) where.postedAt.gte = new Date(data.from);
      if (data.to) {
        const to = new Date(data.to);
        to.setUTCHours(23, 59, 59, 999);
        where.postedAt.lte = to;
      }
    }
    const events = await db.investmentAccountingEvent.findMany({
      where,
      orderBy: { postedAt: "asc" },
      take: 500,
    });

    const journalIds = [
      ...new Set(events.map((e: any) => e.journalEntryId).filter(Boolean)),
    ] as string[];
    const journals = journalIds.length
      ? await db.journalEntry.findMany({
          where: { id: { in: journalIds } },
          include: {
            journalEntryLines: { include: { chartOfAccount: true } },
          },
        })
      : [];
    const journalById = new Map(journals.map((j: any) => [j.id, j]));

    const exportSystem = data.exportSystem || "INVESTMENT_OPS_LEDGER";
    const exportBatchRef = `LEX-${Date.now().toString(36).toUpperCase()}`;
    const csvRows: Array<Record<string, unknown>> = [];

    for (const event of events) {
      const journal = event.journalEntryId ? journalById.get(event.journalEntryId) : null;
      const base = {
        export_batch_ref: exportBatchRef,
        portfolio: fundName,
        event_id: event.id,
        event_type: event.eventType,
        source_type: event.sourceType,
        trade_ref: event.tradeRef ?? "",
        posted_at: event.postedAt ? new Date(event.postedAt).toISOString() : "",
        currency: event.currencyCode ?? "",
        amount: event.amount != null ? String(event.amount) : "",
        journal_ref: journal?.referenceNumber ?? "",
      };
      const lines = journal?.journalEntryLines ?? [];
      if (!lines.length) {
        csvRows.push({
          ...base,
          account_no: "",
          account_name: "",
          debit: "",
          credit: "",
          line_description: "",
        });
        continue;
      }
      for (const line of lines) {
        csvRows.push({
          ...base,
          account_no: line.chartOfAccount?.accountNo ?? "",
          account_name: line.chartOfAccount?.accountName ?? "",
          debit: line.debitAmount != null ? String(line.debitAmount) : "0",
          credit: line.creditAmount != null ? String(line.creditAmount) : "0",
          line_description: line.description ?? "",
        });
      }
    }

    const csvContent = buildLedgerExportCsv(exportBatchRef, fundName, csvRows);
    const payloadHash = createHash("sha256").update(csvContent).digest("hex");

    const dir = path.join(process.cwd(), "storage", "local-upload-mock", "investment-ops-ledger-exports");
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${exportBatchRef}.csv`);
    await writeFile(filePath, csvContent, "utf8");

    const anchorEventId =
      events[0]?.id ||
      (
        await db.investmentAccountingEvent.create({
          data: {
            fundId,
            sourceType: "LEDGER_EXPORT",
            sourceId: exportBatchRef,
            eventType: "EXPORT",
            status: "POSTED",
            postedAt: new Date(),
            idempotencyKey: `export-anchor:${idempotencyKey}`,
          },
        })
      ).id;

    const link = await db.investmentAccountingExportLink.create({
      data: {
        accountingEventId: anchorEventId,
        exportSystem,
        exportBatchRef,
        externalRef: filePath,
        status: "COMPLETED",
        payloadHash,
        exportedAt: new Date(),
        idempotencyKey,
      },
    });

    for (const event of events.slice(1, 50)) {
      try {
        await db.investmentAccountingExportLink.create({
          data: {
            accountingEventId: event.id,
            exportSystem,
            exportBatchRef,
            status: "COMPLETED",
            payloadHash,
            exportedAt: new Date(),
            idempotencyKey: `${idempotencyKey}:${event.id}`,
          },
        });
      } catch {
        /* ignore unique conflicts */
      }
    }

    await InvestmentOpsAuditService.log(
      "LEDGER_EXPORT_CREATED",
      "AccountingExport",
      link.id,
      { fundId, fundName, exportBatchRef, eventCount: events.length, lineCount: csvRows.length },
      userId
    );
    return this.getLedgerExport(link.id, userId, user);
  }

  static async listLedgerExports(userId: string, user: any, query: any = {}) {
    const page = parsePagination(query);
    const where: any = {};
    if (query.fundId) {
      await ListedEquityAccessService.assertFundAccess(userId, query.fundId, user);
      where.accountingEvent = { fundId: query.fundId };
    }
    if (query.status) where.status = query.status;
    const [rows, total] = await Promise.all([
      db.investmentAccountingExportLink.findMany({
        where,
        include: { accountingEvent: { select: { fundId: true } } },
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.take,
      }),
      db.investmentAccountingExportLink.count({ where }),
    ]);
    const fundIds = [
      ...new Set(rows.map((r: any) => r.accountingEvent?.fundId).filter(Boolean)),
    ] as string[];
    const funds = fundIds.length
      ? await db.fund.findMany({ where: { id: { in: fundIds } }, select: { id: true, name: true } })
      : [];
    const fundNameById = new Map(funds.map((f: any) => [f.id, f.name]));

    const seen = new Set<string>();
    const unique = [];
    for (const row of rows) {
      const key = `${row.exportSystem}:${row.exportBatchRef}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(await this.serializeLedgerExport(row, fundNameById));
    }
    return paginatedResult(unique, total, page.page, page.pageSize);
  }

  static async getLedgerExport(exportId: string, userId: string, user: any) {
    const link = await db.investmentAccountingExportLink.findUnique({
      where: { id: exportId },
      include: { accountingEvent: { select: { fundId: true } } },
    });
    if (!link) fail("EXPORT_NOT_FOUND", "Ledger export not found", 404);
    await ListedEquityAccessService.assertFundAccess(userId, link.accountingEvent.fundId, user);
    return this.serializeLedgerExport(link);
  }

  static async downloadLedgerExport(exportId: string, userId: string, user: any) {
    const link = await db.investmentAccountingExportLink.findUnique({
      where: { id: exportId },
      include: { accountingEvent: { select: { fundId: true } } },
    });
    if (!link) fail("EXPORT_NOT_FOUND", "Ledger export not found", 404);
    await ListedEquityAccessService.assertFundAccess(userId, link.accountingEvent.fundId, user);

    const root = path.resolve(
      process.cwd(),
      "storage",
      "local-upload-mock",
      "investment-ops-ledger-exports"
    );
    let resolved = link.externalRef ? path.resolve(link.externalRef) : "";
    if (!resolved.startsWith(root)) {
      resolved = path.join(root, `${link.exportBatchRef || exportId}.csv`);
    }
    await mkdir(root, { recursive: true });
    let content: Buffer;
    try {
      content = await readFile(resolved);
    } catch {
      const fund = link.accountingEvent?.fundId
        ? await db.fund.findUnique({
            where: { id: link.accountingEvent.fundId },
            select: { name: true },
          })
        : null;
      const csvContent = buildLedgerExportCsv(link.exportBatchRef || exportId, fund?.name ?? "", []);
      content = Buffer.from(csvContent, "utf8");
      await writeFile(resolved, content);
      if (!link.externalRef) {
        await db.investmentAccountingExportLink.update({
          where: { id: exportId },
          data: { externalRef: resolved },
        });
      }
    }
    const isCsv = resolved.toLowerCase().endsWith(".csv");
    return {
      fileName: `${link.exportBatchRef || exportId}.${isCsv ? "csv" : "json"}`,
      contentType: isCsv ? "text/csv; charset=utf-8" : "application/json",
      content,
      payloadHash: link.payloadHash,
    };
  }
}
