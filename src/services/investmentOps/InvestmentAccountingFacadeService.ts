// @ts-nocheck
import { prisma } from "../../utils/database";
import { createJournalEntryWithAuditSequence } from "../AuditTrailSequenceService";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { InvestmentOpsAuditService } from "./InvestmentOpsAuditService";
import { paginatedResult, parsePagination } from "./investmentOpsSupport";

export class InvestmentAccountingFacadeService {
  static async recordFromTradeSettlement(
    fundId: string,
    tradeId: string,
    tradeRef: string,
    journalEntryId: string,
    realizedPnl: number | null
  ) {
    const trade = await prisma.listedEquityTrade.findUnique({ where: { id: tradeId } });
    if (!trade) return;
    const amount =
      realizedPnl != null
        ? Math.abs(realizedPnl)
        : Number(trade.quantity) * Number(trade.executionPrice);
    return prisma.investmentAccountingEvent.upsert({
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
      },
      update: {
        status: "POSTED",
        journalEntryId,
        postedAt: new Date(),
      },
    });
  }

  static async listEvents(
    userId: string,
    user: any,
    filters: { fundId?: string; status?: string; page?: number; pageSize?: number }
  ) {
    const scope = await ListedEquityAccessService.getAccessibleFundIds(userId, user);
    const where: any = {};
    if (filters.fundId) where.fundId = filters.fundId;
    else if (scope !== "ALL") where.fundId = { in: scope };
    if (filters.status) where.status = filters.status;

    const { page, pageSize, skip, take } = parsePagination(filters);
    const [events, total] = await Promise.all([
      prisma.investmentAccountingEvent.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.investmentAccountingEvent.count({ where }),
    ]);

    if (events.length === 0 && page === 1) {
      const backfill = await this.backfillFromSettlements(scope, filters);
      return paginatedResult(backfill.slice(0, take), backfill.length, page, pageSize);
    }
    return paginatedResult(events, total, page, pageSize);
  }

  static async backfillFromSettlements(scope: string[] | "ALL", filters: { fundId?: string; status?: string }) {
    const tradeWhere: any = {};
    if (filters.fundId) tradeWhere.fundId = filters.fundId;
    else if (scope !== "ALL") tradeWhere.fundId = { in: scope };

    const settlements = await prisma.listedEquityTradeSettlement.findMany({
      where: {
        journalEntryId: { not: null },
        ...(Object.keys(tradeWhere).length ? { trade: tradeWhere } : {}),
      },
      include: { trade: true },
      take: 200,
      orderBy: { createdAt: "desc" },
    });

    return settlements.map((s) => ({
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

  static async listJournals(userId: string, user: any, fundId?: string) {
    const result = await this.listEvents(userId, user, { fundId, status: "POSTED", pageSize: 200 });
    const events = result.items ?? result;
    const jeIds = [...new Set((Array.isArray(events) ? events : []).map((e: any) => e.journalEntryId).filter(Boolean))] as string[];
    if (!jeIds.length) return [];
    return prisma.journalEntry.findMany({
      where: { id: { in: jeIds } },
      include: { journalEntryLines: { include: { chartOfAccount: true } } },
      orderBy: { transactionDate: "desc" },
    });
  }

  static async getJournal(id: string) {
    return prisma.journalEntry.findUnique({
      where: { id },
      include: {
        journalEntryLines: { include: { chartOfAccount: true } },
        currency: true,
      },
    });
  }

  static async reverseEvent(eventId: string, userId: string, reason: string) {
    const event = await prisma.investmentAccountingEvent.findUnique({ where: { id: eventId } });
    if (!event?.journalEntryId) throw new Error("No journal to reverse");
    if (event.status === "REVERSED") throw new Error("Event already reversed");

    const original = await prisma.journalEntry.findUnique({
      where: { id: event.journalEntryId },
      include: { journalEntryLines: true },
    });
    if (!original) throw new Error("Original journal entry not found");

    let reversalJournalEntryId: string | null = null;
    if (original.status === "POSTED" && original.journalEntryLines?.length) {
      const reversal = await createJournalEntryWithAuditSequence({
        transactionDate: new Date(),
        referenceNumber: `VR-${original.referenceNumber}`,
        description: `REVERSAL of ${original.referenceNumber}: ${reason}`,
        totalAmount: original.totalAmount,
        currencyId: original.currencyId,
        status: "POSTED",
        createdById: userId,
      });
      for (const line of original.journalEntryLines) {
        await prisma.journalEntryLine.create({
          data: {
            journalEntryId: reversal.id,
            chartOfAccountId: line.chartOfAccountId,
            debitAmount: line.creditAmount,
            creditAmount: line.debitAmount,
            description: `REVERSAL: ${line.description}`,
            vatAmount: line.vatAmount || null,
          },
        });
      }
      reversalJournalEntryId = reversal.id;
    }

    await prisma.investmentAccountingEvent.update({
      where: { id: eventId },
      data: {
        status: "REVERSED",
        reversalJournalEntryId,
        updatedAt: new Date(),
      },
    });

    await InvestmentOpsAuditService.log(
      "ACCOUNTING_EVENT_REVERSED",
      "AccountingEvent",
      eventId,
      { reason, reversalJournalEntryId, originalJournalEntryId: event.journalEntryId },
      userId
    );

    return {
      eventId,
      journalEntryId: event.journalEntryId,
      reversalJournalEntryId,
      status: "REVERSED",
      reason,
      reversedBy: userId,
    };
  }
}
