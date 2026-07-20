// @ts-nocheck
import { createHash } from "crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { PortfolioValuationEngine } from "../listedEquity/PortfolioValuationEngine";
import { InvestmentFifoCostService } from "./InvestmentFifoCostService";
import { InvestmentOpsAuditService } from "./InvestmentOpsAuditService";
import {
  contentChecksum,
  InvestmentJobWorkerService,
  registerInvestmentJobHandler,
} from "./InvestmentJobWorkerService";
import { paginatedResult, parsePagination } from "./investmentOpsSupport";

const db = prisma as any;
const FORMULA_VERSION = "WAC_MV_V1";
const POLICY_VERSION = "VALUATION_POLICY_V1";

const TERMINAL = new Set(["COMPLETED", "COMPLETED_WITH_EXCEPTIONS", "FAILED", "CANCELLED", "REJECTED"]);

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

function serializeRun(run: any) {
  if (!run) return run;
  const params = (run.parametersJson || {}) as any;
  return {
    ...run,
    navBaseCurrency: run.navBaseCurrency != null ? String(run.navBaseCurrency) : null,
    realizedPnl: params.realizedPnl != null ? String(params.realizedPnl) : run.realizedPnl ?? null,
    unrealizedPnl:
      params.unrealizedPnl != null ? String(params.unrealizedPnl) : run.unrealizedPnl ?? null,
    totalPnl: params.totalPnl != null ? String(params.totalPnl) : run.totalPnl ?? null,
    itemSnapshots: run.itemSnapshots?.map((item: any) => ({
      ...item,
      quantity: String(item.quantity),
      price: String(item.price),
      marketValue: String(item.marketValue),
      baseMarketValue: String(item.baseMarketValue),
      costValue: item.costValue != null ? String(item.costValue) : null,
      unrealizedPnl: item.unrealizedPnl != null ? String(item.unrealizedPnl) : null,
    })),
  };
}

async function attachRunPnl(run: any) {
  if (!run?.id) return run;
  const items = await db.investmentValuationItemSnapshot.findMany({
    where: { valuationRunId: run.id },
    select: { unrealizedPnl: true, costValue: true, baseMarketValue: true },
  });
  let unrealized = new Decimal(0);
  for (const item of items) {
    if (item.unrealizedPnl != null) unrealized = unrealized.plus(dec(item.unrealizedPnl));
  }
  const asOf = run.asOf ? new Date(run.asOf) : null;
  const txnWhere: any = {
    fundId: run.fundId,
    status: "POSTED",
    transactionType: { in: ["REALIZED_GAIN", "REALIZED_LOSS"] },
  };
  if (asOf) txnWhere.tradeDate = { lte: asOf };
  const txns = await db.investmentTransaction.findMany({
    where: txnWhere,
    select: { netAmount: true },
  });
  let realized = new Decimal(0);
  for (const t of txns) realized = realized.plus(dec(t.netAmount ?? 0));
  const total = realized.plus(unrealized);
  return serializeRun({
    ...run,
    realizedPnl: realized.toFixed(2),
    unrealizedPnl: unrealized.toFixed(2),
    totalPnl: total.toFixed(2),
    parametersJson: {
      ...(run.parametersJson || {}),
      realizedPnl: realized.toFixed(2),
      unrealizedPnl: unrealized.toFixed(2),
      totalPnl: total.toFixed(2),
    },
  });
}

async function accessRun(runId: string, userId: string, user: any) {
  const fundId = await ListedEquityAccessService.assertObjectFundAccess(
    userId,
    user,
    "Valuation run",
    runId,
    async () =>
      (await db.investmentValuationRun.findUnique({ where: { id: runId }, select: { fundId: true } }))
        ?.fundId
  );
  const run = await db.investmentValuationRun.findUnique({ where: { id: runId } });
  if (!run) fail("VALUATION_RUN_NOT_FOUND", "Valuation run not found", 404);
  return run;
}

async function accessException(exceptionId: string, userId: string, user: any) {
  const ex = await db.investmentValuationException.findUnique({ where: { id: exceptionId } });
  if (!ex) fail("VALUATION_EXCEPTION_NOT_FOUND", "Valuation exception not found", 404);
  await ListedEquityAccessService.assertFundAccess(userId, ex.fundId, user);
  return ex;
}

export class InvestmentValuationService {
  static async createRun(
    data: {
      fundId: string;
      asOf?: string;
      costBasisMethod?: string;
      processNow?: boolean;
    },
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    const fundId = String(data.fundId || "").trim();
    if (!fundId) fail("VALIDATION_ERROR", "fundId is required", 400, { field: "fundId" });
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);

    const existing = await db.investmentValuationRun.findUnique({ where: { idempotencyKey } });
    if (existing) return serializeRun(existing);

    const asOf = data.asOf ? new Date(data.asOf) : new Date();
    const costBasisMethod = String(data.costBasisMethod || "WAC").toUpperCase();
    const run = await db.investmentValuationRun.create({
      data: {
        fundId,
        asOf,
        status: "QUEUED",
        startedById: userId,
        idempotencyKey,
        parametersJson: {
          costBasisMethod,
          formulaVersion: FORMULA_VERSION,
          policyVersion: POLICY_VERSION,
        },
      },
    });

    const job = await InvestmentJobWorkerService.enqueue({
      jobType: "VALUATION_RUN",
      aggregateType: "ValuationRun",
      aggregateId: run.id,
      payloadJson: { valuationRunId: run.id, fundId, requestedById: userId },
      idempotencyKey: `valuation-run:${idempotencyKey}`,
      priority: 50,
    });

    await InvestmentOpsAuditService.log(
      "VALUATION_RUN_QUEUED",
      "ValuationRun",
      run.id,
      { fundId, jobId: job.id },
      userId
    );

    if (data.processNow === true) {
      await InvestmentJobWorkerService.processJobById(job.id);
    }

    const fresh = await db.investmentValuationRun.findUnique({
      where: { id: run.id },
      include: { exceptions: true },
    });
    return {
      ...serializeRun(fresh),
      jobId: job.id,
      statusUrl: `/api/investment-ops/jobs/${job.id}`,
    };
  }

  static async listRuns(query: any, userId: string, user: any) {
    const page = parsePagination(query);
    const where: any = await ListedEquityAccessService.accessibleFundIdFilter(
      userId,
      user,
      query.fundId as string | undefined
    );
    if (query.status) where.status = query.status;
    const [rows, total] = await Promise.all([
      db.investmentValuationRun.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.take,
      }),
      db.investmentValuationRun.count({ where }),
    ]);
    return paginatedResult(
      await Promise.all(rows.map((row: any) => attachRunPnl(row))),
      total,
      page.page,
      page.pageSize
    );
  }

  static async getRun(id: string, userId: string, user: any) {
    await accessRun(id, userId, user);
    return attachRunPnl(
      await db.investmentValuationRun.findUnique({
        where: { id },
        include: { exceptions: true },
      })
    );
  }

  static async listInputs(runId: string, userId: string, user: any) {
    await accessRun(runId, userId, user);
    const inputs = await db.investmentValuationInputSnapshot.findMany({
      where: { valuationRunId: runId },
      orderBy: { createdAt: "asc" },
    });
    const prices: any[] = [];
    const fxRates: any[] = [];
    for (const input of inputs) {
      const payload = (input.valueJson || {}) as any;
      const kind = String(input.inputType || "").toUpperCase();
      if (kind.includes("FX") || input.fxSnapshotId) {
        fxRates.push({
          id: input.id,
          inputType: input.inputType,
          instrumentId: input.instrumentId,
          fxSnapshotId: input.fxSnapshotId,
          sourceCode: input.sourceCode,
          sourceObservedAt: input.sourceObservedAt,
          ...payload,
          rate: payload?.rate != null ? String(payload.rate) : null,
        });
      } else {
        prices.push({
          id: input.id,
          inputType: input.inputType,
          instrumentId: input.instrumentId,
          priceTickId: input.priceTickId,
          sourceCode: input.sourceCode,
          sourceObservedAt: input.sourceObservedAt,
          ...payload,
          price: payload?.price != null ? String(payload.price) : null,
          pricedAt: input.sourceObservedAt || payload?.pricedAt || null,
        });
      }
    }
    return { runId, inputs, prices, fxRates };
  }

  static async listItems(runId: string, userId: string, user: any) {
    await accessRun(runId, userId, user);
    const items = await db.investmentValuationItemSnapshot.findMany({
      where: { valuationRunId: runId },
      orderBy: { createdAt: "asc" },
    });
    return items.map((item: any) => ({
      ...item,
      quantity: String(item.quantity),
      price: String(item.price),
      marketValue: String(item.marketValue),
      baseMarketValue: String(item.baseMarketValue),
      costValue: item.costValue != null ? String(item.costValue) : null,
      unrealizedPnl: item.unrealizedPnl != null ? String(item.unrealizedPnl) : null,
    }));
  }

  static async summary(runId: string, userId: string, user: any) {
    const run = await accessRun(runId, userId, user);
    const [inputCount, itemCount, openExceptions, items] = await Promise.all([
      db.investmentValuationInputSnapshot.count({ where: { valuationRunId: runId } }),
      db.investmentValuationItemSnapshot.count({ where: { valuationRunId: runId } }),
      db.investmentValuationException.count({
        where: { valuationRunId: runId, status: { in: ["OPEN", "OVERRIDE_PENDING", "ESCALATED"] } },
      }),
      db.investmentValuationItemSnapshot.findMany({ where: { valuationRunId: runId } }),
    ]);
    const marketValue = items.reduce((s: Decimal, i: any) => s.plus(dec(i.baseMarketValue)), new Decimal(0));
    let unrealized = new Decimal(0);
    for (const i of items) {
      if (i.unrealizedPnl != null) unrealized = unrealized.plus(dec(i.unrealizedPnl));
    }
    const txns = await db.investmentTransaction.findMany({
      where: {
        fundId: run.fundId,
        status: "POSTED",
        transactionType: { in: ["REALIZED_GAIN", "REALIZED_LOSS"] },
        tradeDate: { lte: run.asOf },
      },
      select: { netAmount: true },
    });
    let realized = new Decimal(0);
    for (const t of txns) realized = realized.plus(dec(t.netAmount ?? 0));
    return {
      runId,
      fundId: run.fundId,
      status: run.status,
      asOf: run.asOf,
      navBaseCurrency: run.navBaseCurrency != null ? String(run.navBaseCurrency) : null,
      realizedPnl: realized.toFixed(2),
      unrealizedPnl: unrealized.toFixed(2),
      totalPnl: realized.plus(unrealized).toFixed(2),
      inputCount,
      itemCount,
      openExceptionCount: openExceptions,
      marketValueBase: marketValue.toString(),
      formulaVersion: (run.parametersJson as any)?.formulaVersion || FORMULA_VERSION,
      policyVersion: (run.parametersJson as any)?.policyVersion || POLICY_VERSION,
    };
  }

  static async cancel(runId: string, userId: string, user: any, reason?: string) {
    const run = await accessRun(runId, userId, user);
    if (TERMINAL.has(run.status)) {
      fail("VALUATION_RUN_TERMINAL", "Completed runs cannot be cancelled", 409, { status: run.status });
    }
    const updated = await db.investmentValuationRun.update({
      where: { id: runId },
      data: {
        status: "CANCELLED",
        errorMessage: reason || "Cancelled by user",
        completedAt: new Date(),
        version: { increment: 1 },
      },
    });
    await InvestmentOpsAuditService.log(
      "VALUATION_RUN_CANCELLED",
      "ValuationRun",
      runId,
      { reason },
      userId
    );
    return serializeRun(updated);
  }

  static async rerun(
    runId: string,
    idempotencyKey: string,
    userId: string,
    user: any,
    processNow = false
  ) {
    const prior = await accessRun(runId, userId, user);
    if (!TERMINAL.has(prior.status) && prior.status !== "CANCELLED") {
      fail("VALUATION_RERUN_NOT_ALLOWED", "Only terminal runs can be superseded", 409, {
        status: prior.status,
      });
    }
    return this.createRun(
      {
        fundId: prior.fundId,
        asOf: prior.asOf?.toISOString?.() || prior.asOf,
        costBasisMethod: (prior.parametersJson as any)?.costBasisMethod,
        processNow,
      },
      idempotencyKey,
      userId,
      user
    );
  }

  /** @deprecated prefer createRun — kept for older callers */
  static async runValuation(
    fundId: string,
    userId: string,
    user: any,
    options?: { async?: boolean; costBasisMethod?: string; idempotencyKey?: string }
  ) {
    const key =
      options?.idempotencyKey ||
      `legacy-valuation:${fundId}:${options?.costBasisMethod || "WAC"}:${Date.now()}`;
    return this.createRun(
      {
        fundId,
        costBasisMethod: options?.costBasisMethod,
        processNow: options?.processNow === true,
      },
      key,
      userId,
      user
    );
  }

  static async listExceptions(query: any, userId: string, user: any) {
    if (!query.fundId) fail("VALIDATION_ERROR", "fundId is required", 400, { field: "fundId" });
    await ListedEquityAccessService.assertFundAccess(userId, query.fundId, user);
    const page = parsePagination(query);
    const where: any = { fundId: query.fundId };
    if (query.status) where.status = query.status;
    else where.status = { in: ["OPEN", "OVERRIDE_PENDING", "ESCALATED"] };
    if (query.valuationRunId) where.valuationRunId = query.valuationRunId;
    const [rows, total] = await Promise.all([
      db.investmentValuationException.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.take,
      }),
      db.investmentValuationException.count({ where }),
    ]);
    return paginatedResult(rows, total, page.page, page.pageSize);
  }

  static async getException(exceptionId: string, userId: string, user: any) {
    return accessException(exceptionId, userId, user);
  }

  static async resolveException(
    exceptionId: string,
    userId: string,
    user: any,
    resolution: { action?: string; reason?: string; overridePrice?: number | string }
  ) {
    const ex = await accessException(exceptionId, userId, user);
    if (!["OPEN", "ESCALATED", "OVERRIDE_PENDING"].includes(ex.status)) {
      fail("EXCEPTION_NOT_RESOLVABLE", "Exception is not open", 409, { status: ex.status });
    }
    const updated = await db.investmentValuationException.update({
      where: { id: exceptionId },
      data: {
        status: "RESOLVED",
        resolvedById: userId,
        resolvedAt: new Date(),
        resolutionAction: resolution.action || "RESOLVE",
        resolutionNote: resolution.reason || null,
      },
    });
    await InvestmentOpsAuditService.log(
      "VALUATION_EXCEPTION_RESOLVED",
      "ValuationException",
      exceptionId,
      resolution,
      userId
    );
    return updated;
  }

  static async requestOverride(
    exceptionId: string,
    userId: string,
    user: any,
    data: { reason: string; overridePrice?: string | number }
  ) {
    const ex = await accessException(exceptionId, userId, user);
    if (!["OPEN", "ESCALATED"].includes(ex.status)) {
      fail("EXCEPTION_NOT_OVERRIDABLE", "Exception cannot accept override request", 409);
    }
    if (!data.reason?.trim()) fail("VALIDATION_ERROR", "reason is required", 400);
    const updated = await db.investmentValuationException.update({
      where: { id: exceptionId },
      data: {
        status: "OVERRIDE_PENDING",
        resolutionAction: "OVERRIDE_REQUESTED",
        resolutionNote: JSON.stringify({
          reason: data.reason,
          overridePrice: data.overridePrice != null ? String(data.overridePrice) : null,
          requestedById: userId,
        }),
      },
    });
    await InvestmentOpsAuditService.log(
      "VALUATION_EXCEPTION_OVERRIDE_REQUESTED",
      "ValuationException",
      exceptionId,
      data,
      userId
    );
    return updated;
  }

  static async approveOverride(exceptionId: string, userId: string, user: any, reason?: string) {
    const ex = await accessException(exceptionId, userId, user);
    if (ex.status !== "OVERRIDE_PENDING") {
      fail("OVERRIDE_NOT_PENDING", "No pending override to approve", 409);
    }
    let note: any = {};
    try {
      note = JSON.parse(ex.resolutionNote || "{}");
    } catch {
      note = {};
    }
    if (note.requestedById && note.requestedById === userId) {
      fail("FOUR_EYE_VIOLATION", "Requester cannot approve their own override", 403);
    }
    const updated = await db.investmentValuationException.update({
      where: { id: exceptionId },
      data: {
        status: "RESOLVED",
        resolvedById: userId,
        resolvedAt: new Date(),
        resolutionAction: "OVERRIDE_APPROVED",
        resolutionNote: JSON.stringify({ ...note, approvedReason: reason || null, approvedById: userId }),
      },
    });
    await InvestmentOpsAuditService.log(
      "VALUATION_EXCEPTION_OVERRIDE_APPROVED",
      "ValuationException",
      exceptionId,
      { reason },
      userId
    );
    return updated;
  }

  static async rejectOverride(exceptionId: string, userId: string, user: any, reason?: string) {
    const ex = await accessException(exceptionId, userId, user);
    if (ex.status !== "OVERRIDE_PENDING") {
      fail("OVERRIDE_NOT_PENDING", "No pending override to reject", 409);
    }
    const updated = await db.investmentValuationException.update({
      where: { id: exceptionId },
      data: {
        status: "OPEN",
        resolutionAction: "OVERRIDE_REJECTED",
        resolutionNote: reason || ex.resolutionNote,
      },
    });
    await InvestmentOpsAuditService.log(
      "VALUATION_EXCEPTION_OVERRIDE_REJECTED",
      "ValuationException",
      exceptionId,
      { reason },
      userId
    );
    return updated;
  }

  static async escalate(exceptionId: string, userId: string, user: any, reason?: string) {
    const ex = await accessException(exceptionId, userId, user);
    if (!["OPEN", "OVERRIDE_PENDING"].includes(ex.status)) {
      fail("EXCEPTION_NOT_ESCALATABLE", "Exception cannot be escalated", 409);
    }
    const updated = await db.investmentValuationException.update({
      where: { id: exceptionId },
      data: {
        status: "ESCALATED",
        resolutionAction: "ESCALATED",
        resolutionNote: reason || ex.resolutionNote,
      },
    });
    await InvestmentOpsAuditService.log(
      "VALUATION_EXCEPTION_ESCALATED",
      "ValuationException",
      exceptionId,
      { reason },
      userId
    );
    return updated;
  }

  static async priceValidation(fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const holdings = await db.listedEquityHolding.findMany({
      where: { fundId },
      include: { security: true },
    });
    const items = [];
    for (const h of holdings) {
      const tick = await db.listedEquityPriceTick.findFirst({
        where: { securityId: h.securityId, validationStatus: "APPROVED" },
        orderBy: { pricedAt: "desc" },
      });
      items.push({
        securityId: h.securityId,
        symbol: h.security?.symbol,
        quantity: String(h.quantity),
        approvedPrice: tick ? String(tick.price) : null,
        pricedAt: tick?.pricedAt ?? null,
        priceTickId: tick?.id ?? null,
        status: tick ? "OK" : "MISSING_APPROVED_PRICE",
      });
    }
    return {
      fundId,
      missingCount: items.filter((i) => i.status !== "OK").length,
      items,
    };
  }

  static async fxValidation(fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const config = await db.listedEquityFundConfig.findUnique({ where: { fundId } });
    const base = config?.baseCurrencyCode || "USD";
    const snaps = await db.investmentFxRateSnapshot.findMany({
      where: {
        OR: [{ baseCurrencyCode: base }, { quoteCurrencyCode: base }],
        approvalStatus: "APPROVED",
      },
      orderBy: { sourceObservedAt: "desc" },
      take: 50,
    });
    const pending = await db.investmentFxRateSnapshot.count({
      where: {
        OR: [{ baseCurrencyCode: base }, { quoteCurrencyCode: base }],
        approvalStatus: { not: "APPROVED" },
      },
    });
    return {
      fundId,
      baseCurrencyCode: base,
      approvedCount: snaps.length,
      unapprovedCount: pending,
      latest: snaps[0]
        ? {
            ...snaps[0],
            rate: String(snaps[0].rate),
          }
        : null,
      status: snaps.length ? "OK" : pending ? "UNAPPROVED_FX" : "MISSING_FX",
    };
  }

  static async executeRun(runId: string) {
    const run = await db.investmentValuationRun.findUnique({ where: { id: runId } });
    if (!run) throw new InvestmentOpsError("VALUATION_RUN_NOT_FOUND", "Valuation run not found", 404);
    if (run.status === "CANCELLED") return run;
    if (TERMINAL.has(run.status) && run.status !== "FAILED") return run;

    await db.investmentValuationRun.update({
      where: { id: runId },
      data: { status: "VALIDATING_INPUTS" },
    });

    const method = String((run.parametersJson as any)?.costBasisMethod || "WAC").toUpperCase();
    const fundId = run.fundId;

    if (method === "FIFO") {
      const holdings = await db.listedEquityHolding.findMany({ where: { fundId } });
      for (const h of holdings) {
        const fifo = await InvestmentFifoCostService.costBasis(fundId, h.securityId, Number(h.quantity));
        if (fifo.wac > 0) {
          await db.listedEquityHolding.update({ where: { id: h.id }, data: { wac: fifo.wac } });
        }
      }
    }

    await db.investmentValuationRun.update({ where: { id: runId }, data: { status: "RUNNING" } });

    const holdings = await db.listedEquityHolding.findMany({
      where: { fundId },
      include: { security: true },
    });
    const cashAccounts = await db.investmentCashAccount.findMany({
      where: {
        status: "ACTIVE",
        portfolioConfig: { fundId },
      },
    });
    const cashBalances = [];
    for (const account of cashAccounts) {
      const sum = await db.investmentCashLedgerEntry.aggregate({
        where: { cashAccountId: account.id },
        _sum: { amount: true },
      });
      cashBalances.push({
        cashAccountId: account.id,
        currencyCode: account.currencyCode,
        balance: String(sum._sum.amount ?? 0),
      });
    }

    const fxSnap = await db.investmentFxRateSnapshot.findFirst({
      where: { approvalStatus: "APPROVED" },
      orderBy: { sourceObservedAt: "desc" },
    });

    const inputRows = [];
    const holdingsPayload = holdings.map((h: any) => ({
      holdingId: h.id,
      securityId: h.securityId,
      instrumentId: h.instrumentId ?? null,
      quantity: String(h.quantity),
      wac: String(h.wac),
      currencyCode: h.wacCurrencyCode,
    }));
    inputRows.push({
      valuationRunId: runId,
      inputType: "HOLDINGS",
      instrumentId: null,
      valueJson: holdingsPayload,
      contentHash: contentChecksum(holdingsPayload),
      sourceCode: "PORTFOLIO",
      sourceObservedAt: run.asOf,
    });
    inputRows.push({
      valuationRunId: runId,
      inputType: "CASH",
      instrumentId: null,
      valueJson: cashBalances,
      contentHash: contentChecksum(cashBalances),
      sourceCode: "CASH_LEDGER",
      sourceObservedAt: run.asOf,
    });
    if (fxSnap) {
      inputRows.push({
        valuationRunId: runId,
        inputType: "FX",
        instrumentId: null,
        fxSnapshotId: fxSnap.id,
        valueJson: {
          id: fxSnap.id,
          rate: String(fxSnap.rate),
          baseCurrencyCode: fxSnap.baseCurrencyCode,
          quoteCurrencyCode: fxSnap.quoteCurrencyCode,
        },
        contentHash: contentChecksum({ id: fxSnap.id, rate: String(fxSnap.rate) }),
        sourceCode: fxSnap.sourceCode,
        sourceObservedAt: fxSnap.sourceObservedAt,
      });
    }
    inputRows.push({
      valuationRunId: runId,
      inputType: "POLICY",
      instrumentId: null,
      valueJson: {
        formulaVersion: FORMULA_VERSION,
        policyVersion: POLICY_VERSION,
        costBasisMethod: method,
      },
      contentHash: contentChecksum({ FORMULA_VERSION, POLICY_VERSION, method }),
      sourceCode: "SYSTEM",
      sourceObservedAt: run.asOf,
    });

    await db.investmentValuationInputSnapshot.deleteMany({ where: { valuationRunId: runId } });
    await db.investmentValuationItemSnapshot.deleteMany({ where: { valuationRunId: runId } });
    await db.investmentValuationException.deleteMany({
      where: { valuationRunId: runId, status: "OPEN" },
    });

    for (const row of inputRows) {
      await db.investmentValuationInputSnapshot.create({ data: row });
    }

    const exceptions = [];
    const itemRows = [];
    let nav = new Decimal(0);

    for (const h of holdings) {
      const tick = await db.listedEquityPriceTick.findFirst({
        where: { securityId: h.securityId, validationStatus: "APPROVED" },
        orderBy: { pricedAt: "desc" },
      });
      if (!tick) {
        const ex = await db.investmentValuationException.create({
          data: {
            valuationRunId: runId,
            fundId,
            securityId: h.securityId,
            exceptionType: "MISSING_APPROVED_PRICE",
            message: "No approved price for holding",
            status: "OPEN",
          },
        });
        exceptions.push(ex);
        continue;
      }

      const priceInput = {
        priceTickId: tick.id,
        price: String(tick.price),
        pricedAt: tick.pricedAt,
        securityId: h.securityId,
      };
      await db.investmentValuationInputSnapshot.create({
        data: {
          valuationRunId: runId,
          inputType: "PRICE_TICK",
          // Uniquify under (run, inputType, instrumentId) without a migration.
          instrumentId: h.instrumentId || h.securityId,
          priceTickId: tick.id,
          valueJson: priceInput,
          contentHash: contentChecksum(priceInput),
          sourceCode: "PRICE_TICK",
          sourceObservedAt: tick.pricedAt,
        },
      });

      const qty = dec(h.quantity);
      const price = dec(tick.price);
      const wac = dec(h.wac);
      const marketValue = qty.mul(price);
      const costValue = qty.mul(wac);
      const unrealized = marketValue.minus(costValue);
      const fingerprint = createHash("sha256")
        .update(
          JSON.stringify({
            holdingId: h.id,
            qty: qty.toString(),
            price: price.toString(),
            tickId: tick.id,
            formula: FORMULA_VERSION,
          })
        )
        .digest("hex");

      itemRows.push({
        valuationRunId: runId,
        fundId,
        instrumentId: h.instrumentId ?? null,
        securityId: h.securityId,
        quantity: qty,
        price,
        marketValue,
        baseMarketValue: marketValue,
        costValue,
        unrealizedPnl: unrealized,
        currencyCode: h.wacCurrencyCode || "USD",
        methodCode: method,
        inputFingerprint: fingerprint,
      });
      nav = nav.plus(marketValue);
    }

    for (const cash of cashBalances) {
      nav = nav.plus(dec(cash.balance));
    }

    if (itemRows.length) {
      await db.investmentValuationItemSnapshot.createMany({ data: itemRows });
    }

    // Keep listed-equity snapshot for portfolio consumers
    await PortfolioValuationEngine.runFundValuation(fundId);

    const status = exceptions.length ? "COMPLETED_WITH_EXCEPTIONS" : "COMPLETED";
    const updated = await db.investmentValuationRun.update({
      where: { id: runId },
      data: {
        status,
        navBaseCurrency: nav,
        completedAt: new Date(),
        version: { increment: 1 },
        parametersJson: {
          ...(run.parametersJson as object),
          inputChecksum: contentChecksum(inputRows.map((r) => r.contentHash)),
          formulaVersion: FORMULA_VERSION,
          policyVersion: POLICY_VERSION,
        },
      },
      include: { exceptions: true, itemSnapshots: true },
    });

    await InvestmentOpsAuditService.log(
      "VALUATION_RUN_COMPLETED",
      "ValuationRun",
      runId,
      { status, exceptionCount: exceptions.length, nav: nav.toString() },
      run.startedById
    );
    try {
      const { InvestmentOutboxService } = await import("./InvestmentOutboxService");
      const { InvestmentAuditEventService } = await import("./InvestmentAuditEventService");
      await InvestmentOutboxService.enqueue({
        aggregateType: "ValuationRun",
        aggregateId: runId,
        aggregateVersion: Number(updated?.version || 1),
        eventType: "VALUATION_COMPLETED",
        payloadJson: { runId, status, nav: nav.toString() },
        idempotencyKey: `outbox:valuation-completed:${runId}`,
      });
      await InvestmentAuditEventService.append({
        aggregateType: "ValuationRun",
        aggregateId: runId,
        eventType: "VALUATION_COMPLETED",
        actorId: run.startedById,
        afterJson: { status, nav: nav.toString() },
      });
    } catch {
      // Platform event sinks must not fail valuation completion.
    }
    return serializeRun(updated);
  }
}

registerInvestmentJobHandler("VALUATION_RUN", async (job) => {
  const runId = (job.payloadJson as any)?.valuationRunId;
  if (!runId) throw new Error("valuationRunId missing from job payload");
  const run = await db.investmentValuationRun.findUnique({ where: { id: runId } });
  if (!run || run.status === "CANCELLED") return { skipped: true, status: run?.status };
  return InvestmentValuationService.executeRun(runId);
});
