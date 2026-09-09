// @ts-nocheck
import crypto from "crypto";
import { prisma } from "../../utils/database";
import {
  LpPortalError,
  assertFundAccess,
  moneyStr,
  parseListQuery,
} from "../../middleware/lpPortalFoundation";
import { LpPortalAccessService, type LpPortalContext } from "./LpPortalAccessService";

const db = () => prisma as any;

const DEFAULT_MIN_BALANCE_AMOUNT = 1_000_000;
const DEFAULT_MIN_BALANCE_UNITS = 100_000;
const DEFAULT_NOTICE_DAYS = 30;
const ESTIMATE_TTL_MS = 15 * 60 * 1000;

function subscriptionPayloadHash(body: { fundId: string; shareClass?: string; amount: string | number; currency?: string }) {
  const amount = moneyStr(Number(body.amount));
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({
      fundId: body.fundId,
      shareClass: body.shareClass || null,
      amount,
      currency: (body.currency || "USD").toUpperCase(),
    }))
    .digest("hex");
}

function redemptionPayloadHash(body: Record<string, unknown>) {
  return crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
}

function dateOnly(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function trimNum(n: number, dp: number): string {
  const s = n.toFixed(dp);
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "") || "0";
}

function unitsStr(value: unknown): string {
  if (value == null) return "0";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return trimNum(n, 6);
}

function rateStr(value: unknown, dp = 8): string {
  if (value == null) return "0";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return trimNum(n, dp);
}

export class LpPortalDealingService {
  static async overview(ctx: LpPortalContext, opts: { fundId: string; shareClass?: string }) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    assertFundAccess(ctx, opts.fundId);

    const [holding, rules, compliance, pending] = await Promise.all([
      this.getHolding(ctx, opts.fundId, opts.shareClass),
      this.loadRules(opts.fundId),
      this.loadCompliance(ctx.clientId),
      this.pendingTotals(ctx, opts.fundId),
    ]);

    const accountValue = Number(holding?.accountValue ?? 0);
    const unitsHeld = Number(holding?.units ?? 0);
    const navPerUnit = Number(holding?.navPerUnit ?? 0);
    const minBal = Number(rules.minBalanceAmount);
    const availableToRedeemValue = Math.max(0, accountValue - minBal);
    const availableUnits =
      navPerUnit > 0 ? availableToRedeemValue / navPerUnit : Math.max(0, unitsHeld - Number(rules.minBalanceUnits));

    const blockers: string[] = [];
    if (compliance.onHold) blockers.push("COMPLIANCE_HOLD");
    if (rules.dealingSuspended) blockers.push("DEALING_SUSPENDED");
    if (!compliance.accredited) blockers.push("NOT_ACCREDITED");

    return {
      fundId: opts.fundId,
      shareClass: holding?.shareClass ?? opts.shareClass ?? null,
      asOfDate: dateOnly(holding?.asOfDate) || dateOnly(new Date()),
      valuationStatus: holding?.valuationStatus || "FINAL",
      navPerUnit: rateStr(navPerUnit),
      accountValue: moneyStr(accountValue),
      unitsHeld: unitsStr(unitsHeld),
      availableToRedeemValue: moneyStr(availableToRedeemValue),
      availableUnits: unitsStr(availableUnits),
      pendingSubscriptions: moneyStr(pending.subscriptions),
      pendingRedemptions: moneyStr(pending.redemptions),
      rules: this.formatRules(rules),
      compliance: {
        accreditedInvestor: Boolean(compliance.accredited),
        kycStatus: compliance.kycStatus || "CLEAR",
        noUnsettledCapitalCalls: true,
        noLegalHolds: !compliance.onHold,
        blockers,
        termsUrl: null,
        holdReason: compliance.holdReason || null,
      },
    };
  }

  static async getRules(ctx: LpPortalContext, opts: { fundId: string }) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    assertFundAccess(ctx, opts.fundId);
    const rules = await this.loadRules(opts.fundId);
    const compliance = await this.loadCompliance(ctx.clientId);
    return {
      fundId: opts.fundId,
      ...this.formatRules(rules),
      compliance: {
        accreditedInvestor: Boolean(compliance.accredited),
        kycStatus: compliance.kycStatus || "CLEAR",
        noLegalHolds: !compliance.onHold,
        blockers: [
          ...(compliance.onHold ? ["COMPLIANCE_HOLD"] : []),
          ...(rules.dealingSuspended ? ["DEALING_SUSPENDED"] : []),
        ],
      },
    };
  }

  static async listRequests(ctx: LpPortalContext, query: Record<string, unknown> = {}) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    const q = parseListQuery(query);
    if (q.fundId) assertFundAccess(ctx, q.fundId);

    const type = query.type ? String(query.type).toUpperCase() : undefined;
    const where: any = {
      clientId: ctx.clientId,
      ...(q.fundId ? { fundId: q.fundId } : {}),
      ...(q.status ? { status: q.status } : {}),
      ...(type ? { requestType: type } : {}),
    };

    const [total, rows] = await Promise.all([
      db().lpDealingRequest.count({ where }),
      db().lpDealingRequest.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: q.skip,
        take: q.take,
        include: { fund: { select: { name: true } } },
      }),
    ]);

    const items = rows
      .filter((r: any) => LpPortalAccessService.fundAllowed(ctx, r.fundId))
      .map((r: any) => this.mapRequest(r));

    return { items, page: q.page, pageSize: q.pageSize, total };
  }

  static async estimateSubscription(
    ctx: LpPortalContext,
    body: { fundId: string; shareClass?: string; amount: string | number; currency?: string }
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    assertFundAccess(ctx, body.fundId);
    await this.assertDealingAllowed(ctx, body.fundId);

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new LpPortalError("LP_VALIDATION", "amount must be a positive number", 422, {
        amount: "Required positive amount",
      });
    }

    const holding = await this.getHolding(ctx, body.fundId, body.shareClass);
    const rules = await this.loadRules(body.fundId);
    const navPerUnit = Number(holding?.navPerUnit ?? 0) || 1;
    const feeBps = Number(rules.subscriptionFeeBps ?? 0);
    const managementFee = (amount * feeBps) / 10_000;
    const otherFees = 0;
    const net = amount;
    const estimatedUnits = net / navPerUnit;
    const payloadHash = subscriptionPayloadHash(body);
    const estimateSnapshotId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + ESTIMATE_TTL_MS);

    const estimate = {
      estimateSnapshotId,
      navPerUnit: rateStr(navPerUnit),
      estimatedUnits: unitsStr(estimatedUnits),
      managementFee: moneyStr(managementFee),
      otherFees: moneyStr(otherFees),
      estimatedTotalInvestment: moneyStr(amount + managementFee + otherFees),
      isEstimate: true,
      disclaimer:
        "Final allocation will be based on the NAV on the applicable dealing date and may differ.",
    };

    await db().lpDealingEstimateSnapshot.create({
      data: {
        id: estimateSnapshotId,
        clientId: ctx.clientId,
        fundId: body.fundId,
        estimateType: "SUBSCRIPTION",
        estimateJson: estimate,
        payloadHash,
        expiresAt,
      },
    });

    return estimate;
  }

  static async createSubscription(
    ctx: LpPortalContext,
    body: {
      fundId: string;
      shareClass?: string;
      amount: string | number;
      currency?: string;
      expectedFundingDate?: string;
      sourceBankAccountId?: string;
      investorNotes?: string;
      estimateSnapshotId?: string;
    },
    userId?: string
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    assertFundAccess(ctx, body.fundId);
    await this.assertDealingAllowed(ctx, body.fundId);

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new LpPortalError("LP_VALIDATION", "amount must be a positive number", 422, {
        amount: "Required positive amount",
      });
    }

    await this.validateEstimateSnapshot(ctx, body.estimateSnapshotId, "SUBSCRIPTION", body);

    const snap = await db().lpDealingEstimateSnapshot.findUnique({
      where: { id: body.estimateSnapshotId },
    });
    const estimate = snap?.estimateJson || {};
    const payloadHash = subscriptionPayloadHash(body);

    const row = await db().lpDealingRequest.create({
      data: {
        clientId: ctx.clientId,
        fundId: body.fundId,
        shareClass: body.shareClass || null,
        requestType: "SUBSCRIPTION",
        status: "SUBMITTED",
        amount,
        units: Number(estimate.estimatedUnits),
        currencyCode: (body.currency || "USD").toUpperCase(),
        requestedDealingDate: body.expectedFundingDate
          ? new Date(body.expectedFundingDate)
          : null,
        estimateSnapshotId: body.estimateSnapshotId || estimate.estimateSnapshotId,
        estimateJson: estimate,
        payloadHash,
        bankAccountId: body.sourceBankAccountId || null,
        submittedById: userId || ctx.userId || null,
        notes: body.investorNotes || null,
      },
    });

    return this.mapRequest(row);
  }

  static async estimateRedemption(
    ctx: LpPortalContext,
    body: {
      fundId: string;
      shareClass?: string;
      mode?: string;
      amount?: string | number;
      units?: string | number;
      full?: boolean;
      earliestDealingDate?: string;
    }
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    assertFundAccess(ctx, body.fundId);
    await this.assertDealingAllowed(ctx, body.fundId);

    const holding = await this.getHolding(ctx, body.fundId, body.shareClass);
    const rules = await this.loadRules(body.fundId);
    const navPerUnit = Number(holding?.navPerUnit ?? 0) || 1;
    const accountValue = Number(holding?.accountValue ?? 0);
    const unitsHeld = Number(holding?.units ?? 0);
    const isFull = Boolean(body.full) || String(body.mode || "").toUpperCase() === "FULL";

    let redeemUnits = 0;
    let redeemValue = 0;

    if (isFull) {
      redeemUnits = unitsHeld;
      redeemValue = accountValue;
    } else if (String(body.mode || "").toLowerCase() === "units" || body.units != null) {
      redeemUnits = Number(body.units);
      redeemValue = redeemUnits * navPerUnit;
    } else {
      redeemValue = Number(body.amount);
      redeemUnits = redeemValue / navPerUnit;
    }

    if (!Number.isFinite(redeemUnits) || redeemUnits <= 0) {
      throw new LpPortalError("LP_VALIDATION", "Invalid redemption amount/units", 422);
    }
    if (redeemUnits > unitsHeld + 1e-9) {
      throw new LpPortalError("LP_INSUFFICIENT_UNITS", "Redemption exceeds holdings", 422, {
        units: "Insufficient units",
      }, { unitsHeld: unitsStr(unitsHeld), requested: unitsStr(redeemUnits) });
    }

    const remainingValue = accountValue - redeemValue;
    const remainingUnits = unitsHeld - redeemUnits;
    const minBal = Number(rules.minBalanceAmount);
    const minUnits = Number(rules.minBalanceUnits);
    const aboveMinBalance =
      isFull || (remainingValue >= minBal - 0.01 && remainingUnits >= minUnits - 1e-6);

    if (!aboveMinBalance) {
      throw new LpPortalError(
        "LP_MIN_BALANCE_BREACH",
        "Redemption would breach the minimum balance.",
        422,
        { amount: `Remaining account value would be below $${moneyStr(minBal)}` },
        { minBalanceAmount: moneyStr(minBal), remainingValue: moneyStr(remainingValue) }
      );
    }

    const noticeDays = Number(rules.noticePeriodDays ?? DEFAULT_NOTICE_DAYS);
    const earliest = body.earliestDealingDate
      ? new Date(body.earliestDealingDate)
      : rules.nextDealingDate
        ? new Date(rules.nextDealingDate)
        : addDays(new Date(), noticeDays);

    const minEligible = addDays(new Date(), noticeDays);
    if (dateOnly(earliest)! < dateOnly(minEligible)!) {
      throw new LpPortalError(
        "LP_NOTICE_PERIOD",
        `Earliest dealing date must respect ${noticeDays}-day notice period`,
        422,
        { earliestDealingDate: `Must be on or after ${dateOnly(minEligible)}` },
        { noticeDays, earliestEligible: dateOnly(minEligible) }
      );
    }

    const feeBps = Number(rules.redemptionFeeBps ?? 0);
    const fee = (redeemValue * feeBps) / 10_000;
    const settlement = redeemValue - fee;
    const settlementDate = addDays(earliest, 3);
    const estimateSnapshotId = crypto.randomUUID();
    const payloadHash = redemptionPayloadHash(body);
    const expiresAt = new Date(Date.now() + ESTIMATE_TTL_MS);

    const estimate = {
      estimateSnapshotId,
      estimatedUnitsToCancel: unitsStr(redeemUnits),
      estimatedSettlementAmount: moneyStr(settlement),
      earliestDealingDate: dateOnly(earliest),
      estimatedSettlementDate: dateOnly(settlementDate),
      noticeDays,
      aboveMinBalance: true,
      isEstimate: true,
      redemptionFee: moneyStr(fee),
      disclaimer:
        "Indicative amounts. Final settlement will use the approved dealing-date NAV.",
    };

    await db().lpDealingEstimateSnapshot.create({
      data: {
        id: estimateSnapshotId,
        clientId: ctx.clientId,
        fundId: body.fundId,
        estimateType: "REDEMPTION",
        estimateJson: estimate,
        payloadHash,
        expiresAt,
      },
    });

    return estimate;
  }

  static async createRedemption(
    ctx: LpPortalContext,
    body: {
      fundId: string;
      shareClass?: string;
      mode?: string;
      amount?: string | number;
      units?: string | number;
      full?: boolean;
      earliestDealingDate?: string;
      estimateSnapshotId?: string;
      bankAccountId?: string;
      notes?: string;
    },
    userId?: string
  ) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    assertFundAccess(ctx, body.fundId);
    await this.assertDealingAllowed(ctx, body.fundId);

    await this.validateEstimateSnapshot(ctx, body.estimateSnapshotId, "REDEMPTION", body);

    const snap = await db().lpDealingEstimateSnapshot.findUnique({
      where: { id: body.estimateSnapshotId },
    });
    const estimate = snap?.estimateJson || {};
    const isFull = Boolean(body.full) || String(body.mode || "").toUpperCase() === "FULL";
    const payloadHash = redemptionPayloadHash(body);

    const row = await db().lpDealingRequest.create({
      data: {
        clientId: ctx.clientId,
        fundId: body.fundId,
        shareClass: body.shareClass || null,
        requestType: "REDEMPTION",
        status: "SUBMITTED",
        amount: body.amount != null ? Number(body.amount) : Number(estimate.estimatedSettlementAmount),
        units: Number(estimate.estimatedUnitsToCancel),
        redemptionMode: isFull ? "FULL" : "PARTIAL",
        currencyCode: "USD",
        requestedDealingDate: estimate.earliestDealingDate
          ? new Date(estimate.earliestDealingDate)
          : null,
        estimateSnapshotId: body.estimateSnapshotId || estimate.estimateSnapshotId,
        estimateJson: estimate,
        payloadHash,
        bankAccountId: body.bankAccountId || null,
        submittedById: userId || ctx.userId || null,
        notes: body.notes || null,
      },
    });

    return this.mapRequest(row);
  }

  static async listBankAccounts(ctx: LpPortalContext, opts: { fundId?: string } = {}) {
    await LpPortalAccessService.assertClientActive(ctx.clientId);
    if (opts.fundId) assertFundAccess(ctx, opts.fundId);

    const rows = await db().lpBankAccount.findMany({
      where: {
        clientId: ctx.clientId,
        status: "ACTIVE",
        ...(opts.fundId ? { OR: [{ fundId: opts.fundId }, { fundId: null }] } : {}),
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    return rows.map((r: any) => ({
      id: r.id,
      label: r.label,
      bankName: r.bankName,
      accountName: r.accountName,
      accountNumberMasked: r.accountNumberMasked,
      currencyCode: r.currencyCode,
      isDefault: r.isDefault,
      fundId: r.fundId,
      status: r.status,
    }));
  }

  static async exportRequests(
    ctx: LpPortalContext,
    query: Record<string, unknown> = {}
  ) {
    const { items } = await this.listRequests(ctx, { ...query, page: 1, pageSize: 500 });
    const format = String(query.format || "csv").toLowerCase();
    if (format === "csv") {
      const header = "id,fundName,shareClass,requestType,status,amount,units,createdAt\n";
      const rows = items
        .map(
          (r: any) =>
            `${r.id},${r.fundName || ""},${r.shareClass || ""},${r.requestType},${r.status},${r.amount || ""},${r.units || ""},${r.createdAt || ""}`
        )
        .join("\n");
      return { contentType: "text/csv", filename: "dealing-requests.csv", body: header + rows };
    }
    return { contentType: "application/json", filename: "dealing-requests.json", body: JSON.stringify({ items }) };
  }

  // —— internals ——

  private static async validateEstimateSnapshot(
    ctx: LpPortalContext,
    snapshotId: string | undefined,
    estimateType: string,
    body: Record<string, unknown>
  ) {
    if (!snapshotId) {
      throw new LpPortalError("LP_VALIDATION", "estimateSnapshotId is required", 422, {
        estimateSnapshotId: "Required — call estimate endpoint first",
      });
    }
    const snap = await db().lpDealingEstimateSnapshot.findUnique({ where: { id: snapshotId } });
    if (!snap || snap.clientId !== ctx.clientId) {
      throw new LpPortalError("LP_VALIDATION", "Invalid estimate snapshot", 409, {
        estimateSnapshotId: "Snapshot not found",
      });
    }
    if (snap.estimateType !== estimateType) {
      throw new LpPortalError("LP_VALIDATION", "Estimate type mismatch", 409, {
        estimateSnapshotId: "Snapshot type does not match request",
      });
    }
    if (new Date(snap.expiresAt) < new Date()) {
      throw new LpPortalError("LP_ESTIMATE_EXPIRED", "Estimate has expired — re-run estimate", 409, {
        amount: "Estimate expired — refresh estimate",
        estimateSnapshotId: "Expired",
      });
    }
    if (body.fundId && snap.fundId !== body.fundId) {
      throw new LpPortalError("LP_VALIDATION", "Fund mismatch vs estimate", 409, {
        fundId: "Does not match estimate snapshot",
      });
    }
    const bodyHash =
      estimateType === "SUBSCRIPTION"
        ? subscriptionPayloadHash(body as any)
        : redemptionPayloadHash(body);
    if (snap.payloadHash && bodyHash !== snap.payloadHash) {
      throw new LpPortalError("LP_VALIDATION", "Request body does not match estimate snapshot", 409, {
        amount: "Does not match estimate — re-run estimate",
        estimateSnapshotId: "Payload mismatch",
      });
    }
  }

  private static async assertDealingAllowed(ctx: LpPortalContext, fundId: string) {
    const compliance = await this.loadCompliance(ctx.clientId);
    if (compliance.onHold) {
      throw new LpPortalError(
        "LP_COMPLIANCE_HOLD",
        compliance.holdReason || "Dealing blocked by compliance hold",
        403
      );
    }
    const rules = await this.loadRules(fundId);
    if (rules.dealingSuspended) {
      throw new LpPortalError("LP_DEALING_SUSPENDED", "Dealing is suspended for this fund", 403);
    }
    const client = await prisma.client.findUnique({ where: { id: ctx.clientId } });
    if (!client || client.status !== "ACTIVE") {
      throw new LpPortalError("LP_ACCOUNT_INACTIVE", "Investor account is inactive", 409);
    }
  }

  private static async getHolding(ctx: LpPortalContext, fundId: string, shareClass?: string) {
    const where: any = { clientId: ctx.clientId, fundId, isActive: true };
    if (shareClass) where.shareClass = shareClass;
    return db().lpHoldingPosition.findFirst({
      where,
      orderBy: { asOfDate: "desc" },
    });
  }

  private static async loadRules(fundId: string) {
    // `fundId` is optional upstream — an LP with no fund selected (or no holdings yet) reaches
    // here with undefined, and Prisma rejects a findUnique whose unique key is undefined rather
    // than returning null, which surfaced as a 500 on GET /lp-portal/dealing/{overview,rules}.
    // Every field below already falls back to a default when there is no row, so skipping the
    // lookup yields the same shape the "no rules configured" case has always produced.
    const row = fundId ? await db().lpDealingRules.findUnique({ where: { fundId } }) : null;
    return {
      fundId,
      minBalanceAmount: Number(row?.minBalanceAmount ?? DEFAULT_MIN_BALANCE_AMOUNT),
      minBalanceUnits: Number(row?.minBalanceUnits ?? DEFAULT_MIN_BALANCE_UNITS),
      noticePeriodDays: Number(row?.noticePeriodDays ?? DEFAULT_NOTICE_DAYS),
      dealingSuspended: Boolean(row?.dealingSuspended),
      subscriptionFeeBps: Number(row?.subscriptionFeeBps ?? 0),
      redemptionFeeBps: Number(row?.redemptionFeeBps ?? 0),
      nextDealingDate: row?.nextDealingDate ?? null,
      rulesJson: row?.rulesJson ?? null,
    };
  }

  private static formatRules(rules: any) {
    const next =
      dateOnly(rules.nextDealingDate) ||
      dateOnly(addDays(new Date(), Number(rules.noticePeriodDays ?? DEFAULT_NOTICE_DAYS)));
    return {
      minBalanceAmount: moneyStr(rules.minBalanceAmount),
      minBalanceUnits: unitsStr(rules.minBalanceUnits),
      noticeDays: Number(rules.noticePeriodDays ?? DEFAULT_NOTICE_DAYS),
      dealingFrequency: rules.rulesJson?.dealingFrequency || "MONTHLY_LAST_BUSINESS_DAY",
      nextEligibleDealingDate: next,
      settlementLagDays: Number(rules.rulesJson?.settlementLagDays ?? 3),
      subscription: {
        mgmtFeeRate: rateStr(Number(rules.subscriptionFeeBps || 0) / 10_000, 6),
        otherFeeFlat: moneyStr(0),
        maxFileMb: 25,
      },
      redemption: {
        feeRate: rateStr(Number(rules.redemptionFeeBps || 0) / 10_000, 8),
        modes: ["AMOUNT", "UNITS", "FULL"],
      },
    };
  }

  private static async loadCompliance(clientId: string) {
    const row = await db().lpComplianceStatus.findUnique({ where: { clientId } });
    return {
      kycStatus: row?.kycStatus || "CLEAR",
      accredited: row?.accredited !== false,
      onHold: Boolean(row?.onHold),
      holdReason: row?.holdReason || null,
    };
  }

  private static async pendingTotals(ctx: LpPortalContext, fundId: string) {
    const pending = await db().lpDealingRequest.findMany({
      where: {
        clientId: ctx.clientId,
        fundId,
        status: { in: ["SUBMITTED", "COMPLIANCE_REVIEW", "AWAITING_FUNDS", "AWAITING_NAV", "UNDER_REVIEW"] },
      },
      select: { requestType: true, amount: true },
    });
    let subscriptions = 0;
    let redemptions = 0;
    for (const r of pending) {
      const amt = Number(r.amount ?? 0);
      if (r.requestType === "SUBSCRIPTION") subscriptions += amt;
      else redemptions += amt;
    }
    return { subscriptions, redemptions };
  }

  private static mapRequest(r: any) {
    const shareClass = r.shareClass ?? r.estimateJson?.shareClass ?? null;
    return {
      id: r.id,
      fundId: r.fundId,
      fundName: r.fund?.name ?? null,
      shareClass,
      requestType: r.requestType,
      status: r.status,
      amount: r.amount != null ? moneyStr(r.amount) : null,
      units: r.units != null ? unitsStr(r.units) : null,
      redemptionMode: r.redemptionMode ?? null,
      currencyCode: r.currencyCode || "USD",
      requestedDealingDate: dateOnly(r.requestedDealingDate),
      estimateSnapshotId: r.estimateSnapshotId,
      isEstimate: true,
      createdAt: r.createdAt?.toISOString?.() ?? null,
      notes: r.notes ?? null,
    };
  }
}
