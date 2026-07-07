// @ts-nocheck
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { ListedEquityPortfolioService } from "../listedEquity/ListedEquityPortfolioService";
import { PortfolioValuationEngine } from "../listedEquity/PortfolioValuationEngine";
import { allocationBucketForType, periodRange } from "./investmentOpsSupport";

export class InvestmentOpsDashboardService {
  static async summary(
    userId: string,
    user: any,
    period = "YTD",
    customStart?: string,
    customEnd?: string
  ) {
    const { start, end, label } = periodRange(period, customStart, customEnd);
    const funds = await ListedEquityPortfolioService.listFunds(userId, user);
    const rows = [];
    for (const f of funds) {
      const snapInPeriod = await prisma.listedEquityValuationSnapshot.findFirst({
        where: { fundId: f.id, asOf: { gte: start, lte: end } },
        orderBy: { asOf: "desc" },
      });
      const snap = snapInPeriod ?? f.latestSnapshot;

      const settlements = await prisma.listedEquityTradeSettlement.findMany({
        where: {
          trade: { fundId: f.id },
          updatedAt: { gte: start, lte: end },
        },
        include: { trade: true },
      });
      let periodRealizedPnl = 0;
      for (const s of settlements) {
        if (s.realizedPnl != null) periodRealizedPnl += Number(s.realizedPnl);
      }

      const nav = snap ? Number(snap.navBaseCurrency) : 0;
      const unrealized = snap ? Number(snap.unrealizedPnlUsd) : 0;
      const pnl = periodRealizedPnl + unrealized;
      const pnlPct = nav > 0 ? (pnl / nav) * 100 : 0;
      rows.push({
        fundId: f.id,
        name: f.name,
        nav,
        valuationDate: snap?.asOf ?? null,
        pnl,
        pnlPct,
        periodRealizedPnl,
        baseCurrency: f.baseCurrencyCode,
        status: snap?.status ?? "STALE",
        lastRecalculation: snap?.asOf ?? null,
        period: label,
        periodStart: start,
        periodEnd: end,
      });
    }
    return { portfolios: rows, period: label, periodStart: start, periodEnd: end };
  }

  static async allocation(userId: string, user: any, fundId?: string) {
    const scope = await ListedEquityAccessService.getAccessibleFundIds(userId, user);
    const fundWhere =
      fundId != null
        ? { fundId }
        : scope === "ALL"
          ? {}
          : { fundId: { in: scope } };

    const buckets: Record<string, number> = {
      equities: 0,
      cash: 0,
      bonds: 0,
      funds: 0,
      commodities: 0,
      crypto: 0,
      alternatives: 0,
      other: 0,
    };

    const holdings = await prisma.listedEquityHolding.findMany({
      where: { ...fundWhere, quantity: { gt: 0 } },
      include: { security: true, fund: true },
    });

    const instrumentBySecurity = new Map<string, { instrumentTypeCode: string }>();
    const securityIds = [...new Set(holdings.map((h) => h.securityId))];
    if (securityIds.length) {
      const instruments = await prisma.investmentInstrument.findMany({
        where: { listedEquitySecurityId: { in: securityIds } },
        select: { listedEquitySecurityId: true, instrumentTypeCode: true },
      });
      for (const inst of instruments) {
        if (inst.listedEquitySecurityId) {
          instrumentBySecurity.set(inst.listedEquitySecurityId, inst);
        }
      }
    }

    for (const h of holdings) {
      const price = await PortfolioValuationEngine.latestApprovedPrice(h.securityId);
      const mv = price != null ? Number(h.quantity) * price : Number(h.quantity) * Number(h.wac);
      const inst = instrumentBySecurity.get(h.securityId);
      const typeCode =
        inst?.instrumentTypeCode ??
        (h.security.exchangeCode === "CASH" ? "CASH" : "EQUITY");
      const bucket = allocationBucketForType(typeCode);
      buckets[bucket] = (buckets[bucket] || 0) + mv;
    }

    const total = Object.values(buckets).reduce((a, b) => a + b, 0) || 1;
    const out: Record<string, { value: number; pct: number }> = {};
    for (const [k, v] of Object.entries(buckets)) {
      out[k] = { value: v, pct: (v / total) * 100 };
    }
    return out;
  }

  static async currencyExposure(userId: string, user: any, fundId?: string) {
    const scope = await ListedEquityAccessService.getAccessibleFundIds(userId, user);
    if (fundId) await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const where: any = fundId ? { fundId } : scope === "ALL" ? {} : { fundId: { in: scope } };
    const holdings = await prisma.listedEquityHolding.findMany({
      where,
      include: { security: true },
    });
    const byCurrency: Record<string, number> = {};
    for (const h of holdings) {
      const ccy = h.security.listingCurrencyCode || "USD";
      const price = await PortfolioValuationEngine.latestApprovedPrice(h.securityId);
      const mv = price != null ? Number(h.quantity) * price : 0;
      byCurrency[ccy] = (byCurrency[ccy] || 0) + mv;
    }
    return Object.entries(byCurrency).map(([currency, value]) => ({ currency, value }));
  }

  static async fundsTable(userId: string, user: any) {
    return ListedEquityPortfolioService.listFunds(userId, user);
  }

  static async recalculate(userId: string, user: any, fundId?: string) {
    const scope = await ListedEquityAccessService.getAccessibleFundIds(userId, user);
    const fundIds =
      fundId != null
        ? [fundId]
        : scope === "ALL"
          ? (await prisma.fund.findMany({ select: { id: true } })).map((f) => f.id)
          : scope;
    const results = [];
    for (const id of fundIds) {
      await ListedEquityAccessService.assertFundAccess(userId, id, user);
      results.push(await PortfolioValuationEngine.runFundValuation(id));
    }
    return results;
  }
}
