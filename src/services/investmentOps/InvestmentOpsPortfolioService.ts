// @ts-nocheck
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { ListedEquityPortfolioService } from "../listedEquity/ListedEquityPortfolioService";
import { PortfolioValuationEngine } from "../listedEquity/PortfolioValuationEngine";

export class InvestmentOpsPortfolioService {
  static async list(userId: string, user: any) {
    return ListedEquityPortfolioService.listFunds(userId, user);
  }

  static async overview(fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const fund = await prisma.fund.findUnique({
      where: { id: fundId },
      include: {
        listedEquityFundConfig: true,
        listedEquityValuationSnapshots: { orderBy: { asOf: "desc" }, take: 1 },
        fundManagers: { include: { user: true }, where: { isActive: true }, take: 1 },
      },
    });
    if (!fund) throw new Error("Fund not found");
    const snap = fund.listedEquityValuationSnapshots[0];
    const pnl = await ListedEquityPortfolioService.getPnl(fundId, userId, user);
    return {
      fundId: fund.id,
      name: fund.name,
      nav: snap ? Number(snap.navBaseCurrency) : null,
      pnl: pnl.unrealized?.usd ?? 0,
      startDate: fund.createdAt,
      valuationDate: snap?.asOf ?? null,
      baseCurrency: fund.listedEquityFundConfig?.baseCurrencyCode ?? "USD",
      portfolioManager: fund.fundManagers[0]?.user
        ? `${fund.fundManagers[0].user.firstName} ${fund.fundManagers[0].user.lastName}`.trim()
        : null,
      status: snap?.status ?? "PENDING",
    };
  }

  static async holdings(fundId: string, userId: string, user: any) {
    return ListedEquityPortfolioService.getHoldings(fundId, userId, user);
  }

  static async transactions(fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const trades = await prisma.listedEquityTrade.findMany({
      where: { fundId, status: { not: "DRAFT" } },
      include: { security: true, settlement: true },
      orderBy: { executedAt: "desc" },
      take: 200,
    });
    return trades.map((t) => ({
      id: t.id,
      type: t.side === "BUY" ? "PURCHASE" : "SALE",
      tradeRef: t.tradeRef,
      symbol: t.security.symbol,
      quantity: Number(t.quantity),
      price: Number(t.executionPrice),
      status: t.status,
      tradeDate: t.executedAt,
      journalEntryId: t.settlement?.journalEntryId ?? null,
      realizedPnl: t.settlement?.realizedPnl != null ? Number(t.settlement.realizedPnl) : null,
    }));
  }

  static async exposure(fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const holdings = await ListedEquityPortfolioService.getHoldings(fundId, userId, user);
    const byExchange: Record<string, number> = {};
    let total = 0;
    for (const h of holdings) {
      const mv = h.marketValue ?? 0;
      total += mv;
      const ex = h.security?.exchangeCode ?? "OTHER";
      byExchange[ex] = (byExchange[ex] || 0) + mv;
    }
    return {
      byExchange: Object.entries(byExchange).map(([key, value]) => ({
        key,
        value,
        pct: total > 0 ? (value / total) * 100 : 0,
      })),
      topHoldings: holdings
        .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
        .slice(0, 10),
    };
  }

  static async recalculate(fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    return PortfolioValuationEngine.runFundValuation(fundId);
  }
}
