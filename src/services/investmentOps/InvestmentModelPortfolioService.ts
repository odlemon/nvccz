// @ts-nocheck
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { ListedEquityPortfolioService } from "../listedEquity/ListedEquityPortfolioService";

export class InvestmentModelPortfolioService {
  static async list() {
    return prisma.investmentModelPortfolio.findMany({
      where: { isActive: true },
      include: { allocations: true },
    });
  }

  static async create(data: {
    name: string;
    strategyCode?: string;
    baseCurrencyCode?: string;
    allocations?: Array<{ allocationType: string; allocationKey: string; targetWeightPct: number }>;
  }) {
    const model = await prisma.investmentModelPortfolio.create({
      data: {
        name: data.name,
        strategyCode: data.strategyCode,
        baseCurrencyCode: data.baseCurrencyCode || "USD",
      },
    });
    if (data.allocations?.length) {
      await prisma.investmentModelPortfolioAllocation.createMany({
        data: data.allocations.map((a) => ({
          modelPortfolioId: model.id,
          allocationType: a.allocationType,
          allocationKey: a.allocationKey,
          targetWeightPct: a.targetWeightPct,
        })),
      });
    }
    return prisma.investmentModelPortfolio.findUnique({
      where: { id: model.id },
      include: { allocations: true },
    });
  }

  static async drift(modelId: string, fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const model = await prisma.investmentModelPortfolio.findUnique({
      where: { id: modelId },
      include: { allocations: true },
    });
    if (!model) throw new Error("Model not found");

    const holdings = await ListedEquityPortfolioService.getHoldings(fundId, userId, user);
    const totalMv = holdings.reduce((s, h) => s + (h.marketValue ?? 0), 0) || 1;

    const liveWeights: Record<string, number> = {};
    for (const h of holdings) {
      const key = h.security?.exchangeCode ?? "EQUITY";
      liveWeights[key] = (liveWeights[key] || 0) + ((h.marketValue ?? 0) / totalMv) * 100;
    }

    const drift = model.allocations.map((a) => {
      const target = Number(a.targetWeightPct);
      const live =
        a.allocationType === "EXCHANGE"
          ? liveWeights[a.allocationKey] ?? 0
          : a.allocationType === "ASSET_CLASS" && a.allocationKey === "EQUITY"
            ? 100
            : 0;
      return {
        allocationType: a.allocationType,
        key: a.allocationKey,
        targetWeightPct: target,
        liveWeightPct: live,
        driftPct: live - target,
        rebalanceAction: live > target ? "REDUCE" : live < target ? "INCREASE" : "HOLD",
      };
    });

    return { model, fundId, drift, recommendations: drift.filter((d) => Math.abs(d.driftPct) > 2) };
  }
}
