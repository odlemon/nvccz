// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import {
  CALCULATION_VERSION,
  CALCULATION_VERSION_USD,
  d,
  db,
  moneyStr,
  requireStr,
} from "./spCashSupport";

const RESERVATION_ACTIVE = ["ACTIVE", "PARTIALLY_CONSUMED"];
const HOLD_PURPOSES = ["HOLD", "COMPLIANCE_HOLD", "BUFFER"];

export class SpCashPositionService {
  static calculationVersion(currency?: string) {
    return String(currency || "").toUpperCase() === "USD"
      ? CALCULATION_VERSION_USD
      : CALCULATION_VERSION;
  }

  /**
   * Core availability math. Never uses statement closing balance.
   * Suspense account destinations are excluded from postedSettledCash.
   */
  static async compute(params: {
    portfolioId?: string;
    cashAccountId: string;
    currency: string;
    asOf?: string | Date;
    tx?: any;
  }) {
    const client = params.tx || db;
    const cashAccountId = requireStr(params.cashAccountId, "cashAccountId");
    const currency = requireStr(params.currency, "currency").toUpperCase();
    const asOf = params.asOf ? new Date(params.asOf) : new Date();

    const account = await client.spCashClientAccount.findUnique({ where: { id: cashAccountId } });
    if (!account) {
      throw new InvestmentOpsError("NOT_FOUND", "Cash account not found", 404);
    }

    const journals = await client.spCashJournal.findMany({
      where: {
        status: "POSTED",
        currency,
        OR: [{ cashAccountId }, { lines: { some: { cashAccountId } } }],
        AND: [
          {
            OR: [
              { valueDate: { lte: asOf } },
              { settlementDate: { lte: asOf } },
              { AND: [{ valueDate: null }, { settlementDate: null }] },
            ],
          },
        ],
      },
      include: { lines: true },
    });

    // Load suspense account ids in same portfolio/tenant for exclusion
    const suspenseAccounts = await client.spCashClientAccount.findMany({
      where: {
        OR: [
          { id: cashAccountId },
          { portfolioId: account.portfolioId, accountType: "SUSPENSE" },
          { tenantId: account.tenantId, accountType: "SUSPENSE" },
        ],
        accountType: "SUSPENSE",
      },
      select: { id: true },
    });
    const suspenseIds = new Set(suspenseAccounts.map((a: any) => a.id));

    let postedSettledCash = new Decimal(0);
    let unsettledAdditions = new Decimal(0);

    for (const j of journals) {
      const settled =
        (j.valueDate && new Date(j.valueDate) <= asOf) ||
        (j.settlementDate && new Date(j.settlementDate) <= asOf);
      for (const line of j.lines) {
        if (line.cashAccountId && line.cashAccountId !== cashAccountId) continue;
        if (!line.cashAccountId && j.cashAccountId !== cashAccountId) continue;
        if (line.cashAccountId && suspenseIds.has(line.cashAccountId)) continue;
        if (String(account.accountType || "").toUpperCase() === "SUSPENSE") {
          // suspense balances never count toward available
          continue;
        }
        const amt = d(line.signedCashAmount);
        if (settled) postedSettledCash = postedSettledCash.plus(amt);
        else if (amt.gt(0)) unsettledAdditions = unsettledAdditions.plus(amt);
      }
    }

    const reservations = await client.spCashReservation.findMany({
      where: {
        cashAccountId,
        currency,
        status: { in: RESERVATION_ACTIVE },
      },
    });
    let activeReservations = new Decimal(0);
    for (const r of reservations) {
      activeReservations = activeReservations.plus(d(r.remainingAmount));
    }

    // Holds / buffers from expectations and reservation purpose flags
    const holds = await client.spCashExpectation.findMany({
      where: {
        cashAccountId,
        currency,
        status: { in: ["OPEN", "ACTIVE", "HOLD"] },
        direction: { in: ["HOLD", "BUFFER", "WITHDRAWAL"] },
      },
    });
    let holdsAndBuffers = new Decimal(0);
    let pendingWithdrawals = new Decimal(0);
    let buffer = new Decimal(0);
    for (const h of holds) {
      const amt = d(h.amount);
      const dir = String(h.direction || "").toUpperCase();
      if (dir === "WITHDRAWAL") pendingWithdrawals = pendingWithdrawals.plus(amt);
      else if (dir === "BUFFER") buffer = buffer.plus(amt);
      else holdsAndBuffers = holdsAndBuffers.plus(amt);
    }
    for (const r of reservations) {
      if (HOLD_PURPOSES.includes(String(r.purpose || "").toUpperCase())) {
        holdsAndBuffers = holdsAndBuffers.plus(d(r.remainingAmount));
      }
    }

    // Eligible additions: positive OPEN expectations with dueDate <= asOf or clearance flag
    const inflows = await client.spCashExpectation.findMany({
      where: {
        cashAccountId,
        currency,
        status: { in: ["OPEN", "ACTIVE", "CLEARED_PROCEEDS"] },
        direction: { in: ["INFLOW", "RECEIPT", "SELL_PROCEEDS"] },
      },
    });
    let eligibleAdditions = new Decimal(0);
    for (const e of inflows) {
      const dir = String(e.direction || "").toUpperCase();
      // AT-09: sell proceeds excluded until reuse / CLEARED_PROCEEDS
      if (dir === "SELL_PROCEEDS" && e.status !== "CLEARED_PROCEEDS") continue;
      if (e.dueDate && new Date(e.dueDate) > asOf) continue;
      eligibleAdditions = eligibleAdditions.plus(d(e.amount));
    }

    const diagnostic = postedSettledCash
      .minus(activeReservations)
      .minus(holdsAndBuffers)
      .minus(pendingWithdrawals)
      .minus(buffer)
      .plus(eligibleAdditions);

    const orderEligible = Decimal.max(new Decimal(0), diagnostic);

    const withdrawable = postedSettledCash
      .minus(activeReservations)
      .minus(holdsAndBuffers)
      .minus(pendingWithdrawals)
      .minus(buffer);
    // exclude unsettled — do not add unsettledAdditions

    const lastStmt = await client.spCashExternalStatement.findFirst({
      where: { cashAccountId },
      orderBy: { createdAt: "desc" },
    });

    return {
      portfolioId: params.portfolioId || account.portfolioId,
      cashAccountId,
      currency,
      asOf: asOf.toISOString(),
      postedSettledCash: moneyStr(postedSettledCash),
      activeReservations: moneyStr(activeReservations),
      holdsAndBuffers: moneyStr(holdsAndBuffers.plus(buffer)),
      pendingWithdrawals: moneyStr(pendingWithdrawals),
      eligibleAdditions: moneyStr(eligibleAdditions),
      diagnosticAvailableCash: moneyStr(diagnostic),
      orderEligibleAvailableCash: moneyStr(orderEligible),
      withdrawableCash: moneyStr(Decimal.max(new Decimal(0), withdrawable)),
      unsettledAdditions: moneyStr(unsettledAdditions),
      calculationVersion: this.calculationVersion(currency),
      accountVersion: account.version,
      dataFreshness: {
        ledger: "CURRENT",
        lastStatementReceivedAt: lastStmt?.createdAt?.toISOString?.() || null,
      },
      _raw: {
        postedSettledCash,
        activeReservations,
        holdsAndBuffers,
        pendingWithdrawals,
        buffer,
        eligibleAdditions,
        diagnostic,
        orderEligible,
        withdrawable,
      },
    };
  }

  static async cashPosition(query: any) {
    const cashAccountId = requireStr(query.cashAccountId, "cashAccountId");
    const currency = requireStr(query.currency || "USD", "currency");
    const portfolioId = query.portfolioId;
    const result = await this.compute({
      portfolioId,
      cashAccountId,
      currency,
      asOf: query.asOf,
    });
    const { _raw, ...publicResult } = result;
    return {
      ...publicResult,
      explainUrl: `/api/investment-ops/portfolios/${publicResult.portfolioId}/cash-explanation?cashAccountId=${cashAccountId}&currency=${currency}&asOf=${encodeURIComponent(publicResult.asOf)}`,
    };
  }

  static async cashExplanation(query: any) {
    const pos = await this.compute({
      portfolioId: query.portfolioId,
      cashAccountId: requireStr(query.cashAccountId, "cashAccountId"),
      currency: requireStr(query.currency || "USD", "currency"),
      asOf: query.asOf,
    });
    const lines = [
      {
        code: "POSTED_SETTLED_CASH",
        label: "Posted settled cash",
        amount: pos.postedSettledCash,
        sign: "+",
      },
      {
        code: "ACTIVE_RESERVATIONS",
        label: "Active reservations",
        amount: pos.activeReservations,
        sign: "-",
      },
      {
        code: "HOLDS_AND_BUFFERS",
        label: "Holds and buffers",
        amount: pos.holdsAndBuffers,
        sign: "-",
      },
      {
        code: "PENDING_WITHDRAWALS",
        label: "Pending withdrawals",
        amount: pos.pendingWithdrawals,
        sign: "-",
      },
      {
        code: "ELIGIBLE_ADDITIONS",
        label: "Eligible additions",
        amount: pos.eligibleAdditions,
        sign: "+",
      },
      {
        code: "DIAGNOSTIC_AVAILABLE",
        label: "Diagnostic available cash",
        amount: pos.diagnosticAvailableCash,
        sign: "=",
      },
      {
        code: "ORDER_ELIGIBLE",
        label: "Order-eligible available cash",
        amount: pos.orderEligibleAvailableCash,
        sign: "=",
      },
      {
        code: "WITHDRAWABLE",
        label: "Withdrawable cash",
        amount: pos.withdrawableCash,
        sign: "=",
      },
    ];
    const { _raw, ...publicPos } = pos;
    return { ...publicPos, lineItems: lines };
  }

  static async cashProjection(query: any) {
    const cashAccountId = requireStr(query.cashAccountId, "cashAccountId");
    const currency = requireStr(query.currency || "USD", "currency");
    const asOf = query.asOf ? new Date(query.asOf) : new Date();
    const horizonDays = Math.min(90, Math.max(1, Number(query.horizonDays) || 14));
    const to = new Date(asOf);
    to.setUTCDate(to.getUTCDate() + horizonDays);

    const expectations = await db.spCashExpectation.findMany({
      where: {
        cashAccountId,
        currency,
        status: { in: ["OPEN", "ACTIVE", "CLEARED_PROCEEDS"] },
        OR: [{ dueDate: null }, { dueDate: { lte: to } }],
      },
      orderBy: { dueDate: "asc" },
    });

    const pos = await this.compute({
      portfolioId: query.portfolioId,
      cashAccountId,
      currency,
      asOf,
    });

    let running = d(pos.orderEligibleAvailableCash);
    const points = [
      {
        date: asOf.toISOString().slice(0, 10),
        orderEligibleAvailableCash: moneyStr(running),
        event: "AS_OF",
      },
    ];
    for (const e of expectations) {
      const dir = String(e.direction || "").toUpperCase();
      const amt = d(e.amount);
      if (["INFLOW", "RECEIPT", "CLEARED_PROCEEDS", "SELL_PROCEEDS"].includes(dir)) {
        if (dir === "SELL_PROCEEDS" && e.status !== "CLEARED_PROCEEDS") continue;
        running = running.plus(amt);
      } else {
        running = running.minus(amt);
      }
      points.push({
        date: (e.dueDate || asOf).toISOString().slice(0, 10),
        orderEligibleAvailableCash: moneyStr(running),
        event: dir,
        expectationId: e.id,
        amount: moneyStr(amt),
      });
    }

    const { _raw, ...publicPos } = pos;
    return {
      ...publicPos,
      horizonDays,
      points,
      expectations: expectations.map((e: any) => ({
        id: e.id,
        direction: e.direction,
        amount: moneyStr(e.amount),
        currency: e.currency,
        dueDate: e.dueDate,
        status: e.status,
      })),
    };
  }

  static async cashOverview(query: any = {}) {
    const where: any = {};
    if (query.portfolioId) where.portfolioId = String(query.portfolioId);
    if (query.clientOrVehicleId) where.clientOrVehicleId = String(query.clientOrVehicleId);
    if (query.status) where.status = String(query.status);
    else where.status = "ACTIVE";

    const accounts = await db.spCashClientAccount.findMany({ where, take: 500 });
    let totalCash = new Decimal(0);
    let totalAvailable = new Decimal(0);
    let pendingSettlements = new Decimal(0);
    let unreconciledValue = new Decimal(0);
    let unreconciledCount = 0;
    let exceptionsOpen = 0;

    for (const a of accounts) {
      try {
        const pos = await this.compute({
          portfolioId: a.portfolioId,
          cashAccountId: a.id,
          currency: a.currency,
          asOf: query.asOf,
        });
        totalCash = totalCash.plus(d(pos.postedSettledCash));
        totalAvailable = totalAvailable.plus(d(pos.orderEligibleAvailableCash));
        pendingSettlements = pendingSettlements.plus(d(pos.unsettledAdditions));
      } catch {
        /* skip */
      }
    }

    const openBreaks = await db.spCashReconciliationBreak.count({
      where: { status: { in: ["OPEN", "UNRECONCILED"] } },
    });
    unreconciledCount = openBreaks;

    const breakRows = await db.spCashReconciliationBreak.findMany({
      where: { status: { in: ["OPEN", "UNRECONCILED"] } },
      take: 500,
    });
    for (const b of breakRows) {
      unreconciledValue = unreconciledValue.plus(d(b.amount ?? 0).abs());
    }

    exceptionsOpen = await db.spCashReconciliationException.count({
      where: { status: { notIn: ["CLOSED", "REJECTED"] } },
    });

    const reportingCcy = String(query.localCurrency || query.reportingCurrency || "USD").toUpperCase();

    return {
      asOf: query.asOf || new Date().toISOString(),
      accountCount: accounts.length,
      clientCash: moneyPairSafe(totalCash, reportingCcy),
      availableCash: moneyPairSafe(totalAvailable, reportingCcy),
      pendingSettlements: moneyPairSafe(pendingSettlements, reportingCcy),
      unreconciled: {
        count: unreconciledCount,
        value: moneyPairSafe(unreconciledValue, reportingCcy),
      },
      openExceptions: { count: exceptionsOpen },
      calculationVersion: this.calculationVersion(reportingCcy),
      trendVsPrior7d: null,
    };
  }

  /** Daily cash movement series for Overview / Ledger charts. */
  static async dailyMovement(query: any = {}) {
    const to = query.to
      ? new Date(String(query.to))
      : new Date();
    const from = query.from
      ? new Date(String(query.from))
      : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    const currency = query.currency ? String(query.currency).toUpperCase() : undefined;

    const journalWhere: any = {
      status: "POSTED",
      valueDate: { gte: from, lte: to },
    };
    if (currency) journalWhere.currency = currency;
    if (query.portfolioId) journalWhere.portfolioId = String(query.portfolioId);
    if (query.fundId) journalWhere.portfolioId = String(query.fundId);

    const lineWhere: any = { journal: journalWhere };
    if (query.cashAccountId) lineWhere.cashAccountId = String(query.cashAccountId);

    const lines = await db.spCashJournalLine.findMany({
      where: lineWhere,
      include: { journal: true },
      orderBy: [{ journal: { valueDate: "asc" } }, { createdAt: "asc" }],
    });

    // Opening balance before from
    let close = new Decimal(0);
    if (query.cashAccountId) {
      const prior = await db.spCashJournalLine.findMany({
        where: {
          cashAccountId: String(query.cashAccountId),
          journal: {
            status: "POSTED",
            currency,
            valueDate: { lt: from },
          },
        },
      });
      for (const p of prior) close = close.plus(d(p.signedCashAmount));
    }

    const byDate = new Map<string, Decimal>();
    for (const l of lines) {
      const dateKey = (l.journal?.valueDate || l.createdAt).toISOString().slice(0, 10);
      byDate.set(dateKey, (byDate.get(dateKey) || new Decimal(0)).plus(d(l.signedCashAmount)));
    }

    const series: any[] = [];
    const cursor = new Date(from);
    cursor.setHours(0, 0, 0, 0);
    const end = new Date(to);
    end.setHours(0, 0, 0, 0);
    while (cursor <= end) {
      const key = cursor.toISOString().slice(0, 10);
      const net = byDate.get(key) || new Decimal(0);
      close = close.plus(net);
      series.push({
        date: key,
        net: moneyStr(net),
        close: moneyStr(close),
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return {
      from: from.toISOString().slice(0, 10),
      to: to.toISOString().slice(0, 10),
      currency: currency || null,
      portfolioId: query.portfolioId || query.fundId || null,
      cashAccountId: query.cashAccountId || null,
      items: series,
    };
  }
}

function moneyPairSafe(amount: Decimal, currency: string) {
  return { amount: moneyStr(amount), currency };
}
