// @ts-nocheck
import { prisma } from "../../utils/database";
import { ListedEquityPortfolioService } from "../listedEquity/ListedEquityPortfolioService";

export class InvestmentComplianceService {
  static async listRules(fundId?: string) {
    return prisma.investmentComplianceRule.findMany({
      where: {
        isActive: true,
        ...(fundId ? { OR: [{ fundId }, { fundId: null }] } : {}),
      },
      orderBy: { ruleCode: "asc" },
    });
  }

  static async createRule(data: Record<string, unknown>) {
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

  static async checkOrder(orderId: string) {
    const order = await prisma.investmentOrder.findUnique({
      where: { id: orderId },
      include: { instrument: true },
    });
    if (!order) throw new Error("Order not found");

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

  static async override(data: {
    orderId: string;
    reason: string;
    userId: string;
    documentId?: string;
  }) {
    const { InvestmentOpsAuditService } = await import("./InvestmentOpsAuditService");
    await prisma.investmentComplianceResult.create({
      data: {
        orderId: data.orderId,
        outcome: "APPROVED_WITH_EXCEPTION",
        message: "Manual override",
        overrideReason: data.reason,
        overrideById: data.userId,
        overrideDocumentId: data.documentId,
      },
    });
    await InvestmentOpsAuditService.log(
      "COMPLIANCE_OVERRIDE",
      "Order",
      data.orderId,
      { reason: data.reason, documentId: data.documentId },
      data.userId
    );
    return prisma.investmentOrder.update({
      where: { id: data.orderId },
      data: { complianceStatus: "APPROVED_WITH_EXCEPTION", status: "APPROVED" },
    });
  }
}
