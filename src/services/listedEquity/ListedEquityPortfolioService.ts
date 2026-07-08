// @ts-nocheck
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "./ListedEquityAccessService";
import { PortfolioValuationEngine } from "./PortfolioValuationEngine";
import { WacCalculatorService } from "./WacCalculatorService";

export class ListedEquityPortfolioService {
  static async listFunds(userId: string, user: any) {
    const scope = await ListedEquityAccessService.getAccessibleListedEquityFundIds(userId, user);
    const funds = await prisma.fund.findMany({
      where: {
        ...ListedEquityAccessService.listedEquityFundWhere(),
        ...(scope === "ALL" ? {} : { id: { in: scope } }),
      },
      include: {
        listedEquityFundConfig: true,
        listedEquityValuationSnapshots: { orderBy: { asOf: "desc" }, take: 1 },
      },
    });
    return funds.map((f) => ({
      id: f.id,
      name: f.name,
      fundPurpose: f.fundPurpose,
      baseCurrencyCode: f.listedEquityFundConfig?.baseCurrencyCode || "USD",
      latestSnapshot: f.listedEquityValuationSnapshots[0] || null,
    }));
  }

  static async getHoldings(fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const holdings = await prisma.listedEquityHolding.findMany({
      where: { fundId },
      include: { security: true },
    });
    const rows = [];
    for (const h of holdings) {
      const price = await PortfolioValuationEngine.latestApprovedPrice(h.securityId);
      const qty = Number(h.quantity);
      const wac = Number(h.wac);
      const marketValue = price != null ? qty * price : null;
      const unrealized = price != null ? WacCalculatorService.unrealizedPnl(qty, price, wac) : null;
      rows.push({
        ...h,
        quantity: qty,
        wac,
        currentPrice: price,
        marketValue,
        unrealizedPnl: unrealized,
      });
    }
    return rows;
  }

  static async getPnl(fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const snap = await prisma.listedEquityValuationSnapshot.findFirst({
      where: { fundId },
      orderBy: { asOf: "desc" },
    });
    const settlements = await prisma.listedEquityTradeSettlement.findMany({
      where: { trade: { fundId } },
      include: { trade: true },
    });
    const realizedUsd = settlements.reduce((s, r) => s + Number(r.realizedPnl || 0), 0);
    return {
      unrealized: snap
        ? {
            usd: Number(snap.unrealizedPnlUsd),
            zig: Number(snap.unrealizedPnlZig),
            fxRateUsed: snap.fxRateUsed ? Number(snap.fxRateUsed) : null,
            fxRateSource: snap.fxRateSource,
          }
        : null,
      realized: { usd: realizedUsd, zig: snap?.fxRateUsed ? realizedUsd / Number(snap.fxRateUsed) : 0 },
      snapshot: snap,
    };
  }

  static async listValuations(fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    return prisma.listedEquityValuationSnapshot.findMany({
      where: { fundId },
      orderBy: { asOf: "desc" },
      take: 100,
    });
  }

  static async forceValuationRun(fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    return PortfolioValuationEngine.runFundValuation(fundId);
  }

  static async getWatchlist(userId: string) {
    const entries = await prisma.listedEquityWatchlistEntry.findMany({
      where: { userId },
      include: { security: true },
    });
    const out = [];
    for (const e of entries) {
      const tick = await prisma.listedEquityPriceTick.findFirst({
        where: { securityId: e.securityId, validationStatus: "APPROVED" },
        orderBy: { pricedAt: "desc" },
      });
      out.push({
        security: e.security,
        latestTick: tick,
        indicator: tick?.tickFrequency || "EOD",
      });
    }
    return out;
  }

  static async replaceWatchlist(userId: string, securityIds: string[]) {
    await prisma.listedEquityWatchlistEntry.deleteMany({ where: { userId } });
    if (securityIds.length) {
      await prisma.listedEquityWatchlistEntry.createMany({
        data: securityIds.map((securityId) => ({ userId, securityId })),
        skipDuplicates: true,
      });
    }
    return this.getWatchlist(userId);
  }
}
