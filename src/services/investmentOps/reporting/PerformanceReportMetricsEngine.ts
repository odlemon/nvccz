// @ts-nocheck
import { prisma } from "../../../utils/database";
import { ListedEquityPortfolioService } from "../../listedEquity/ListedEquityPortfolioService";
import { InvestmentOpsPortfolioService } from "../InvestmentOpsPortfolioService";

export type PeriodMetrics = {
  openingNav: number;
  closingNav: number;
  realisedPnl: number;
  unrealisedPnl: number;
  totalPnl: number;
  returnPct: number;
  netCashFlows: number;
  income: number;
  tradeFees: number;
};

function num(v: unknown): number {
  if (v == null) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function snapNav(s: { navBaseCurrency: unknown } | null | undefined): number {
  return s ? num(s.navBaseCurrency) : 0;
}

export class PerformanceReportMetricsEngine {
  static async loadSnapshots(fundId: string, limit = 120) {
    return prisma.listedEquityValuationSnapshot.findMany({
      where: { fundId },
      orderBy: { asOf: "asc" },
      take: limit,
    });
  }

  static snapshotNear(snapshots: any[], date: Date): any | null {
    let best: any = null;
    for (const s of snapshots) {
      if (new Date(s.asOf) <= date) best = s;
      else break;
    }
    return best;
  }

  static async metricsForPeriod(
    fundId: string,
    start: Date,
    end: Date,
    snapshots: any[]
  ): Promise<PeriodMetrics> {
    const openingSnap = this.snapshotNear(snapshots, start);
    const closingSnap = this.snapshotNear(snapshots, end) ?? snapshots[snapshots.length - 1];
    const openingNav = snapNav(openingSnap) || snapNav(closingSnap);
    const closingNav = snapNav(closingSnap);

    const settlements = await prisma.listedEquityTradeSettlement.findMany({
      where: {
        trade: {
          fundId,
          status: { not: "DRAFT" },
          executedAt: { gte: start, lte: end },
        },
      },
      include: { trade: true },
    });
    let realisedPnl = 0;
    for (const s of settlements) realisedPnl += num(s.realizedPnl);

    const unrealizedPnl = num(closingSnap?.unrealizedPnlUsd);
    const totalPnl = realisedPnl + unrealizedPnl;
    const returnPct = openingNav > 0 ? ((closingNav - openingNav) / openingNav) * 100 : 0;

    const trades = await prisma.listedEquityTrade.findMany({
      where: {
        fundId,
        executedAt: { gte: start, lte: end },
        status: { not: "DRAFT" },
      },
    });
    const tradeFees = trades.reduce((sum, t) => sum + num(t.fees), 0);
    const netCashFlows = trades.reduce((sum, t) => {
      const gross = num(t.quantity) * num(t.executionPrice);
      return sum + (t.side === "BUY" ? -gross : gross);
    }, 0);

    return {
      openingNav,
      closingNav,
      realisedPnl,
      unrealisedPnl: unrealizedPnl,
      totalPnl,
      returnPct,
      netCashFlows,
      income: 0,
      tradeFees,
    };
  }

  /** Simplified risk stats from NAV snapshot series. */
  static riskFromSnapshots(snapshots: any[]): {
    volatility: number;
    maxDrawdown: number;
    sharpe: number;
    trackingError: number;
  } {
    if (snapshots.length < 2) {
      return { volatility: 0, maxDrawdown: 0, sharpe: 0, trackingError: 0 };
    }
    const returns: number[] = [];
    let peak = snapNav(snapshots[0]);
    let maxDd = 0;
    for (let i = 1; i < snapshots.length; i++) {
      const prev = snapNav(snapshots[i - 1]);
      const cur = snapNav(snapshots[i]);
      if (prev > 0) returns.push((cur - prev) / prev);
      if (cur > peak) peak = cur;
      const dd = peak > 0 ? ((peak - cur) / peak) * 100 : 0;
      if (dd > maxDd) maxDd = dd;
    }
    const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
    const variance =
      returns.length > 1
        ? returns.reduce((s, r) => s + (r - mean) ** 2, 0) / (returns.length - 1)
        : 0;
    const vol = Math.sqrt(variance) * Math.sqrt(12) * 100;
    const sharpe = vol > 0 ? (mean * 12 * 100) / vol : 0;
    return {
      volatility: vol,
      maxDrawdown: maxDd,
      sharpe,
      trackingError: vol * 0.5,
    };
  }

  /** Benchmark proxy: equal-weight avg return of ZSE-listed holdings over period. */
  static async benchmarkReturnPct(
    fundId: string,
    userId: string,
    user: any,
    start: Date,
    end: Date
  ): Promise<number> {
    const holdings = await ListedEquityPortfolioService.getHoldings(fundId, userId, user);
    if (!holdings.length) return 0;
    let sum = 0;
    let count = 0;
    for (const h of holdings) {
      const wac = num(h.wac);
      const price = num(h.currentPrice);
      if (wac > 0 && price > 0) {
        sum += ((price - wac) / wac) * 100;
        count++;
      }
    }
    return count ? sum / count : 0;
  }

  static async modelBenchmarkWeights(fundId: string): Promise<Record<string, number>> {
    const model = await prisma.investmentModelPortfolio.findFirst({
      where: { isActive: true },
      include: { allocations: true },
      orderBy: { updatedAt: "desc" },
    });
    const weights: Record<string, number> = {};
    if (!model) return weights;
    for (const a of model.allocations) {
      weights[a.allocationKey] = num(a.targetWeightPct);
    }
    return weights;
  }

  static async loadSupplementary(fundId: string, userId: string, user: any) {
    const [overview, transactions, valRuns, reconBatches, acctEvents, documents, valEx, commissions] =
      await Promise.all([
        InvestmentOpsPortfolioService.overview(fundId, userId, user),
        InvestmentOpsPortfolioService.transactions(fundId, userId, user),
        prisma.investmentValuationRun.findMany({
          where: { fundId },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        prisma.investmentReconciliationBatch.findMany({
          where: { fundId },
          orderBy: { createdAt: "desc" },
          take: 3,
          include: { items: true },
        }),
        prisma.investmentAccountingEvent.findMany({
          where: { fundId },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        prisma.investmentDocument.findMany({
          where: { fundId },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        prisma.investmentValuationException.findMany({
          where: { fundId },
          orderBy: { createdAt: "desc" },
          take: 5,
        }),
        prisma.investmentBrokerCommission.findMany({ where: { isActive: true }, take: 10 }),
      ]);

    const mgmtRate = await prisma.fund.findUnique({
      where: { id: fundId },
      select: { managementFeeRate: true, managementFeeFrequency: true },
    });

    return {
      overview,
      transactions,
      valRuns,
      reconBatches,
      acctEvents,
      documents,
      valEx,
      brokerCommissions: commissions,
      mgmtRate,
    };
  }

  static monthBucketsInRange(start: Date, end: Date): { label: string; start: Date; end: Date }[] {
    const buckets: { label: string; start: Date; end: Date }[] = [];
    const cur = new Date(start.getFullYear(), start.getMonth(), 1);
    while (cur <= end && buckets.length < 3) {
      const monthEnd = new Date(cur.getFullYear(), cur.getMonth() + 1, 0, 23, 59, 59, 999);
      const bEnd = monthEnd > end ? end : monthEnd;
      const label = cur.toLocaleString("en-US", { month: "short", year: "numeric" });
      buckets.push({ label, start: new Date(cur), end: bEnd });
      cur.setMonth(cur.getMonth() + 1);
    }
    return buckets;
  }
}
