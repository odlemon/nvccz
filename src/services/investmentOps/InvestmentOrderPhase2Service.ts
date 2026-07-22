// @ts-nocheck
import { createHash, randomUUID } from "crypto";
import { Decimal } from "@prisma/client/runtime/library";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { orderRef, paginatedResult, parsePagination } from "./investmentOpsSupport";
import { InvestmentComplianceService } from "./InvestmentComplianceService";
import { InvestmentAccountingFacadeService } from "./InvestmentAccountingFacadeService";
import { InvestmentOpsAuditService } from "./InvestmentOpsAuditService";

const db = prisma as any;
const PREVIEW_TTL_MS = 15 * 60_000;

export const ORDER_TRANSITIONS: Record<string, readonly string[]> = {
  DRAFT: ["SUBMITTED", "COMPLIANCE_REVIEW", "CANCELLED"],
  SUBMITTED: ["COMPLIANCE_REVIEW", "APPROVED", "REJECTED", "CANCELLED"],
  COMPLIANCE_REVIEW: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["SENT_TO_BROKER", "CANCELLED"],
  SENT_TO_BROKER: [
    "BROKER_CONFIRMATION_RECORDED",
    "PARTIALLY_EXECUTED",
    "EXECUTED",
    "CANCELLED",
    "FAILED",
  ],
  BROKER_CONFIRMATION_RECORDED: [
    "SENT_TO_BROKER",
    "PARTIALLY_EXECUTED",
    "EXECUTED",
    "CANCELLED",
    "FAILED",
  ],
  PARTIALLY_EXECUTED: ["EXECUTED", "CANCELLED", "FAILED"],
  EXECUTED: ["PENDING_SETTLEMENT", "SETTLED", "FAILED"],
  PENDING_SETTLEMENT: ["SETTLED", "FAILED"],
  SETTLED: ["ARCHIVED"],
  REJECTED: ["ARCHIVED"],
  CANCELLED: ["ARCHIVED"],
  FAILED: ["ARCHIVED"],
};

function fail(code: string, message: string, status = 400, details?: unknown): never {
  throw new InvestmentOpsError(code, message, status, details);
}

function required(value: unknown, field: string): string {
  const text = String(value ?? "").trim();
  if (!text) fail("VALIDATION_ERROR", `${field} is required`, 400, { field });
  return text;
}

function positiveDecimal(value: unknown, field: string): Decimal {
  let decimal: Decimal;
  try {
    decimal = new Decimal(required(value, field));
  } catch {
    fail("INVALID_DECIMAL", `${field} must be a decimal string`, 400, { field });
  }
  if (!decimal!.isPositive()) fail("INVALID_DECIMAL", `${field} must be greater than zero`, 400, { field });
  return decimal!;
}

function canonical(value: any): any {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object" && !(value instanceof Date) && !Decimal.isDecimal(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, canonical(value[key])])
    );
  }
  if (Decimal.isDecimal(value)) return value.toString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function investmentOrderInputHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}

export function assertOrderTransition(from: string, to: string): void {
  if (!ORDER_TRANSITIONS[from]?.includes(to)) {
    fail("INVALID_ORDER_TRANSITION", `Invalid order transition ${from} -> ${to}`, 409, {
      from,
      to,
      allowed: ORDER_TRANSITIONS[from] || [],
    });
  }
}

export function assertCumulativeFill(orderQuantity: unknown, existingQuantity: unknown, nextQuantity: unknown) {
  const total = new Decimal(String(existingQuantity || 0)).plus(String(nextQuantity || 0));
  if (total.gt(String(orderQuantity))) {
    fail("OVERFILL_NOT_ALLOWED", "Cumulative execution quantity exceeds order quantity", 409, {
      orderQuantity: String(orderQuantity),
      cumulativeQuantity: total.toString(),
    });
  }
  return total;
}

function normalizedInput(data: any) {
  const side = required(data.side, "side").toUpperCase();
  if (!["BUY", "SELL"].includes(side)) fail("INVALID_ORDER_SIDE", "side must be BUY or SELL");
  return canonical({
    fundId: required(data.fundId, "fundId"),
    folderId: data.folderId || null,
    instrumentId: data.instrumentId || null,
    securityId: data.securityId || null,
    side,
    quantity: positiveDecimal(data.quantity, "quantity").toString(),
    orderType: String(data.orderType || "MARKET").toUpperCase(),
    limitPrice: data.limitPrice == null ? null : positiveDecimal(data.limitPrice, "limitPrice").toString(),
    tradeCurrency: required(data.tradeCurrency, "tradeCurrency").toUpperCase(),
    settlementCurrency: String(data.settlementCurrency || data.tradeCurrency).toUpperCase(),
    brokerProfileId: data.brokerProfileId || null,
    custodianProfileId: data.custodianProfileId || null,
    tradeDate: data.tradeDate ? new Date(data.tradeDate).toISOString().slice(0, 10) : null,
    valueDate: data.valueDate ? new Date(data.valueDate).toISOString().slice(0, 10) : null,
    notes: data.notes || null,
  });
}

async function orderForAccess(id: string, userId: string, user: any, include: any = {}) {
  const order = await db.investmentOrder.findUnique({ where: { id }, include });
  if (!order) fail("ORDER_NOT_FOUND", "Order not found", 404);
  await ListedEquityAccessService.assertFundAccess(userId, order.fundId, user);
  return order;
}

function assertVersion(order: any, expectedVersion: string) {
  if (String(order.version) !== String(expectedVersion)) {
    fail("VERSION_CONFLICT", "Order has changed since it was read", 409, {
      expectedVersion,
      currentVersion: String(order.version),
    });
  }
}

async function nextEventSequence(tx: any, orderId: string) {
  const latest = await tx.investmentOrderStatusEvent.findFirst({
    where: { orderId },
    orderBy: { sequenceNo: "desc" },
    select: { sequenceNo: true },
  });
  return (latest?.sequenceNo || 0) + 1;
}

async function appendEvent(
  tx: any,
  order: any,
  toStatus: string,
  actorId: string,
  idempotencyKey: string,
  reasonCode: string,
  reason?: string,
  sequenceNo?: number
) {
  return tx.investmentOrderStatusEvent.create({
    data: {
      orderId: order.id,
      sequenceNo: sequenceNo ?? (await nextEventSequence(tx, order.id)),
      fromStatus: order.status,
      toStatus,
      actorId,
      reasonCode,
      reason,
      idempotencyKey,
    },
  });
}

async function latestApprovedPrice(securityId: string) {
  const rows = await db.$queryRawUnsafe(
    `SELECT id, security_id AS securityId, price, price_type AS priceType, priced_at AS pricedAt,
            source_code AS sourceCode, validation_status AS validationStatus
     FROM listed_equity_price_ticks
     WHERE security_id = ? AND validation_status = 'APPROVED'
     ORDER BY priced_at DESC, created_at DESC
     LIMIT 1`,
    securityId
  );
  const tick = Array.isArray(rows) ? rows[0] : null;
  if (!tick) fail("APPROVED_PRICE_REQUIRED", "No approved price exists for this security", 422, { securityId });
  return tick;
}

async function approvedFx(baseCurrencyCode: string, quoteCurrencyCode: string) {
  if (baseCurrencyCode === quoteCurrencyCode) return null;
  const fx = await db.investmentFxRateSnapshot.findFirst({
    where: { baseCurrencyCode, quoteCurrencyCode, approvalStatus: "APPROVED" },
    orderBy: [{ sourceObservedAt: "desc" }, { createdAt: "desc" }],
  });
  if (!fx) {
    fail("APPROVED_FX_REQUIRED", "No approved FX snapshot exists for the currency pair", 422, {
      baseCurrencyCode,
      quoteCurrencyCode,
    });
  }
  return fx;
}

async function loadCashBalanceByFund(fundId: string, settlementCurrency: string) {
  const rows = await db.$queryRawUnsafe(
    `SELECT a.id AS cashAccountId, e.id AS ledgerEntryId, e.running_balance AS runningBalance
     FROM investment_portfolio_configs p
     INNER JOIN investment_cash_accounts a ON a.portfolio_config_id = p.id
     LEFT JOIN investment_cash_ledger_entries e
       ON e.cash_account_id = a.id AND e.status = 'POSTED'
     WHERE p.fund_id = ? AND a.currency_code = ? AND a.status = 'ACTIVE'
     ORDER BY a.created_at ASC, e.effective_at DESC, e.id DESC
     LIMIT 1`,
    fundId,
    settlementCurrency
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.cashAccountId) return { cashAccount: null, lastCash: null, cashBefore: new Decimal(0) };
  return {
    cashAccount: { id: row.cashAccountId },
    lastCash: row.ledgerEntryId ? { id: row.ledgerEntryId, runningBalance: row.runningBalance } : null,
    cashBefore: new Decimal(row.runningBalance ?? 0),
  };
}

/** One remote round-trip for submit/update preview inputs when securityId is known. */
async function loadKnownSecurityPreviewBundle(
  fundId: string,
  securityId: string,
  settlementCurrency: string,
  brokerProfileId: string | null
) {
  const rows = await db.$queryRawUnsafe(
    `SELECT
       (SELECT base_currency_code FROM investment_portfolio_configs WHERE fund_id = ? LIMIT 1) AS portfolioBase,
       (SELECT base_currency_code FROM listed_equity_fund_configs WHERE fund_id = ? LIMIT 1) AS fundBase,
       (SELECT id FROM listed_equity_valuation_snapshots WHERE fund_id = ? ORDER BY as_of DESC LIMIT 1) AS valuationId,
       (SELECT nav_base_currency FROM listed_equity_valuation_snapshots WHERE fund_id = ? ORDER BY as_of DESC LIMIT 1) AS nav,
       t.id AS tickId, t.price AS tickPrice, t.price_type AS tickPriceType, t.priced_at AS tickPricedAt,
       t.source_code AS tickSourceCode, t.validation_status AS tickValidationStatus,
       h.id AS holdingId, h.quantity AS holdingQty, h.wac AS holdingWac,
       a.id AS cashAccountId, e.id AS ledgerEntryId, e.running_balance AS runningBalance,
       c.id AS commissionId, c.rate_bps AS commissionRateBps, c.flat_fee AS commissionFlatFee
     FROM (SELECT 1) AS _
     LEFT JOIN listed_equity_price_ticks t
       ON t.id = (
         SELECT id FROM listed_equity_price_ticks
         WHERE security_id = ? AND validation_status = 'APPROVED'
         ORDER BY priced_at DESC, created_at DESC LIMIT 1
       )
     LEFT JOIN listed_equity_holdings h
       ON h.fund_id = ? AND h.security_id = ?
     LEFT JOIN investment_cash_accounts a
       ON a.id = (
         SELECT a2.id
         FROM investment_cash_accounts a2
         INNER JOIN investment_portfolio_configs p2 ON p2.id = a2.portfolio_config_id
         WHERE p2.fund_id = ? AND a2.currency_code = ? AND a2.status = 'ACTIVE'
         ORDER BY a2.created_at ASC LIMIT 1
       )
     LEFT JOIN investment_cash_ledger_entries e
       ON e.id = (
         SELECT e2.id FROM investment_cash_ledger_entries e2
         WHERE e2.cash_account_id = a.id AND e2.status = 'POSTED'
         ORDER BY e2.effective_at DESC, e2.id DESC LIMIT 1
       )
     LEFT JOIN investment_broker_commissions c
       ON c.id = (
         SELECT c2.id FROM investment_broker_commissions c2
         WHERE (? IS NOT NULL) AND c2.stakeholder_profile_id = ? AND c2.is_active = 1
         ORDER BY c2.instrument_type_code DESC LIMIT 1
       )`,
    fundId,
    fundId,
    fundId,
    fundId,
    securityId,
    fundId,
    securityId,
    fundId,
    settlementCurrency,
    brokerProfileId,
    brokerProfileId
  );
  return Array.isArray(rows) ? rows[0] : null;
}

async function calculatePreview(input: any) {
  const knownSecurityId = input.securityId || null;

  let instrument: any = null;
  let portfolio: any = null;
  let fundConfig: any = null;
  let valuationSnap: any = null;
  let rules: any[] = [];
  let tick: any = null;
  let holding: any = null;
  let cashBundle: any = null;
  let commission: any = null;
  let fx = null as any;

  if (knownSecurityId) {
    // Fast path: 1 SQL bundle + instrument + rules (3 remote RTTs in parallel).
    const [bundle, inst, ruleRows] = await Promise.all([
      loadKnownSecurityPreviewBundle(
        input.fundId,
        knownSecurityId,
        input.settlementCurrency,
        input.brokerProfileId || null
      ),
      input.instrumentId
        ? db.investmentInstrument.findUnique({ where: { id: input.instrumentId } })
        : Promise.resolve(null),
      InvestmentComplianceService.listRules(input.fundId),
    ]);
    if (!bundle?.tickId) {
      fail("APPROVED_PRICE_REQUIRED", "No approved price exists for this security", 422, {
        securityId: knownSecurityId,
      });
    }
    instrument = inst;
    rules = ruleRows;
    portfolio = bundle.portfolioBase ? { baseCurrencyCode: bundle.portfolioBase } : null;
    fundConfig = bundle.fundBase ? { baseCurrencyCode: bundle.fundBase } : null;
    valuationSnap = bundle.valuationId
      ? { id: bundle.valuationId, navBaseCurrency: bundle.nav }
      : null;
    tick = {
      id: bundle.tickId,
      price: bundle.tickPrice,
      priceType: bundle.tickPriceType,
      pricedAt: bundle.tickPricedAt,
      sourceCode: bundle.tickSourceCode,
      validationStatus: bundle.tickValidationStatus,
    };
    holding = bundle.holdingId
      ? { id: bundle.holdingId, quantity: bundle.holdingQty, wac: bundle.holdingWac }
      : null;
    cashBundle = bundle.cashAccountId
      ? {
          cashAccount: { id: bundle.cashAccountId },
          lastCash: bundle.ledgerEntryId
            ? { id: bundle.ledgerEntryId, runningBalance: bundle.runningBalance }
            : null,
          cashBefore: new Decimal(bundle.runningBalance ?? 0),
        }
      : { cashAccount: null, lastCash: null, cashBefore: new Decimal(0) };
    commission = bundle.commissionId
      ? {
          id: bundle.commissionId,
          rateBps: bundle.commissionRateBps,
          flatFee: bundle.commissionFlatFee,
        }
      : null;
  } else {
    const [inst, port, fcfg, valuation, ruleRows] = await Promise.all([
      input.instrumentId
        ? db.investmentInstrument.findUnique({ where: { id: input.instrumentId } })
        : Promise.resolve(null),
      db.investmentPortfolioConfig.findUnique({
        where: { fundId: input.fundId },
        select: { id: true, baseCurrencyCode: true },
      }),
      db.listedEquityFundConfig.findUnique({
        where: { fundId: input.fundId },
        select: { baseCurrencyCode: true },
      }),
      db.listedEquityValuationSnapshot.findFirst({
        where: { fundId: input.fundId },
        orderBy: { asOf: "desc" },
        select: { id: true, navBaseCurrency: true },
      }),
      InvestmentComplianceService.listRules(input.fundId),
    ]);
    instrument = inst;
    portfolio = port;
    fundConfig = fcfg;
    valuationSnap = valuation;
    rules = ruleRows;
  }

  if (input.instrumentId && !instrument) fail("INSTRUMENT_NOT_FOUND", "Instrument not found", 404);
  if (instrument && !["ACTIVE", "APPROVED"].includes(instrument.status)) {
    fail("INSTRUMENT_NOT_APPROVED", "Only ACTIVE instruments may be traded", 409);
  }
  const securityId = knownSecurityId || instrument?.listedEquitySecurityId;
  if (!securityId) fail("SECURITY_REQUIRED", "A listed-equity security mapping is required", 422);
  const baseCurrency = portfolio?.baseCurrencyCode || fundConfig?.baseCurrencyCode;
  if (!baseCurrency) fail("PORTFOLIO_CONFIG_REQUIRED", "Portfolio base currency is not configured", 422);

  if (!knownSecurityId) {
    const [t, h, c, fxRow, comm] = await Promise.all([
      latestApprovedPrice(securityId),
      db.listedEquityHolding.findUnique({
        where: { fundId_securityId: { fundId: input.fundId, securityId } },
        select: { id: true, quantity: true, wac: true },
      }),
      loadCashBalanceByFund(input.fundId, input.settlementCurrency),
      approvedFx(input.tradeCurrency, baseCurrency),
      input.brokerProfileId
        ? db.investmentBrokerCommission.findFirst({
            where: {
              stakeholderProfileId: input.brokerProfileId,
              isActive: true,
              OR: [{ instrumentTypeCode: instrument?.instrumentTypeCode }, { instrumentTypeCode: null }],
            },
            orderBy: { instrumentTypeCode: "desc" },
            select: { id: true, rateBps: true, flatFee: true },
          })
        : Promise.resolve(null),
    ]);
    tick = t;
    holding = h;
    cashBundle = c;
    fx = fxRow;
    commission = comm;
  } else if (input.tradeCurrency !== baseCurrency) {
    fx = await approvedFx(input.tradeCurrency, baseCurrency);
  }

  const price = input.limitPrice ? new Decimal(input.limitPrice) : new Decimal(tick.price);
  const fxRate = fx ? new Decimal(fx.rate) : new Decimal(1);
  const quantity = new Decimal(input.quantity);
  const holdingQty = new Decimal(holding?.quantity || 0);
  if (input.side === "SELL" && quantity.gt(holdingQty)) {
    fail("INSUFFICIENT_HOLDING", "Sell quantity exceeds the persisted holding", 422, {
      availableQuantity: holdingQty.toString(),
    });
  }
  const gross = quantity.mul(price);
  const fee = gross.mul(new Decimal(commission?.rateBps || 0).div(10_000)).plus(commission?.flatFee || 0);
  const tax = new Decimal(0);
  const settlement = input.side === "BUY" ? gross.plus(fee).plus(tax) : gross.minus(fee).minus(tax);
  const { cashAccount, lastCash, cashBefore } = cashBundle;
  const cashImpact = input.side === "BUY" ? settlement.neg() : settlement;
  const cashAfter = cashBefore.plus(cashImpact);
  if (input.side === "BUY" && cashAfter.isNegative()) {
    fail("INSUFFICIENT_CASH", "Persisted available cash is insufficient", 422, {
      cashBefore: cashBefore.toString(),
      required: settlement.toString(),
    });
  }

  const portfolioValue =
    valuationSnap?.navBaseCurrency != null ? new Decimal(valuationSnap.navBaseCurrency) : new Decimal(0);
  const baseGross = gross.mul(fxRate);
  const valueAfter = input.side === "BUY" ? portfolioValue.plus(baseGross) : portfolioValue.minus(baseGross);
  const currentSecurityValue = holdingQty.mul(tick.price).mul(fxRate);
  const securityValueAfter =
    input.side === "BUY" ? currentSecurityValue.plus(baseGross) : currentSecurityValue.minus(baseGross);
  const realizedPnl =
    input.side === "SELL" ? quantity.mul(price.minus(new Decimal(holding?.wac || 0))) : new Decimal(0);
  const nav = Number(valuationSnap?.navBaseCurrency || 0);
  const compliance = InvestmentComplianceService.evaluateRules(rules, {
    order: { side: input.side, instrument },
    weightPct: nav > 0 ? (Number(baseGross) / nav) * 100 : 100,
    nav,
  });

  return {
    securityId,
    instrument,
    estimated: canonical({
      approvedPrice: {
        tickId: tick.id,
        price: tick.price,
        priceType: tick.priceType,
        pricedAt: tick.pricedAt,
        sourceCode: tick.sourceCode,
      },
      approvedFx: fx
        ? {
            snapshotId: fx.id,
            rate: fx.rate,
            pair: `${fx.baseCurrencyCode}/${fx.quoteCurrencyCode}`,
            sourceObservedAt: fx.sourceObservedAt,
            sourceCode: fx.sourceCode,
          }
        : { snapshotId: null, rate: "1", pair: `${baseCurrency}/${baseCurrency}` },
      holding: {
        holdingId: holding?.id || null,
        quantityBefore: holdingQty,
        quantityAfter: input.side === "BUY" ? holdingQty.plus(quantity) : holdingQty.minus(quantity),
        wac: holding?.wac || "0",
      },
      cash: {
        cashAccountId: cashAccount?.id || null,
        ledgerEntryId: lastCash?.id || null,
        balanceBefore: cashBefore,
        impact: cashImpact,
        balanceAfter: cashAfter,
      },
      feesAndTaxes: {
        commissionId: commission?.id || null,
        commissionRateBps: commission?.rateBps || "0",
        feeAmount: fee,
        taxAmount: tax,
      },
      settlement: {
        grossAmount: gross,
        netAmount: settlement,
        tradeCurrency: input.tradeCurrency,
        settlementCurrency: input.settlementCurrency,
        tradeDate: input.tradeDate,
        valueDate: input.valueDate,
      },
      pnl: { estimatedRealizedPnl: realizedPnl, costBasisMethod: "WAC" },
      exposure: {
        portfolioValueBeforeBase: portfolioValue,
        portfolioValueAfterBase: valueAfter,
        securityValueAfterBase: securityValueAfter,
        securityWeightAfterPct: valueAfter.isZero() ? "0" : securityValueAfter.div(valueAfter).mul(100),
        navSource: valuationSnap?.id ? "VALUATION_SNAPSHOT" : "ZERO_FALLBACK",
      },
    }),
    compliance,
    priceSnapshotId: tick.id,
    fxSnapshotId: fx?.id || null,
    valuationSnapshotId: valuationSnap?.id || null,
    complianceRules: rules,
  };
}

export class InvestmentOrderPhase2Service {
  static async preview(data: any, idempotencyKey: string, userId: string, user: any) {
    const input = normalizedInput(data);
    await ListedEquityAccessService.assertFundAccess(userId, input.fundId, user);
    const replay = await db.investmentOrderPreview.findUnique({ where: { idempotencyKey } });
    if (replay) {
      const replayInput = replay.inputJson as any;
      if (replayInput.inputHash !== investmentOrderInputHash(input)) {
        fail("IDEMPOTENCY_KEY_REUSED", "Idempotency key was used with different preview input", 409);
      }
      return replay;
    }
    const calculated = await calculatePreview(input);
    const inputHash = investmentOrderInputHash(input);
    return db.$transaction(
      async (tx: any) => {
        const order = await tx.investmentOrder.create({
          data: {
            orderRef: orderRef(),
            fundId: input.fundId,
            folderId: input.folderId,
            instrumentId: input.instrumentId,
            securityId: calculated.securityId,
            side: input.side,
            quantity: new Decimal(input.quantity),
            orderType: input.orderType,
            limitPrice: input.limitPrice ? new Decimal(input.limitPrice) : null,
            executionPrice: new Decimal((calculated.estimated as any).approvedPrice.price),
            tradeCurrency: input.tradeCurrency,
            settlementCurrency: input.settlementCurrency,
            brokerProfileId: input.brokerProfileId,
            custodianProfileId: input.custodianProfileId,
            tradeDate: input.tradeDate ? new Date(input.tradeDate) : null,
            valueDate: input.valueDate ? new Date(input.valueDate) : null,
            notes: input.notes,
            status: "DRAFT",
            createdById: userId,
          },
        });
        const preview = await tx.investmentOrderPreview.create({
          data: {
            orderId: order.id,
            revisionNo: 1,
            idempotencyKey,
            inputJson: { ...input, inputHash },
            estimatedJson: calculated.estimated,
            complianceJson: calculated.compliance,
            priceSnapshotId: calculated.priceSnapshotId,
            fxSnapshotId: calculated.fxSnapshotId,
            expiresAt: new Date(Date.now() + PREVIEW_TTL_MS),
            createdById: userId,
          },
        });
        return { ...preview, inputHash };
      },
      { maxWait: 10_000, timeout: 30_000 }
    );
  }

  static async create(data: any, idempotencyKey: string, userId: string, user: any) {
    const previewId = required(data.previewId, "previewId");
    const inputHash = required(data.inputHash, "inputHash");
    const replay = await db.investmentOrder.findUnique({ where: { idempotencyKey } });
    if (replay) return this.get(replay.id, userId, user);
    const preview = await db.investmentOrderPreview.findUnique({ where: { id: previewId } });
    if (!preview) fail("PREVIEW_NOT_FOUND", "Order preview not found", 404);
    const storedInput = preview.inputJson as any;
    await ListedEquityAccessService.assertFundAccess(userId, storedInput.fundId, user);
    if (preview.expiresAt <= new Date()) fail("PREVIEW_EXPIRED", "Order preview has expired", 409);
    if (storedInput.inputHash !== inputHash) fail("INPUT_HASH_MISMATCH", "inputHash does not match preview", 409);
    const snapshot = canonical({
      ...storedInput,
      previewId,
      estimated: preview.estimatedJson,
      compliance: preview.complianceJson,
    });
    await db.$transaction(
      async (tx: any) => {
        const claimed = await tx.investmentOrder.updateMany({
          where: { id: preview.orderId, status: "DRAFT", idempotencyKey: null },
          data: { idempotencyKey },
        });
        if (claimed.count !== 1) fail("PREVIEW_ALREADY_CONSUMED", "Preview has already been consumed", 409);
        await tx.investmentOrderRevision.create({
          data: {
            orderId: preview.orderId,
            revisionNo: 1,
            snapshotJson: snapshot,
            contentHash: investmentOrderInputHash(snapshot),
            createdById: userId,
          },
        });
        await tx.investmentOrderStatusEvent.create({
          data: {
            orderId: preview.orderId,
            sequenceNo: 1,
            toStatus: "DRAFT",
            actorId: userId,
            reasonCode: "CREATE",
            idempotencyKey: `${idempotencyKey}:create`,
          },
        });
      },
      { maxWait: 10_000, timeout: 30_000 }
    );
    return this.get(preview.orderId, userId, user);
  }

  static async list(userId: string, user: any, query: any) {
    const fundFilter = await ListedEquityAccessService.accessibleFundIdFilter(userId, user, query.fundId);
    const page = parsePagination(query);
    const where = {
      ...fundFilter,
      idempotencyKey: { not: null },
      ...(query.status ? { status: query.status } : {}),
    };
    const [items, total] = await Promise.all([
      db.investmentOrder.findMany({
        where,
        include: {
          instrument: true,
          executions: { select: { quantity: true, feeAmount: true, taxAmount: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.take,
      }),
      db.investmentOrder.count({ where }),
    ]);
    const fundIds = [...new Set(items.map((o: any) => o.fundId))];
    const brokerIds = [...new Set(items.map((o: any) => o.brokerProfileId).filter(Boolean))];
    const custodianIds = [...new Set(items.map((o: any) => o.custodianProfileId).filter(Boolean))];
    const creatorIds = [...new Set(items.map((o: any) => o.createdById).filter(Boolean))];
    const [funds, stakeholders, creators] = await Promise.all([
      fundIds.length
        ? db.fund.findMany({ where: { id: { in: fundIds } }, select: { id: true, name: true } })
        : [],
      [...brokerIds, ...custodianIds].length
        ? db.listedEquityStakeholderProfile.findMany({
            where: { id: { in: [...brokerIds, ...custodianIds] } },
            select: { id: true, name: true },
          })
        : [],
      creatorIds.length
        ? db.user.findMany({
            where: { id: { in: creatorIds } },
            select: { id: true, firstName: true, lastName: true, email: true },
          })
        : [],
    ]);
    const fundName = Object.fromEntries(funds.map((f: any) => [f.id, f.name]));
    const stakeName = Object.fromEntries(stakeholders.map((s: any) => [s.id, s.name]));
    const creatorName = Object.fromEntries(
      creators.map((u: any) => [
        u.id,
        `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || u.id,
      ])
    );
    const presented = items.map((o: any) => {
      const filledQuantity = (o.executions || []).reduce(
        (s: number, e: any) => s + Number(e.quantity || 0),
        0
      );
      const fees = (o.executions || []).reduce((s: number, e: any) => s + Number(e.feeAmount || 0), 0);
      const taxes = (o.executions || []).reduce((s: number, e: any) => s + Number(e.taxAmount || 0), 0);
      return {
        ...o,
        fundName: fundName[o.fundId] ?? null,
        fund: { id: o.fundId, name: fundName[o.fundId] ?? null },
        brokerName: o.brokerProfileId ? stakeName[o.brokerProfileId] ?? null : null,
        custodianName: o.custodianProfileId ? stakeName[o.custodianProfileId] ?? null : null,
        ownerName: o.createdById ? creatorName[o.createdById] ?? null : null,
        createdByName: o.createdById ? creatorName[o.createdById] ?? null : null,
        filledQuantity: String(filledQuantity),
        quantity: o.quantity != null ? String(o.quantity) : null,
        limitPrice: o.limitPrice != null ? String(o.limitPrice) : null,
        executionPrice: o.executionPrice != null ? String(o.executionPrice) : null,
        taxes: String(taxes),
        fees: String(fees),
        feesBreakdown: { fees: String(fees), taxes: String(taxes) },
      };
    });
    return paginatedResult(presented, total, page.page, page.pageSize);
  }

  static async get(id: string, userId: string, user: any) {
    return orderForAccess(id, userId, user, {
      instrument: true,
      previews: { orderBy: { revisionNo: "desc" }, take: 1 },
      revisions: { orderBy: { revisionNo: "desc" } },
      statusEvents: { orderBy: { sequenceNo: "asc" } },
      approvals: { orderBy: [{ revisionNo: "desc" }, { approvalSequence: "asc" }] },
      routes: { orderBy: { routeSequence: "asc" } },
      executions: { orderBy: { executedAt: "asc" } },
      complianceRuns: { include: { results: true }, orderBy: { createdAt: "desc" } },
    });
  }

  static async update(id: string, data: any, expectedVersion: string, userId: string, user: any) {
    const order = await orderForAccess(id, userId, user);
    assertVersion(order, expectedVersion);
    if (order.status !== "DRAFT") fail("ORDER_NOT_EDITABLE", "Only draft orders can be edited", 409);
    const input = normalizedInput({ ...order, ...data, fundId: order.fundId });
    const calculated = await calculatePreview(input);
    const revisionNo = order.currentRevisionNo + 1;
    const snapshot = canonical({ ...input, estimated: calculated.estimated, compliance: calculated.compliance });
    await db.$transaction(async (tx: any) => {
      const changed = await tx.investmentOrder.updateMany({
        where: { id, version: order.version, status: "DRAFT" },
        data: {
          folderId: input.folderId,
          instrumentId: input.instrumentId,
          securityId: calculated.securityId,
          side: input.side,
          quantity: new Decimal(input.quantity),
          orderType: input.orderType,
          limitPrice: input.limitPrice ? new Decimal(input.limitPrice) : null,
          executionPrice: new Decimal((calculated.estimated as any).approvedPrice.price),
          tradeCurrency: input.tradeCurrency,
          settlementCurrency: input.settlementCurrency,
          brokerProfileId: input.brokerProfileId,
          custodianProfileId: input.custodianProfileId,
          tradeDate: input.tradeDate ? new Date(input.tradeDate) : null,
          valueDate: input.valueDate ? new Date(input.valueDate) : null,
          notes: input.notes,
          currentRevisionNo: revisionNo,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) fail("VERSION_CONFLICT", "Order changed during update", 409);
      await tx.investmentOrderRevision.create({
        data: {
          orderId: id,
          revisionNo,
          snapshotJson: snapshot,
          changeReason: data.changeReason,
          contentHash: investmentOrderInputHash(snapshot),
          createdById: userId,
        },
      });
    });
    return this.get(id, userId, user);
  }

  static async transition(
    id: string,
    toStatus: string,
    expectedVersion: string,
    idempotencyKey: string,
    userId: string,
    user: any,
    reasonCode: string,
    reason?: string
  ) {
    const replay = await db.investmentOrderStatusEvent.findUnique({ where: { idempotencyKey } });
    if (replay) return this.get(replay.orderId, userId, user);
    const order = await orderForAccess(id, userId, user);
    assertVersion(order, expectedVersion);
    assertOrderTransition(order.status, toStatus);
    await db.$transaction(async (tx: any) => {
      const changed = await tx.investmentOrder.updateMany({
        where: { id, version: order.version, status: order.status },
        data: {
          status: toStatus,
          version: { increment: 1 },
          ...(toStatus === "SUBMITTED" ? { submittedAt: new Date() } : {}),
          ...(toStatus === "APPROVED" ? { approvedAt: new Date() } : {}),
        },
      });
      if (changed.count !== 1) fail("VERSION_CONFLICT", "Order changed during transition", 409);
      await appendEvent(tx, order, toStatus, userId, idempotencyKey, reasonCode, reason);
    });
    return this.get(id, userId, user);
  }

  /** Ticket payload after mutate — avoids full history/routes/approvals graph. */
  static async getTicket(id: string, userId: string, user: any) {
    return orderForAccess(id, userId, user, {
      instrument: true,
      complianceRuns: { include: { results: true }, orderBy: { createdAt: "desc" }, take: 1 },
    });
  }

  static async submit(
    id: string,
    expectedVersion: string,
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    const [replay, order] = await Promise.all([
      db.investmentOrderStatusEvent.findUnique({
        where: { idempotencyKey },
        select: { orderId: true },
      }),
      db.investmentOrder.findUnique({ where: { id } }),
    ]);
    if (replay) return this.getTicket(replay.orderId, userId, user);
    if (!order) fail("ORDER_NOT_FOUND", "Order not found", 404);
    await ListedEquityAccessService.assertFundAccess(userId, order.fundId, user);
    assertVersion(order, expectedVersion);
    if (order.status !== "DRAFT") fail("INVALID_ORDER_TRANSITION", "Only draft orders can be submitted", 409);
    const input = normalizedInput({
      fundId: order.fundId,
      folderId: order.folderId,
      instrumentId: order.instrumentId,
      securityId: order.securityId,
      side: order.side,
      quantity: order.quantity?.toString?.() ?? order.quantity,
      orderType: order.orderType,
      limitPrice: order.limitPrice?.toString?.() ?? order.limitPrice,
      tradeCurrency: order.tradeCurrency,
      settlementCurrency: order.settlementCurrency || order.tradeCurrency,
      brokerProfileId: order.brokerProfileId,
      custodianProfileId: order.custodianProfileId,
      tradeDate: order.tradeDate,
      valueDate: order.valueDate,
      notes: order.notes,
    });

    // Preview + next event seq overlap (remote MySQL RTT dominates).
    const [calculated, latestEvent] = await Promise.all([
      calculatePreview(input),
      db.investmentOrderStatusEvent.findFirst({
        where: { orderId: id },
        orderBy: { sequenceNo: "desc" },
        select: { sequenceNo: true },
      }),
    ]);

    const revisionNo = order.currentRevisionNo + 1;
    const outcome = (calculated.compliance as any).outcome;
    const toStatus = outcome === "FAILED" || outcome === "WARNING" ? "COMPLIANCE_REVIEW" : "SUBMITTED";
    const estimated = calculated.estimated as any;
    const nav = estimated?.exposure?.portfolioValueBeforeBase ?? "0";
    const executionPrice = new Decimal((calculated.estimated as any).approvedPrice.price);
    const submittedAt = new Date();
    const sequenceNo = (latestEvent?.sequenceNo || 0) + 1;
    const nextSecurityId = calculated.securityId || order.securityId || null;

    // Raw UPDATE — one remote RTT; avoids Prisma updateMany serialization.
    const affected = await db.$executeRawUnsafe(
      `UPDATE investment_orders
       SET current_revision_no = ?,
           compliance_status = ?,
           status = ?,
           submitted_at = ?,
           version = version + 1,
           security_id = COALESCE(?, security_id),
           execution_price = ?,
           updated_at = CURRENT_TIMESTAMP(3)
       WHERE id = ? AND version = ? AND status = 'DRAFT'`,
      revisionNo,
      outcome,
      toStatus,
      submittedAt,
      nextSecurityId,
      executionPrice.toString(),
      id,
      order.version
    );
    if (Number(affected) !== 1) fail("VERSION_CONFLICT", "Order changed during submit", 409);

    // Status is durable. Snapshot + revision/event/compliance run off the request path.
    void (async () => {
      const snapshot = canonical({
        ...input,
        estimated: calculated.estimated,
        compliance: calculated.compliance,
      });
      await Promise.all([
        db.investmentOrderRevision.create({
          data: {
            orderId: id,
            revisionNo,
            snapshotJson: snapshot,
            changeReason: "SUBMIT_RECALCULATION",
            contentHash: investmentOrderInputHash(snapshot),
            createdById: userId,
          },
        }),
        db.investmentOrderStatusEvent.create({
          data: {
            orderId: id,
            sequenceNo,
            fromStatus: order.status,
            toStatus,
            actorId: userId,
            reasonCode: "SUBMIT_RECALCULATED",
            idempotencyKey,
          },
        }),
        InvestmentComplianceService.persistEvaluatedRun(db, {
          fundId: order.fundId,
          orderId: id,
          revisionNo,
          idempotencyKey: `${idempotencyKey}:compliance`,
          userId,
          rules: calculated.complianceRules || [],
          evaluated: calculated.compliance as any,
          inputSnapshot: {
            orderId: id,
            revisionNo,
            quantity: input.quantity,
            price: String(executionPrice),
            nav: String(nav),
            valuationSnapshotId: calculated.valuationSnapshotId || null,
          },
          returnRun: false,
          skipIdempotencyLookup: true,
        }),
      ]);
    })().catch((err: unknown) => {
      console.error("[submit] background side-write failed", { orderId: id, err });
    });

    return {
      ...order,
      securityId: nextSecurityId,
      executionPrice,
      currentRevisionNo: revisionNo,
      complianceStatus: outcome,
      status: toStatus,
      submittedAt,
      version: order.version + 1,
    };
  }

  static async decide(
    id: string,
    decision: "APPROVE" | "REJECT",
    expectedVersion: string,
    idempotencyKey: string,
    userId: string,
    user: any,
    reason?: string
  ) {
    const replay = await db.investmentOrderApproval.findUnique({ where: { idempotencyKey } });
    if (replay) return this.get(replay.orderId, userId, user);
    const order = await orderForAccess(id, userId, user);
    assertVersion(order, expectedVersion);
    if (!["SUBMITTED", "COMPLIANCE_REVIEW"].includes(order.status)) {
      fail("INVALID_ORDER_TRANSITION", `Cannot ${decision.toLowerCase()} order in ${order.status}`, 409);
    }
    if (order.createdById === userId) fail("FOUR_EYE_VIOLATION", "Order maker cannot approve or reject it", 403);
    const latestRevision = await db.investmentOrderRevision.findUnique({
      where: { orderId_revisionNo: { orderId: id, revisionNo: order.currentRevisionNo } },
    });
    if (!latestRevision) fail("ORDER_REVISION_NOT_FOUND", "Current order revision not found", 409);
    const previous = await db.investmentOrderApproval.findMany({
      where: { orderId: id, revisionNo: order.currentRevisionNo },
    });
    if (previous.some((approval: any) => approval.approverId === userId)) {
      fail("FOUR_EYE_VIOLATION", "An approver may decide a revision only once", 409);
    }
    const sequence = previous.length + 1;
    const routeSetting = await db.investmentOpsSetting.findUnique({
      where: { settingKey: "order_approval_routes" },
    });
    const routes = Array.isArray((routeSetting?.settingValue as any)?.routes)
      ? (routeSetting.settingValue as any).routes
      : [];
    const amount = new Decimal(order.quantity).mul(order.executionPrice || order.limitPrice || 0);
    const applicable = routes
      .filter((route: any) => route.isActive)
      .filter((route: any) => !route.criteria?.fundId || route.criteria.fundId === order.fundId)
      .filter((route: any) => !route.criteria?.side || route.criteria.side === order.side)
      .filter((route: any) => route.criteria?.minAmount == null || amount.gte(route.criteria.minAmount))
      .sort((a: any, b: any) => Number(a.priority || 100) - Number(b.priority || 100));
    const steps = applicable[0]?.steps || [{ permission: "investments.approve" }];
    const step = steps[sequence - 1];
    if (decision === "APPROVE" && step) {
      const roleName = String(user?.role?.name || "").toLowerCase();
      const roleCode = String(user?.roleCode || "").toLowerCase();
      const permissions = new Set(
        (Array.isArray(user?.role?.permissions) ? user.role.permissions : [])
          .filter((entry: any) => entry.value === true)
          .map((entry: any) => entry.name)
      );
      if (
        step.role &&
        ![roleName, roleCode].includes(String(step.role).toLowerCase())
      ) {
        fail("APPROVAL_STEP_FORBIDDEN", `Approval step requires role ${step.role}`, 403);
      }
      if (
        step.permission &&
        !permissions.has(step.permission) &&
        !permissions.has("investments.*") &&
        !["admin", "system administrator"].includes(roleName)
      ) {
        fail("APPROVAL_STEP_FORBIDDEN", `Approval step requires ${step.permission}`, 403);
      }
    }
    const approvalComplete = decision === "APPROVE" && sequence >= Math.max(1, steps.length);
    const toStatus = decision === "REJECT" ? "REJECTED" : approvalComplete ? "APPROVED" : order.status;
    if (toStatus !== order.status) assertOrderTransition(order.status, toStatus);
    await db.$transaction(async (tx: any) => {
      await tx.investmentOrderApproval.create({
        data: {
          orderId: id,
          approvalType: decision,
          status: decision === "APPROVE" ? "APPROVED" : "REJECTED",
          approverId: userId,
          reason,
          oldStatus: order.status,
          newStatus: toStatus,
          approvalSequence: sequence,
          revisionNo: order.currentRevisionNo,
          idempotencyKey,
          decidedAt: new Date(),
        },
      });
      const changed = await tx.investmentOrder.updateMany({
        where: { id, version: order.version, currentRevisionNo: order.currentRevisionNo },
        data: {
          status: toStatus,
          approvedAt: approvalComplete ? new Date() : null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) fail("VERSION_CONFLICT", "Order changed during decision", 409);
      if (toStatus !== order.status) {
        await appendEvent(tx, order, toStatus, userId, `${idempotencyKey}:status`, decision, reason);
      }
    });
    return this.get(id, userId, user);
  }

  static history(id: string, userId: string, user: any) {
    return this.get(id, userId, user).then((order: any) => ({
      orderId: order.id,
      currentVersion: order.version,
      currentRevisionNo: order.currentRevisionNo,
      revisions: order.revisions,
      events: order.statusEvents,
      approvals: order.approvals,
    }));
  }

  static async remove(
    id: string,
    expectedVersion: string,
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    return this.transition(id, "CANCELLED", expectedVersion, idempotencyKey, userId, user, "DELETE_DRAFT");
  }

  static async route(
    id: string,
    data: any,
    expectedVersion: string,
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    const replay = await db.investmentOrderRoute.findUnique({ where: { idempotencyKey } });
    if (replay) return replay;
    const order = await orderForAccess(id, userId, user, {
      instrument: { select: { exchangeCode: true } },
    });
    assertVersion(order, expectedVersion);
    if (order.status !== "APPROVED") fail("ORDER_NOT_APPROVED", "Only approved orders can be routed", 409);
    const venueCode =
      (data?.venueCode && String(data.venueCode).trim()) ||
      order.instrument?.exchangeCode ||
      order.tradeCurrency ||
      "MANUAL";

    // Avoid long interactive transactions (remote MySQL + login-side load can exceed 5–20s).
    const latest = await db.investmentOrderRoute.findFirst({
      where: { orderId: id },
      orderBy: { routeSequence: "desc" },
    });
    const route = await db.investmentOrderRoute.create({
      data: {
        orderId: id,
        routeSequence: (latest?.routeSequence || 0) + 1,
        venueCode,
        brokerProfileId: data?.brokerProfileId || order.brokerProfileId || null,
        status: "ROUTED",
        requestPayload: canonical(
          data?.requestPayload || {
            orderRef: order.orderRef,
            side: order.side,
            quantity: order.quantity,
          }
        ),
        externalOrderRef: data?.externalOrderRef,
        idempotencyKey,
        routedAt: new Date(),
      },
    });
    const changed = await db.investmentOrder.updateMany({
      where: { id, version: order.version, status: "APPROVED" },
      data: { status: "SENT_TO_BROKER", version: { increment: 1 } },
    });
    if (changed.count !== 1) {
      fail("VERSION_CONFLICT", "Order changed while routing to broker", 409);
    }
    await appendEvent(db, order, "SENT_TO_BROKER", userId, `${idempotencyKey}:status`, "BROKER_ROUTE");
    return route;
  }

  static async executions(id: string, userId: string, user: any) {
    await orderForAccess(id, userId, user);
    return db.investmentOrderExecution.findMany({ where: { orderId: id }, orderBy: { executedAt: "asc" } });
  }

  static async recordExecution(
    id: string,
    data: any,
    expectedVersion: string,
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    const replay = await db.investmentOrderExecution.findUnique({ where: { idempotencyKey } });
    if (replay) return replay;
    const order = await orderForAccess(id, userId, user);
    assertVersion(order, expectedVersion);
    if (!["SENT_TO_BROKER", "BROKER_CONFIRMATION_RECORDED", "PARTIALLY_EXECUTED"].includes(order.status)) {
      fail("ORDER_NOT_EXECUTABLE", "Order must be routed before fills can be recorded", 409);
    }
    const quantity = positiveDecimal(data.quantity, "quantity");
    const price = positiveDecimal(data.price, "price");
    const aggregate = await db.investmentOrderExecution.aggregate({
      where: { orderId: id },
      _sum: { quantity: true },
    });
    const cumulative = assertCumulativeFill(order.quantity, aggregate._sum.quantity || 0, quantity);
    const nextStatus = cumulative.eq(order.quantity) ? "EXECUTED" : "PARTIALLY_EXECUTED";
    return db.$transaction(async (tx: any) => {
      const execution = await tx.investmentOrderExecution.create({
        data: {
          orderId: id,
          routeId: data.routeId || null,
          executionRef: required(data.executionRef, "executionRef"),
          quantity,
          price,
          grossAmount: quantity.mul(price),
          feeAmount: new Decimal(String(data.feeAmount || 0)),
          taxAmount: new Decimal(String(data.taxAmount || 0)),
          currencyCode: required(data.currencyCode || order.tradeCurrency, "currencyCode").toUpperCase(),
          executedAt: new Date(required(data.executedAt, "executedAt")),
          settlementDate: data.settlementDate ? new Date(data.settlementDate) : null,
          idempotencyKey,
          rawPayload: data.rawPayload || null,
        },
      });
      const changed = await tx.investmentOrder.updateMany({
        where: { id, version: order.version },
        data: { status: nextStatus, version: { increment: 1 } },
      });
      if (changed.count !== 1) fail("VERSION_CONFLICT", "Order changed while recording fill", 409);
      await appendEvent(tx, order, nextStatus, userId, `${idempotencyKey}:status`, "FILL_RECORDED");
      return { execution, cumulativeQuantity: cumulative, remainingQuantity: new Decimal(order.quantity).minus(cumulative) };
    });
  }

  static async confirmation(
    id: string,
    data: any,
    expectedVersion: string,
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    const order = await orderForAccess(id, userId, user);
    assertVersion(order, expectedVersion);
    let route = data.routeId
      ? await db.investmentOrderRoute.findFirst({ where: { id: data.routeId, orderId: id } })
      : await db.investmentOrderRoute.findFirst({ where: { orderId: id }, orderBy: { routeSequence: "desc" } });

    // Heal demo/legacy orders that were advanced past SENT_TO_BROKER without a route row.
    if (!route && order.brokerProfileId) {
      route = await db.investmentOrderRoute.create({
        data: {
          orderId: id,
          routeSequence: 1,
          venueCode: order.tradeCurrency || "MANUAL",
          brokerProfileId: order.brokerProfileId,
          status: "ROUTED",
          externalOrderRef: data.externalOrderRef || `AUTO-${order.orderRef}`,
          requestPayload: canonical({
            orderRef: order.orderRef,
            side: order.side,
            quantity: order.quantity,
            healed: true,
          }),
          idempotencyKey: `${idempotencyKey}:auto-route`,
          routedAt: new Date(),
        },
      });
    }
    if (!route) fail("ORDER_ROUTE_NOT_FOUND", "Order has no broker route", 404);
    return db.investmentOrderRoute.update({
      where: { id: route.id },
      data: {
        status: "ACKNOWLEDGED",
        externalOrderRef: required(data.externalOrderRef || route.externalOrderRef, "externalOrderRef"),
        responsePayload: canonical({ confirmation: data.confirmation, idempotencyKey }),
        acknowledgedAt: new Date(),
      },
    });
  }

  static async settlement(
    id: string,
    data: any,
    expectedVersion: string,
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    const order = await orderForAccess(id, userId, user);
    assertVersion(order, expectedVersion);
    if (!["EXECUTED", "PENDING_SETTLEMENT"].includes(order.status)) {
      fail("ORDER_NOT_SETTLEABLE", "Order must be fully executed before settlement confirmation", 409);
    }
    const toStatus = data.status === "FAILED" ? "FAILED" : "SETTLED";
    const allowDeferredAccounting =
      data.allowDeferredAccounting === true ||
      String(data.allowDeferredAccounting || "").toLowerCase() === "true";

    if (toStatus === "SETTLED") {
      try {
        if (order.tradeId) {
          const leSettlement = await db.listedEquityTradeSettlement.findUnique({
            where: { tradeId: order.tradeId },
          });
          if (!leSettlement?.journalEntryId && !allowDeferredAccounting) {
            fail(
              "ORDER_SETTLEMENT_ACCOUNTING_REQUIRED",
              "Linked trade settlement accounting is not posted; settle the LE trade first or pass allowDeferredAccounting=true",
              422,
              { tradeId: order.tradeId }
            );
          }
          if (leSettlement?.journalEntryId) {
            await InvestmentAccountingFacadeService.recordFromTradeSettlement(
              order.fundId,
              order.tradeId,
              order.orderRef,
              leSettlement.journalEntryId,
              leSettlement.realizedPnl != null ? Number(leSettlement.realizedPnl) : null
            );
          }
        }

        await InvestmentAccountingFacadeService.recordFromOrderSettlement({
          fundId: order.fundId,
          orderId: order.id,
          orderRef: order.orderRef,
          amount: order.netAmount ?? order.grossAmount,
          currencyCode: order.settlementCurrency || order.tradeCurrency,
          idempotencyKey: `order-settle:${idempotencyKey}`,
          userId,
        });
      } catch (err: any) {
        if (err instanceof InvestmentOpsError && err.code === "ORDER_SETTLEMENT_ACCOUNTING_REQUIRED") {
          if (order.status === "EXECUTED") {
            await this.transition(
              id,
              "PENDING_SETTLEMENT",
              expectedVersion,
              `${idempotencyKey}:pending`,
              userId,
              user,
              "SETTLEMENT_ACCOUNTING_REQUIRED",
              data.reason
            );
          }
          throw err;
        }
        if (!allowDeferredAccounting) {
          if (order.status === "EXECUTED") {
            await this.transition(
              id,
              "PENDING_SETTLEMENT",
              expectedVersion,
              `${idempotencyKey}:pending`,
              userId,
              user,
              "SETTLEMENT_ACCOUNTING_REQUIRED",
              data.reason
            );
          }
          fail(
            "ORDER_SETTLEMENT_ACCOUNTING_REQUIRED",
            err?.message || "Settlement accounting could not be posted",
            422,
            { error: err?.message || String(err), code: err?.code, tradeId: order.tradeId || null }
          );
        }
        await InvestmentOpsAuditService.log(
          "ORDER_SETTLEMENT_ACCOUNTING_DEFERRED",
          "InvestmentOrder",
          order.id,
          { error: err?.message || String(err), code: err?.code, allowDeferredAccounting: true },
          userId
        );
      }
    }

    return this.transition(
      id,
      toStatus,
      expectedVersion,
      idempotencyKey,
      userId,
      user,
      "SETTLEMENT_CONFIRMATION",
      data.reason
    );
  }
}
