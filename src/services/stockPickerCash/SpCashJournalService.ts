// @ts-nocheck
import { createHash, randomUUID } from "crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import {
  assertBalanced,
  assertMakerNotChecker,
  assertVersion,
  d,
  db,
  emitCash,
  moneyStr,
  paginated,
  parseDateOnly,
  parsePagination,
  requireStr,
  withIdempotency,
} from "./spCashSupport";

function lineData(line: any, currency: string, fallbackCashAccountId?: string) {
  const debit = d(line.debit ?? 0);
  const credit = d(line.credit ?? 0);
  // Canonical: >0 cash asset up, <0 down. Cash debit increases; cash credit decreases.
  const signed =
    line.signedCashAmount != null
      ? d(line.signedCashAmount)
      : debit.minus(credit);
  return {
    ledgerAccountCode: String(line.ledgerAccountCode || "CASH"),
    cashAccountId: line.cashAccountId || fallbackCashAccountId || null,
    beneficialOwnerId: line.beneficialOwnerId || null,
    debit,
    credit,
    signedCashAmount: signed,
    currency: String(line.currency || currency).toUpperCase(),
    description: line.description || null,
    matchStatus: line.matchStatus || "UNMATCHED",
    residualAmount: line.residualAmount != null ? d(line.residualAmount) : null,
  };
}

function presentJournal(row: any) {
  return {
    id: row.id,
    sourceSystem: row.sourceSystem,
    sourceEventId: row.sourceEventId,
    postingPurpose: row.postingPurpose,
    idempotencyKey: row.idempotencyKey,
    tradeDate: row.tradeDate,
    settlementDate: row.settlementDate,
    valueDate: row.valueDate,
    postingBusinessDate: row.postingBusinessDate,
    currency: row.currency,
    status: row.status,
    makerId: row.makerId,
    checkerId: row.checkerId,
    reversalOf: row.reversalOf,
    cashAccountId: row.cashAccountId,
    portfolioId: row.portfolioId,
    rejectReason: row.rejectReason,
    version: row.version,
    postedAt: row.postedAt,
    auditHash: row.auditHash,
    lines: (row.lines || []).map((l: any) => ({
      id: l.id,
      ledgerAccountCode: l.ledgerAccountCode,
      cashAccountId: l.cashAccountId,
      beneficialOwnerId: l.beneficialOwnerId,
      debit: moneyStr(l.debit),
      credit: moneyStr(l.credit),
      signedCashAmount: moneyStr(l.signedCashAmount),
      currency: l.currency,
      description: l.description,
      matchStatus: l.matchStatus,
      residualAmount: l.residualAmount != null ? moneyStr(l.residualAmount) : null,
      lineVersion: l.lineVersion,
    })),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export class SpCashJournalService {
  static async create(body: any, actorId: string, idempotencyKey?: string) {
    const linesIn = Array.isArray(body.lines) ? body.lines : [];
    assertBalanced(linesIn);

    const key =
      idempotencyKey ||
      body.idempotencyKey ||
      `${body.sourceEventId || randomUUID()}:${body.postingPurpose || "MANUAL"}`;

    return withIdempotency(
      "sp-cash:journal:create",
      key,
      { ...body, lines: linesIn },
      async () => {
        const currency = requireStr(body.currency, "currency").toUpperCase();
        const cashAccountId = body.cashAccountId || linesIn.find((l: any) => l.cashAccountId)?.cashAccountId;

        const created = await db.spCashJournal.create({
          data: {
            sourceSystem: requireStr(body.sourceSystem || "MANUAL", "sourceSystem"),
            sourceEventId: body.sourceEventId || null,
            postingPurpose: requireStr(body.postingPurpose || "MANUAL", "postingPurpose"),
            idempotencyKey: key,
            tradeDate: parseDateOnly(body.tradeDate),
            settlementDate: parseDateOnly(body.settlementDate),
            valueDate: parseDateOnly(body.valueDate),
            postingBusinessDate: parseDateOnly(body.postingBusinessDate),
            currency,
            status: "DRAFT",
            makerId: actorId,
            cashAccountId: cashAccountId || null,
            portfolioId: body.portfolioId || null,
            configurationVersion: body.configurationVersion ?? null,
            version: 1,
            lines: {
              create: linesIn.map((l: any) => lineData(l, currency, cashAccountId)),
            },
          },
          include: { lines: true },
        });

        await emitCash({
          eventType: "cash.journal.created",
          aggregateType: "SpCashJournal",
          aggregateId: created.id,
          aggregateVersion: created.version,
          actorId,
          payload: { status: "DRAFT", postingPurpose: created.postingPurpose },
        });
        return presentJournal(created);
      },
      201
    );
  }

  static async get(id: string) {
    const row = await db.spCashJournal.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Journal not found", 404);
    return presentJournal(row);
  }

  static async submit(id: string, body: any, actorId: string) {
    const row = await db.spCashJournal.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Journal not found", 404);
    if (!["DRAFT", "REJECTED"].includes(row.status)) {
      throw new InvestmentOpsError("INVALID_STATUS", `Cannot submit journal in ${row.status}`, 409);
    }
    if (row.status === "POSTED") {
      throw new InvestmentOpsError("JOURNAL_IMMUTABLE", "Posted journals cannot be modified", 409);
    }
    assertBalanced(row.lines);
    if (body?.expectedVersion != null) assertVersion(row, body.expectedVersion);

    const updated = await db.spCashJournal.update({
      where: { id },
      data: {
        status: "PENDING_APPROVAL",
        makerId: row.makerId || actorId,
        version: { increment: 1 },
      },
      include: { lines: true },
    });
    await emitCash({
      eventType: "cash.journal.submitted",
      aggregateType: "SpCashJournal",
      aggregateId: updated.id,
      aggregateVersion: updated.version,
      actorId,
    });
    return presentJournal(updated);
  }

  static async approve(id: string, body: any, actorId: string) {
    const result = await db.$transaction(
      async (tx: any) => {
        const row = await tx.spCashJournal.findUnique({
          where: { id },
          include: { lines: true },
        });
        if (!row) throw new InvestmentOpsError("NOT_FOUND", "Journal not found", 404);
        if (row.status === "POSTED") {
          // AT-02 idempotent: already posted
          return { already: true as const, journal: presentJournal(row) };
        }
        if (row.status !== "PENDING_APPROVAL") {
          throw new InvestmentOpsError(
            "INVALID_STATUS",
            `Cannot approve journal in ${row.status}`,
            409
          );
        }
        assertMakerNotChecker(row.makerId, actorId);
        if (body?.expectedVersion != null) assertVersion(row, body.expectedVersion);
        assertBalanced(row.lines);

        // AT-02: unique on sourceEventId+postingPurpose among POSTED
        if (row.sourceEventId) {
          const existing = await tx.spCashJournal.findFirst({
            where: {
              sourceEventId: row.sourceEventId,
              postingPurpose: row.postingPurpose,
              status: "POSTED",
              id: { not: row.id },
            },
            include: { lines: true },
          });
          if (existing) {
            return { already: true as const, journal: presentJournal(existing) };
          }
        }

        const auditHash = createHash("sha256")
          .update(
            JSON.stringify({
              id: row.id,
              lines: row.lines.map((l: any) => ({
                d: String(l.debit),
                c: String(l.credit),
                s: String(l.signedCashAmount),
                a: l.cashAccountId,
              })),
            })
          )
          .digest("hex");

        const updated = await tx.spCashJournal.update({
          where: { id },
          data: {
            status: "POSTED",
            checkerId: actorId,
            postedAt: new Date(),
            auditHash,
            version: { increment: 1 },
          },
          include: { lines: true },
        });
        return { already: false as const, journal: presentJournal(updated), sourceEventId: updated.sourceEventId, postingPurpose: updated.postingPurpose, currency: updated.currency, auditHash, version: updated.version, id: updated.id };
      },
      { maxWait: 15000, timeout: 30000 }
    );

    if (!result.already) {
      await emitCash({
        eventType: "cash.journal.posted",
        aggregateType: "SpCashJournal",
        aggregateId: result.id,
        aggregateVersion: result.version,
        actorId,
        payload: {
          sourceEventId: result.sourceEventId,
          postingPurpose: result.postingPurpose,
          currency: result.currency,
          auditHash: result.auditHash,
        },
      });
    }
    return result.journal;
  }

  static async reject(id: string, body: any, actorId: string) {
    const row = await db.spCashJournal.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!row) throw new InvestmentOpsError("NOT_FOUND", "Journal not found", 404);
    if (row.status === "POSTED") {
      throw new InvestmentOpsError("JOURNAL_IMMUTABLE", "Posted journals cannot be rejected", 409);
    }
    if (row.status !== "PENDING_APPROVAL") {
      throw new InvestmentOpsError("INVALID_STATUS", `Cannot reject journal in ${row.status}`, 409);
    }
    assertMakerNotChecker(row.makerId, actorId);
    if (body?.expectedVersion != null) assertVersion(row, body.expectedVersion);

    const updated = await db.spCashJournal.update({
      where: { id },
      data: {
        status: "REJECTED",
        rejectReason: body?.reason || null,
        checkerId: actorId,
        version: { increment: 1 },
      },
      include: { lines: true },
    });
    await emitCash({
      eventType: "cash.journal.rejected",
      aggregateType: "SpCashJournal",
      aggregateId: updated.id,
      aggregateVersion: updated.version,
      actorId,
      reason: body?.reason || null,
    });
    return presentJournal(updated);
  }

  static async reverse(id: string, body: any, actorId: string) {
    const original = await db.spCashJournal.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!original) throw new InvestmentOpsError("NOT_FOUND", "Journal not found", 404);
    if (original.status !== "POSTED") {
      throw new InvestmentOpsError("INVALID_STATUS", "Only posted journals can be reversed", 409);
    }

    const key =
      body?.idempotencyKey ||
      `REV:${original.id}:${body?.sourceEventId || randomUUID()}`;

    return withIdempotency("sp-cash:journal:reverse", key, { id, body }, async () => {
      const reversingLines = original.lines.map((l: any) => ({
        ledgerAccountCode: l.ledgerAccountCode,
        cashAccountId: l.cashAccountId,
        beneficialOwnerId: l.beneficialOwnerId,
        debit: l.credit,
        credit: l.debit,
        signedCashAmount: d(l.signedCashAmount).negated(),
        currency: l.currency,
        description: `Reversal of ${original.id}: ${l.description || ""}`.trim(),
      }));

      const created = await db.spCashJournal.create({
        data: {
          sourceSystem: original.sourceSystem,
          sourceEventId: body?.sourceEventId || `REV-${original.sourceEventId || original.id}`,
          postingPurpose: `REVERSAL_${original.postingPurpose}`,
          idempotencyKey: key,
          tradeDate: parseDateOnly(body?.tradeDate) || original.tradeDate,
          settlementDate: parseDateOnly(body?.settlementDate) || original.settlementDate,
          valueDate: parseDateOnly(body?.valueDate) || original.valueDate,
          postingBusinessDate: parseDateOnly(body?.postingBusinessDate) || new Date(),
          currency: original.currency,
          status: "POSTED",
          makerId: actorId,
          checkerId: actorId,
          reversalOf: original.id,
          cashAccountId: original.cashAccountId,
          portfolioId: original.portfolioId,
          postedAt: new Date(),
          version: 1,
          lines: { create: reversingLines },
        },
        include: { lines: true },
      });

      await db.spCashJournal.update({
        where: { id: original.id },
        data: { status: "REVERSED", version: { increment: 1 } },
      });

      await emitCash({
        eventType: "cash.journal.reversed",
        aggregateType: "SpCashJournal",
        aggregateId: created.id,
        aggregateVersion: 1,
        actorId,
        payload: { reversalOf: original.id },
      });
      return presentJournal(created);
    });
  }

  /** Ledger rows with running balance for account/currency date range. */
  static async listLedger(query: any = {}) {
    const { page, pageSize, skip, take } = parsePagination(query);
    const view = String(query.view || "LINES").toUpperCase();
    const whereLine: any = {};
    if (query.cashAccountId) whereLine.cashAccountId = String(query.cashAccountId);

    const journalWhere: any = { status: "POSTED" };
    if (query.currency) journalWhere.currency = String(query.currency).toUpperCase();
    if (query.portfolioId) journalWhere.portfolioId = String(query.portfolioId);
    if (query.fundId) journalWhere.portfolioId = String(query.fundId);
    if (query.from || query.to) {
      journalWhere.valueDate = {};
      if (query.from) journalWhere.valueDate.gte = parseDateOnly(query.from, "from");
      if (query.to) journalWhere.valueDate.lte = parseDateOnly(query.to, "to");
    }
    if (query.approvalStatus) {
      if (String(query.approvalStatus).toUpperCase() !== "APPROVED") {
        return paginated([], 0, page, pageSize);
      }
    }

    // accountPurpose=TRADING|FUND — filter by client account type / money class
    let accountPurposeFilter: string | null = null;
    if (query.accountPurpose) {
      accountPurposeFilter = String(query.accountPurpose).toUpperCase();
      const purposeWhere: any = {};
      if (accountPurposeFilter === "TRADING") {
        purposeWhere.OR = [
          { accountType: { contains: "TRADING" } },
          { moneyClass: { contains: "TRADING" } },
          { accountType: "CLIENT" },
        ];
      } else if (accountPurposeFilter === "FUND") {
        purposeWhere.OR = [
          { accountType: { contains: "FUND" } },
          { moneyClass: { contains: "FUND" } },
          { accountType: "OMNIBUS" },
        ];
      }
      const accounts = await db.spCashClientAccount.findMany({
        where: purposeWhere,
        select: { id: true },
        take: 2000,
      });
      const ids = accounts.map((a: any) => a.id);
      if (!ids.length) return paginated([], 0, page, pageSize);
      if (whereLine.cashAccountId && !ids.includes(whereLine.cashAccountId)) {
        return paginated([], 0, page, pageSize);
      }
      if (!whereLine.cashAccountId) whereLine.cashAccountId = { in: ids };
    }

    const lines = await db.spCashJournalLine.findMany({
      where: {
        ...whereLine,
        journal: journalWhere,
      },
      include: { journal: true },
      orderBy: [{ journal: { valueDate: "asc" } }, { createdAt: "asc" }],
    });

    const accountIds = [...new Set(lines.map((l: any) => l.cashAccountId).filter(Boolean))];
    const accounts = accountIds.length
      ? await db.spCashClientAccount.findMany({
          where: { id: { in: accountIds } },
          select: { id: true, accountType: true, moneyClass: true },
        })
      : [];
    const purposeByAccount = Object.fromEntries(
      accounts.map((a: any) => {
        const t = `${a.accountType || ""} ${a.moneyClass || ""}`.toUpperCase();
        const purpose = t.includes("FUND") || t.includes("OMNIBUS") ? "FUND" : "TRADING";
        return [a.id, purpose];
      })
    );

    let running = new Decimal(0);
    if (query.from && query.cashAccountId) {
      const prior = await db.spCashJournalLine.findMany({
        where: {
          cashAccountId: String(query.cashAccountId),
          journal: {
            status: "POSTED",
            currency: query.currency ? String(query.currency).toUpperCase() : undefined,
            valueDate: { lt: parseDateOnly(query.from, "from") },
          },
        },
      });
      for (const p of prior) running = running.plus(d(p.signedCashAmount));
    }

    if (view === "JOURNALS") {
      const byJournal = new Map<string, any>();
      for (const l of lines) {
        running = running.plus(d(l.signedCashAmount));
        const j = byJournal.get(l.journalId) || {
          journalId: l.journalId,
          valueDate: l.journal?.valueDate,
          currency: l.currency,
          postingPurpose: l.journal?.postingPurpose,
          status: l.journal?.status,
          lines: [] as any[],
          runningBalance: moneyStr(running),
        };
        j.lines.push({
          id: l.id,
          lineId: l.id,
          description: l.description,
          debit: moneyStr(l.debit),
          credit: moneyStr(l.credit),
          signedCashAmount: moneyStr(l.signedCashAmount),
          balance: moneyStr(running),
          runningBalance: moneyStr(running),
        });
        j.runningBalance = moneyStr(running);
        byJournal.set(l.journalId, j);
      }
      const allRows = [...byJournal.values()];
      const slice = allRows.slice(skip, skip + take);
      return paginated(slice, allRows.length, page, pageSize);
    }

    const allRows = lines.map((l: any) => {
      running = running.plus(d(l.signedCashAmount));
      const accountPurpose = purposeByAccount[l.cashAccountId] || null;
      return {
        id: l.id,
        lineId: l.id,
        journalId: l.journalId,
        valueDate: l.journal?.valueDate,
        businessDate: l.journal?.postingBusinessDate || l.journal?.valueDate,
        fundId: l.journal?.portfolioId,
        cashAccountId: l.cashAccountId,
        accountPurpose,
        transactionType: l.journal?.postingPurpose,
        postingPurpose: l.journal?.postingPurpose,
        description: l.description,
        debit: moneyStr(l.debit),
        credit: moneyStr(l.credit),
        signedCashAmount: moneyStr(l.signedCashAmount),
        balance: moneyStr(running),
        runningBalance: moneyStr(running),
        currency: l.currency,
        approvalStatus: l.journal?.status === "POSTED" ? "APPROVED" : l.journal?.status,
        matchStatus: l.matchStatus,
        sourceEventId: l.journal?.sourceEventId,
      };
    });

    if (query.search) {
      const s = String(query.search).toLowerCase();
      const filtered = allRows.filter(
        (r: any) =>
          String(r.description || "")
            .toLowerCase()
            .includes(s) ||
          String(r.sourceEventId || "")
            .toLowerCase()
            .includes(s)
      );
      const slice = filtered.slice(skip, skip + take);
      return paginated(slice, filtered.length, page, pageSize);
    }

    const slice = allRows.slice(skip, skip + take);
    return paginated(slice, allRows.length, page, pageSize);
  }
}
