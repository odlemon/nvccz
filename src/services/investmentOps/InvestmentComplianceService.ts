// @ts-nocheck
import { prisma } from "../../utils/database";
import { ListedEquityPortfolioService } from "../listedEquity/ListedEquityPortfolioService";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { InvestmentOpsError } from "../../middleware/investmentOpsFoundation";
import { paginatedResult, parsePagination } from "./investmentOpsSupport";

const db = prisma as any;

function expected(current: number, version: string) {
  if (String(current) !== String(version)) {
    throw new InvestmentOpsError("VERSION_CONFLICT", "Resource has changed", 409, {
      expectedVersion: version,
      currentVersion: String(current),
    });
  }
}

export class InvestmentComplianceService {
  static async listRules(fundId?: string, userId?: string, user?: any) {
    if (fundId && userId) {
      await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    }
    return prisma.investmentComplianceRule.findMany({
      where: {
        isActive: true,
        ...(fundId ? { OR: [{ fundId }, { fundId: null }] } : {}),
      },
      orderBy: { ruleCode: "asc" },
    });
  }

  static async createRule(data: Record<string, unknown>, userId: string, user: any) {
    if (data.fundId) {
      await ListedEquityAccessService.assertFundAccess(userId, data.fundId as string, user);
    }
    return prisma.investmentComplianceRule.create({
      data: {
        fundId: data.fundId as string | undefined,
        ruleCode: data.ruleCode as string,
        ruleName: data.ruleName as string,
        ruleType: data.ruleType as string,
        thresholdValue: data.thresholdValue != null ? Number(data.thresholdValue) : undefined,
        thresholdUnit: data.thresholdUnit as string | undefined,
        instrumentTypeCode: data.instrumentTypeCode as string | undefined,
        sectorCode: data.sectorCode as string | undefined,
        countryCode: data.countryCode as string | undefined,
        issuerName: data.issuerName as string | undefined,
        esgFlag: data.esgFlag as string | undefined,
      },
    });
  }

  static async getRule(id: string, userId: string, user: any) {
    const rule = await db.investmentComplianceRule.findUnique({ where: { id } });
    if (!rule) throw new InvestmentOpsError("COMPLIANCE_RULE_NOT_FOUND", "Compliance rule not found", 404);
    if (rule.fundId) await ListedEquityAccessService.assertFundAccess(userId, rule.fundId, user);
    return rule;
  }

  static async updateRule(id: string, data: any, version: string, userId: string, user: any) {
    const rule = await this.getRule(id, userId, user);
    expected(rule.version, version);
    return db.investmentComplianceRule.update({
      where: { id },
      data: {
        ...(data.ruleName !== undefined ? { ruleName: data.ruleName } : {}),
        ...(data.ruleType !== undefined ? { ruleType: data.ruleType } : {}),
        ...(data.thresholdValue !== undefined ? { thresholdValue: data.thresholdValue } : {}),
        ...(data.thresholdUnit !== undefined ? { thresholdUnit: data.thresholdUnit } : {}),
        ...(data.instrumentTypeCode !== undefined ? { instrumentTypeCode: data.instrumentTypeCode } : {}),
        ...(data.sectorCode !== undefined ? { sectorCode: data.sectorCode } : {}),
        ...(data.countryCode !== undefined ? { countryCode: data.countryCode } : {}),
        ...(data.issuerName !== undefined ? { issuerName: data.issuerName } : {}),
        ...(data.esgFlag !== undefined ? { esgFlag: data.esgFlag } : {}),
        ...(data.isActive !== undefined ? { isActive: Boolean(data.isActive) } : {}),
        version: { increment: 1 },
      },
    });
  }

  static async previewCheck(ctx: {
    fundId: string;
    side: string;
    orderValue: number;
    instrument: any;
  }) {
    const rules = await this.listRules(ctx.fundId);
    const snap = await prisma.listedEquityValuationSnapshot.findFirst({
      where: { fundId: ctx.fundId },
      orderBy: { asOf: "desc" },
    });
    const nav = snap ? Number(snap.navBaseCurrency) : 0;
    const weightPct = nav > 0 ? (ctx.orderValue / nav) * 100 : 100;
    return this.evaluateRules(rules, {
      order: { side: ctx.side, instrument: ctx.instrument },
      weightPct,
      nav,
    });
  }

  static evaluateRules(
    rules: any[],
    ctx: { order: any; weightPct: number; nav: number }
  ): { outcome: string; message: string; ruleId?: string; checks: any[] } {
    let worst: { outcome: string; message: string; ruleId?: string } = {
      outcome: "PASSED",
      message: "All checks passed",
    };
    const checks: any[] = [];

    for (const rule of rules) {
      let outcome = "PASSED";
      let message = "OK";

      if (rule.ruleType === "MAX_SINGLE_SECURITY_WEIGHT" && rule.thresholdValue != null) {
        if (ctx.weightPct > Number(rule.thresholdValue)) {
          outcome = "FAILED";
          message = `Order weight ${ctx.weightPct.toFixed(2)}% exceeds limit ${rule.thresholdValue}%`;
        }
      }
      if (
        rule.ruleType === "RESTRICTED_INSTRUMENT" &&
        ctx.order.instrument?.complianceRestriction === "RESTRICTED"
      ) {
        outcome = "FAILED";
        message = "Instrument is restricted";
      }
      if (rule.ruleType === "MIN_CASH_BALANCE" && ctx.order.side === "BUY" && rule.thresholdValue != null) {
        if (ctx.weightPct > 100 - Number(rule.thresholdValue)) {
          outcome = outcome === "FAILED" ? "FAILED" : "WARNING";
          message = `Buy may breach minimum cash buffer of ${rule.thresholdValue}%`;
        }
      }
      if (rule.ruleType === "MAX_SECTOR_WEIGHT" && rule.sectorCode && ctx.order.instrument) {
        if (
          ctx.order.instrument.sector === rule.sectorCode &&
          rule.thresholdValue != null &&
          ctx.weightPct > Number(rule.thresholdValue)
        ) {
          outcome = "FAILED";
          message = `Sector ${rule.sectorCode} weight would exceed ${rule.thresholdValue}%`;
        }
      }
      if (rule.ruleType === "RESTRICTED_COUNTRY" && rule.countryCode && ctx.order.instrument) {
        if (ctx.order.instrument.countryCode === rule.countryCode) {
          outcome = "FAILED";
          message = `Country ${rule.countryCode} is restricted`;
        }
      }
      if (rule.ruleType === "RESTRICTED_ISSUER" && rule.issuerName && ctx.order.instrument) {
        if (
          ctx.order.instrument.issuerName &&
          ctx.order.instrument.issuerName.toLowerCase() === rule.issuerName.toLowerCase()
        ) {
          outcome = "FAILED";
          message = `Issuer ${rule.issuerName} is restricted`;
        }
      }
      if (rule.ruleType === "RESTRICTED_BROKER" && rule.thresholdValue != null) {
        outcome = "WARNING";
        message = "Broker restriction rule configured — verify broker assignment";
      }
      if (rule.ruleType === "ESG_EXCLUSION" && rule.esgFlag && ctx.order.instrument) {
        if (ctx.order.instrument.complianceRestriction === "ESG_EXCLUDED") {
          outcome = "FAILED";
          message = `ESG exclusion: ${rule.esgFlag}`;
        }
      }
      if (rule.ruleType === "MAX_LEVERAGE" && rule.thresholdValue != null && ctx.nav > 0) {
        const leverage = ctx.weightPct;
        if (leverage > Number(rule.thresholdValue)) {
          outcome = "FAILED";
          message = `Leverage proxy ${leverage.toFixed(2)}% exceeds ${rule.thresholdValue}%`;
        }
      }

      checks.push({ ruleId: rule.id, ruleType: rule.ruleType, outcome, message });
      if (outcome === "FAILED") worst = { outcome, message, ruleId: rule.id };
      else if (outcome === "WARNING" && worst.outcome === "PASSED") {
        worst = { outcome, message, ruleId: rule.id };
      }
    }

    return { ...worst, checks };
  }

  static async runForOrder(
    orderId: string,
    revisionNo: number,
    idempotencyKey: string,
    userId: string,
    user: any
  ) {
    const replay = await db.investmentComplianceRun.findUnique({ where: { idempotencyKey } });
    if (replay) {
      return db.investmentComplianceRun.findUnique({
        where: { id: replay.id },
        include: { results: true },
      });
    }
    const order = await db.investmentOrder.findUnique({
      where: { id: orderId },
      include: { instrument: true },
    });
    if (!order) throw new InvestmentOpsError("ORDER_NOT_FOUND", "Order not found", 404);
    await ListedEquityAccessService.assertFundAccess(userId, order.fundId, user);
    if (order.currentRevisionNo !== revisionNo) {
      throw new InvestmentOpsError("ORDER_REVISION_MISMATCH", "Compliance run must bind to current revision", 409);
    }
    const rules = await this.listRules(order.fundId);
    const valuation = await db.listedEquityValuationSnapshot.findFirst({
      where: { fundId: order.fundId },
      orderBy: { asOf: "desc" },
    });
    const nav = Number(valuation?.navBaseCurrency || 0);
    const orderValue = Number(order.quantity) * Number(order.executionPrice || order.limitPrice || 0);
    const evaluated = this.evaluateRules(rules, {
      order,
      weightPct: nav > 0 ? (orderValue / nav) * 100 : 100,
      nav,
    });
    return db.$transaction(async (tx: any) => {
      const run = await tx.investmentComplianceRun.create({
        data: {
          fundId: order.fundId,
          orderId,
          runType: "ORDER",
          status: "COMPLETED",
          ruleSetVersion: Math.max(0, ...rules.map((rule: any) => Number(rule.version || 1))),
          inputSnapshot: {
            orderId,
            revisionNo,
            quantity: order.quantity.toString(),
            price: String(order.executionPrice || order.limitPrice || "0"),
            nav: String(valuation?.navBaseCurrency || "0"),
            valuationSnapshotId: valuation?.id || null,
          },
          idempotencyKey,
          startedById: userId,
          completedAt: new Date(),
        },
      });
      const checks = evaluated.checks.length
        ? evaluated.checks
        : [{ ruleId: null, outcome: "PASSED", message: "No applicable active rules" }];
      await tx.investmentComplianceResult.createMany({
        data: checks.map((check: any) => ({
          orderId,
          complianceRunId: run.id,
          ruleId: check.ruleId,
          outcome: check.outcome,
          message: check.message,
        })),
      });
      return tx.investmentComplianceRun.findUnique({ where: { id: run.id }, include: { results: true } });
    });
  }

  static async listRuns(query: any, userId: string, user: any) {
    if (query.fundId) await ListedEquityAccessService.assertFundAccess(userId, query.fundId, user);
    const scope = await ListedEquityAccessService.getAccessibleFundIds(userId, user);
    const page = parsePagination(query);
    const where = {
      ...(query.fundId ? { fundId: query.fundId } : scope === "ALL" ? {} : { fundId: { in: scope } }),
      ...(query.orderId ? { orderId: query.orderId } : {}),
    };
    const [items, total] = await Promise.all([
      db.investmentComplianceRun.findMany({
        where,
        include: { results: true },
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.take,
      }),
      db.investmentComplianceRun.count({ where }),
    ]);
    return paginatedResult(items, total, page.page, page.pageSize);
  }

  /** Flat pre-trade compliance results for Orders → Compliance page. */
  static async listResults(query: any, userId: string, user: any) {
    if (query.fundId) await ListedEquityAccessService.assertFundAccess(userId, query.fundId, user);
    const scope = await ListedEquityAccessService.getAccessibleFundIds(userId, user);
    const page = parsePagination(query);
    const orderWhere: any = {
      ...(query.fundId ? { fundId: query.fundId } : scope === "ALL" ? {} : { fundId: { in: scope } }),
      ...(query.orderId ? { id: query.orderId } : {}),
    };
    const scopedOrders = await db.investmentOrder.findMany({
      where: orderWhere,
      select: {
        id: true,
        orderRef: true,
        fundId: true,
        side: true,
        instrumentId: true,
      },
    });
    const orderById = Object.fromEntries(scopedOrders.map((o: any) => [o.id, o]));
    const scopedOrderIds = scopedOrders.map((o: any) => o.id);
    if (!scopedOrderIds.length) {
      return paginatedResult([], 0, page.page, page.pageSize);
    }
    const where: any = {
      orderId: { in: scopedOrderIds },
      ...(query.outcome ? { outcome: String(query.outcome) } : {}),
    };
    const instrumentIds = [
      ...new Set(scopedOrders.map((o: any) => o.instrumentId).filter(Boolean)),
    ] as string[];
    const instruments = instrumentIds.length
      ? await db.investmentInstrument.findMany({
          where: { id: { in: instrumentIds } },
          select: { id: true, ticker: true },
        })
      : [];
    const tickerByInstrumentId = Object.fromEntries(
      instruments.map((i: any) => [i.id, i.ticker])
    );
    const [rows, total] = await Promise.all([
      db.investmentComplianceResult.findMany({
        where,
        include: {
          rule: true,
          complianceRun: true,
        },
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.take,
      }),
      db.investmentComplianceResult.count({ where }),
    ]);
    const items = rows.map((r: any) => {
      const order = orderById[r.orderId];
      const snap = (r.complianceRun?.inputSnapshot || {}) as any;
      const details = snap?.checks?.find?.((c: any) => c.ruleId === r.ruleId) || snap || {};
      return {
        id: r.id,
        orderId: r.orderId,
        orderRef: order?.orderRef ?? null,
        fundId: order?.fundId ?? r.complianceRun?.fundId ?? null,
        instrumentTicker: order?.instrumentId
          ? tickerByInstrumentId[order.instrumentId] ?? null
          : null,
        side: order?.side ?? null,
        ruleId: r.ruleId,
        ruleName: r.rule?.name ?? r.rule?.ruleName ?? null,
        ruleType: r.rule?.ruleType ?? r.rule?.typeCode ?? null,
        limitDisplay: details.limitDisplay ?? details.limit ?? null,
        currentDisplay: details.currentDisplay ?? details.current ?? null,
        afterTradeDisplay: details.afterTradeDisplay ?? details.afterTrade ?? null,
        outcome: r.outcome,
        message: r.message,
        createdAt: r.createdAt,
      };
    });
    return paginatedResult(items, total, page.page, page.pageSize);
  }

  static async getRun(id: string, userId: string, user: any) {
    const run = await db.investmentComplianceRun.findUnique({
      where: { id },
      include: { results: { include: { rule: true, overrides: true } } },
    });
    if (!run) throw new InvestmentOpsError("COMPLIANCE_RUN_NOT_FOUND", "Compliance run not found", 404);
    await ListedEquityAccessService.assertFundAccess(userId, run.fundId, user);
    return run;
  }

  static async requestOverride(data: any, userId: string, user: any) {
    const result = await db.investmentComplianceResult.findUnique({
      where: { id: data.complianceResultId },
      include: { order: true, complianceRun: true },
    });
    if (!result) throw new InvestmentOpsError("COMPLIANCE_RESULT_NOT_FOUND", "Compliance result not found", 404);
    await ListedEquityAccessService.assertFundAccess(userId, result.order.fundId, user);
    const revisionNo = Number((result.complianceRun?.inputSnapshot as any)?.revisionNo);
    if (!revisionNo || revisionNo !== result.order.currentRevisionNo) {
      throw new InvestmentOpsError("ORDER_REVISION_MISMATCH", "Override must bind to the current order revision", 409);
    }
    return db.investmentComplianceOverride.create({
      data: {
        complianceResultId: result.id,
        reasonCode: data.reasonCode,
        reason: data.reason,
        requestedById: userId,
        documentId: data.documentId,
        expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      },
    });
  }

  static async listOverrides(query: any, userId: string, user: any) {
    if (query.fundId) await ListedEquityAccessService.assertFundAccess(userId, query.fundId, user);
    const scope = await ListedEquityAccessService.getAccessibleFundIds(userId, user);
    const page = parsePagination(query);
    const orderWhere: any = {
      ...(query.fundId
        ? { fundId: query.fundId }
        : scope === "ALL"
          ? {}
          : { fundId: { in: scope } }),
      ...(query.orderId ? { id: query.orderId } : {}),
    };
    const scopedOrders = await db.investmentOrder.findMany({
      where: orderWhere,
      select: { id: true, orderRef: true, fundId: true },
    });
    const orderById = Object.fromEntries(scopedOrders.map((o: any) => [o.id, o]));
    const scopedOrderIds = scopedOrders.map((o: any) => o.id);
    if (!scopedOrderIds.length) {
      return paginatedResult([], 0, page.page, page.pageSize);
    }
    const where: any = {
      ...(query.status ? { status: query.status } : {}),
      complianceResult: {
        orderId: query.orderId ? query.orderId : { in: scopedOrderIds },
      },
    };
    const [rows, total] = await Promise.all([
      db.investmentComplianceOverride.findMany({
        where,
        include: {
          complianceResult: { include: { complianceRun: true, rule: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: page.skip,
        take: page.take,
      }),
      db.investmentComplianceOverride.count({ where }),
    ]);
    const requesterIds = [...new Set(rows.map((r: any) => r.requestedById).filter(Boolean))];
    const users = requesterIds.length
      ? await db.user.findMany({
          where: { id: { in: requesterIds } },
          select: { id: true, firstName: true, lastName: true, email: true },
        })
      : [];
    const nameById = Object.fromEntries(
      users.map((u: any) => [
        u.id,
        `${u.firstName || ""} ${u.lastName || ""}`.trim() || u.email || u.id,
      ])
    );
    const items = rows.map((r: any) => {
      const order = r.complianceResult?.orderId
        ? orderById[r.complianceResult.orderId]
        : null;
      return {
      id: r.id,
      orderId: r.complianceResult?.orderId ?? null,
      orderRef: order?.orderRef ?? null,
      fundId: order?.fundId ?? null,
      complianceResultId: r.complianceResultId,
      reason: r.reason,
      reasonCode: r.reasonCode,
      status: r.status,
      createdAt: r.createdAt,
      createdById: r.requestedById,
      createdByName: r.requestedById ? nameById[r.requestedById] || null : null,
      version: r.version,
      decidedAt: r.decidedAt,
      decidedById: r.decidedById,
    };
    });
    return paginatedResult(items, total, page.page, page.pageSize);
  }

  static async decideOverride(
    id: string,
    status: "APPROVED" | "REJECTED",
    version: string,
    userId: string,
    user: any
  ) {
    const override = await db.investmentComplianceOverride.findUnique({
      where: { id },
      include: { complianceResult: { include: { order: true, complianceRun: true } } },
    });
    if (!override) throw new InvestmentOpsError("COMPLIANCE_OVERRIDE_NOT_FOUND", "Override not found", 404);
    await ListedEquityAccessService.assertFundAccess(
      userId,
      override.complianceResult.order.fundId,
      user
    );
    expected(override.version, version);
    if (override.status !== "PENDING") {
      throw new InvestmentOpsError("OVERRIDE_ALREADY_DECIDED", "Override is no longer pending", 409);
    }
    if (override.requestedById === userId) {
      throw new InvestmentOpsError("FOUR_EYE_VIOLATION", "Override requester cannot decide it", 403);
    }
    const revisionNo = Number((override.complianceResult.complianceRun?.inputSnapshot as any)?.revisionNo);
    if (revisionNo !== override.complianceResult.order.currentRevisionNo) {
      throw new InvestmentOpsError("ORDER_REVISION_MISMATCH", "Order changed after override request", 409);
    }

    const order = override.complianceResult.order;
    // Phase2 machine: COMPLIANCE_REVIEW -> APPROVED|REJECTED|CANCELLED (no APPROVAL_PENDING).
    const nextOrderStatus =
      status === "APPROVED" && order.status === "COMPLIANCE_REVIEW" ? "APPROVED" : null;

    return db.$transaction(async (tx: any) => {
      const updated = await tx.investmentComplianceOverride.update({
        where: { id },
        data: { status, decidedById: userId, decidedAt: new Date(), version: { increment: 1 } },
      });
      if (status === "APPROVED") {
        await tx.investmentOrder.update({
          where: { id: order.id },
          data: {
            complianceStatus: "APPROVED_WITH_EXCEPTION",
            ...(nextOrderStatus ? { status: nextOrderStatus } : {}),
          },
        });
        await tx.investmentComplianceResult.update({
          where: { id: override.complianceResultId },
          data: {
            outcome: "APPROVED_WITH_EXCEPTION",
            overrideReason: override.reason || "Override approved",
            overrideById: userId,
          },
        });
      } else {
        await tx.investmentOrder.update({
          where: { id: order.id },
          data: {
            complianceStatus: "REJECTED",
            ...(order.status === "COMPLIANCE_REVIEW" ? { status: "REJECTED" } : {}),
          },
        });
        await tx.investmentComplianceResult.update({
          where: { id: override.complianceResultId },
          data: {
            outcome: "REJECTED",
            overrideReason: override.reason || "Override rejected",
            overrideById: userId,
          },
        });
      }
      return updated;
    });
  }

  static async checkOrder(orderId: string, userId?: string, user?: any) {
    const order = await prisma.investmentOrder.findUnique({
      where: { id: orderId },
      include: { instrument: true },
    });
    if (!order) throw new Error("Order not found");
    if (userId) {
      await ListedEquityAccessService.assertFundAccess(userId, order.fundId, user);
    }

    const rules = await this.listRules(order.fundId);
    const snap = await prisma.listedEquityValuationSnapshot.findFirst({
      where: { fundId: order.fundId },
      orderBy: { asOf: "desc" },
    });
    const nav = snap ? Number(snap.navBaseCurrency) : 0;
    const orderValue =
      Number(order.quantity) * Number(order.executionPrice || order.limitPrice || 0);
    const weightPct = nav > 0 ? (orderValue / nav) * 100 : 100;

    const worst = this.evaluateRules(rules, { order, weightPct, nav });

    await prisma.investmentComplianceResult.create({
      data: {
        orderId,
        ruleId: worst.ruleId,
        outcome: worst.outcome,
        message: worst.message,
      },
    });

    return worst;
  }

  /** @deprecated Use requestOverride + decideOverride (four-eye). */
  static async override(_data: {
    orderId: string;
    reason: string;
    userId: string;
    user: any;
    documentId?: string;
  }): Promise<never> {
    throw new InvestmentOpsError(
      "DEPRECATED",
      "Legacy compliance override is forbidden; use POST /compliance/overrides/requests then approve/reject",
      403
    );
  }
}
