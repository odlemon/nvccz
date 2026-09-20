// @ts-nocheck
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { ListedEquityPortfolioService } from "../listedEquity/ListedEquityPortfolioService";
import { PortfolioValuationEngine } from "../listedEquity/PortfolioValuationEngine";
import { WacCalculatorService } from "../listedEquity/WacCalculatorService";
import { allocationBucketForType, moneyStr0, periodRange } from "./investmentOpsSupport";

async function resolveFundIds(userId: string, user: any, fundId?: string): Promise<string[]> {
  const scope = await ListedEquityAccessService.getAccessibleListedEquityFundIds(userId, user);
  if (fundId) {
    await ListedEquityAccessService.assertListedEquityFundAccess(userId, fundId, user);
    return [fundId];
  }
  if (scope === "ALL") {
    return (
      await prisma.fund.findMany({
        where: ListedEquityAccessService.listedEquityFundWhere(),
        select: { id: true },
      })
    ).map((f) => f.id);
  }
  return scope;
}

/** Holdings-based NAV / PnL when no COMPLETED valuation run exists yet. */
async function holdingsNavFallback(fundId: string) {
  const holdings = await prisma.listedEquityHolding.findMany({
    where: { fundId },
    include: { security: true },
  });
  let nav = 0;
  let unrealized = 0;
  const byCurrency: Record<string, number> = {};
  const byBucket: Record<string, number> = {
    equities: 0,
    cash: 0,
    bonds: 0,
    funds: 0,
    commodities: 0,
    crypto: 0,
    alternatives: 0,
    other: 0,
  };

  const securityIds = holdings.map((h) => h.securityId);
  const instruments = securityIds.length
    ? await prisma.investmentInstrument.findMany({
        where: { listedEquitySecurityId: { in: securityIds } },
        select: { listedEquitySecurityId: true, instrumentTypeCode: true },
      })
    : [];
  const typeBySecurity = new Map(
    instruments
      .filter((i) => i.listedEquitySecurityId)
      .map((i) => [i.listedEquitySecurityId as string, i.instrumentTypeCode])
  );

  for (const h of holdings) {
    const price = await PortfolioValuationEngine.latestApprovedPrice(h.securityId);
    if (price == null) continue;
    const qty = Number(h.quantity);
    const wac = Number(h.wac);
    const mv = qty * price;
    const pnl = WacCalculatorService.unrealizedPnl(qty, price, wac);
    nav += mv;
    unrealized += pnl;
    const ccy = h.security?.listingCurrencyCode || "USD";
    byCurrency[ccy] = (byCurrency[ccy] || 0) + mv;
    const bucket = allocationBucketForType(typeBySecurity.get(h.securityId) || "EQUITY");
    byBucket[bucket] = (byBucket[bucket] || 0) + mv;
  }

  const snap = await prisma.listedEquityValuationSnapshot.findFirst({
    where: { fundId },
    orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
  });
  if (snap && nav <= 0) {
    nav = Number(snap.navBaseCurrency);
    unrealized = Number(snap.unrealizedPnlUsd);
  }

  return {
    nav,
    unrealized,
    asOf: snap?.asOf ?? new Date(),
    byCurrency,
    byBucket,
    source: snap && Number(snap.navBaseCurrency) > 0 && holdings.length === 0 ? "SNAPSHOT" : "HOLDINGS",
  };
}

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
      const run = await (prisma as any).investmentValuationRun.findFirst({
        where: {
          fundId: f.id,
          status: { in: ["COMPLETED", "COMPLETED_WITH_EXCEPTIONS"] },
          asOf: { gte: start, lte: end },
        },
        orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
      });

      const transactions = await (prisma as any).investmentTransaction.findMany({
        where: {
          fundId: f.id,
          status: "POSTED",
          tradeDate: { gte: start, lte: end },
          transactionType: { in: ["REALIZED_GAIN", "REALIZED_LOSS"] },
        },
      });
      const periodRealizedPnl = transactions.reduce(
        (sum: number, transaction: any) => sum + Number(transaction.netAmount),
        0
      );

      let nav = 0;
      let unrealized = 0;
      let valuationDate: Date | null = null;
      let status = "NO_COMPLETED_VALUATION";
      let valuationRunId: string | null = null;
      let lastRecalculation: Date | null = null;

      if (run) {
        const itemTotals = await (prisma as any).investmentValuationItemSnapshot.aggregate({
          where: { valuationRunId: run.id },
          _sum: { unrealizedPnl: true },
        });
        nav = Number(run.navBaseCurrency);
        unrealized = Number(itemTotals?._sum?.unrealizedPnl ?? 0);
        valuationDate = run.asOf;
        status = run.status;
        valuationRunId = run.id;
        lastRecalculation = run.completedAt;
      } else {
        const fallback = await holdingsNavFallback(f.id);
        nav = fallback.nav;
        unrealized = fallback.unrealized;
        valuationDate = fallback.asOf;
        status = nav > 0 ? "SNAPSHOT_FALLBACK" : "NO_COMPLETED_VALUATION";
        lastRecalculation = f.latestSnapshot?.createdAt ?? fallback.asOf;
      }

      const pnl = periodRealizedPnl + unrealized;
      const pnlPct = nav > 0 ? (pnl / nav) * 100 : 0;
      rows.push({
        fundId: f.id,
        name: f.name,
        nav: moneyStr0(nav),
        valuationDate,
        pnl: moneyStr0(pnl),
        pnlPct: moneyStr0(pnlPct, 4),
        periodRealizedPnl: moneyStr0(periodRealizedPnl),
        unrealizedPnl: moneyStr0(unrealized),
        baseCurrency: f.baseCurrencyCode,
        status,
        valuationRunId,
        lastRecalculation,
        period: label,
        periodStart: start,
        periodEnd: end,
      });
    }
    return { portfolios: rows, period: label, periodStart: start, periodEnd: end };
  }

  static async allocation(userId: string, user: any, fundId?: string) {
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

    const targetFundIds = await resolveFundIds(userId, user, fundId);
    for (const id of targetFundIds) {
      const run = await (prisma as any).investmentValuationRun.findFirst({
        where: { fundId: id, status: { in: ["COMPLETED", "COMPLETED_WITH_EXCEPTIONS"] } },
        orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
      });
      if (run) {
        const items = await (prisma as any).investmentValuationItemSnapshot.findMany({
          where: { valuationRunId: run.id },
        });
        const instrumentIds = items.map((item: any) => item.instrumentId).filter(Boolean);
        const instruments = instrumentIds.length
          ? await prisma.investmentInstrument.findMany({
              where: { id: { in: instrumentIds } },
              select: { id: true, instrumentTypeCode: true },
            })
          : [];
        const types = new Map(instruments.map((instrument) => [instrument.id, instrument.instrumentTypeCode]));
        for (const item of items) {
          const typeCode = types.get(item.instrumentId) ?? "EQUITY";
          const mv = Number(item.baseMarketValue);
          const bucket = allocationBucketForType(typeCode);
          buckets[bucket] = (buckets[bucket] || 0) + mv;
        }
      } else {
        const fallback = await holdingsNavFallback(id);
        for (const [k, v] of Object.entries(fallback.byBucket)) {
          buckets[k] = (buckets[k] || 0) + (v as number);
        }
      }
    }

    const total = Object.values(buckets).reduce((a, b) => a + b, 0) || 1;
    const out: Record<string, { value: string; pct: string }> = {};
    for (const [k, v] of Object.entries(buckets)) {
      out[k] = { value: moneyStr0(v), pct: moneyStr0((v / total) * 100, 4) };
    }
    return out;
  }

  static async currencyExposure(userId: string, user: any, fundId?: string) {
    const byCurrency: Record<string, number> = {};
    const fundIds = await resolveFundIds(userId, user, fundId);
    for (const id of fundIds) {
      const run = await (prisma as any).investmentValuationRun.findFirst({
        where: { fundId: id, status: { in: ["COMPLETED", "COMPLETED_WITH_EXCEPTIONS"] } },
        orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
      });
      if (run) {
        const items = await (prisma as any).investmentValuationItemSnapshot.findMany({
          where: { valuationRunId: run.id },
        });
        for (const item of items) {
          byCurrency[item.currencyCode] =
            (byCurrency[item.currencyCode] || 0) + Number(item.baseMarketValue);
        }
      } else {
        const fallback = await holdingsNavFallback(id);
        for (const [ccy, v] of Object.entries(fallback.byCurrency)) {
          byCurrency[ccy] = (byCurrency[ccy] || 0) + v;
        }
      }
    }
    return Object.entries(byCurrency).map(([currency, value]) => ({
      currency,
      value: moneyStr0(value),
    }));
  }

  static async fundsTable(userId: string, user: any) {
    return ListedEquityPortfolioService.listFunds(userId, user);
  }

  static async recalculate(userId: string, user: any, fundId?: string) {
    const fundIds = await resolveFundIds(userId, user, fundId);
    const results = [];
    for (const id of fundIds) {
      await ListedEquityAccessService.assertFundAccess(userId, id, user);
      results.push(await PortfolioValuationEngine.runFundValuation(id));
    }
    return results;
  }
}
