// @ts-nocheck
import { prisma } from "../../utils/database";
import { ListedEquityAccessService } from "../listedEquity/ListedEquityAccessService";
import { ListedEquityPortfolioService } from "../listedEquity/ListedEquityPortfolioService";
import { PortfolioValuationEngine } from "../listedEquity/PortfolioValuationEngine";
import { moneyStr, moneyStr0 } from "./investmentOpsSupport";

const db = prisma as any;

async function portfolioIncomeKpis(fundId: string) {
  const incomeRows = await db.investmentTransaction.findMany({
    where: {
      fundId,
      status: "POSTED",
      transactionType: {
        in: [
          "DIVIDEND",
          "DIVIDEND_INCOME",
          "INTEREST",
          "INTEREST_INCOME",
          "COUPON",
          "COUPON_INCOME",
        ],
      },
    },
    select: { transactionType: true, netAmount: true },
  });
  let dividendIncome = 0;
  let interestIncome = 0;
  for (const row of incomeRows) {
    const amt = Number(row.netAmount || 0);
    const t = String(row.transactionType || "").toUpperCase();
    if (t.includes("DIVIDEND")) dividendIncome += amt;
    else if (t.includes("INTEREST") || t.includes("COUPON")) interestIncome += amt;
  }
  return {
    dividendIncome: moneyStr0(dividendIncome),
    interestIncome: moneyStr0(interestIncome),
    marginUsed: null as string | null,
  };
}

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

    const navNum = snap ? Number(snap.navBaseCurrency) : null;
    let cashBalance: number | null = null;
    let securitiesValue: number | null = null;

    const run = await db.investmentValuationRun.findFirst({
      where: { fundId, status: "COMPLETED" },
      orderBy: [{ asOf: "desc" }, { createdAt: "desc" }],
    });
    if (run) {
      const items = await db.investmentValuationItemSnapshot.findMany({
        where: { valuationRunId: run.id },
      });
      const instrumentIds = items.map((i: any) => i.instrumentId).filter(Boolean);
      const instruments = instrumentIds.length
        ? await prisma.investmentInstrument.findMany({
            where: { id: { in: instrumentIds } },
            select: { id: true, instrumentTypeCode: true },
          })
        : [];
      const typeById = new Map(instruments.map((i) => [i.id, String(i.instrumentTypeCode || "").toUpperCase()]));
      let cash = 0;
      let secs = 0;
      for (const item of items) {
        const mv = Number(item.baseMarketValue || 0);
        if (typeById.get(item.instrumentId) === "CASH") cash += mv;
        else secs += mv;
      }
      cashBalance = cash;
      securitiesValue = secs;
    } else {
      // Fall back to holdings market values when no valuation run exists
      try {
        const holdings = await ListedEquityPortfolioService.getHoldings(fundId, userId, user);
        let secs = 0;
        for (const h of holdings) secs += Number(h.marketValue ?? 0);
        securitiesValue = secs;
        cashBalance = navNum != null ? Math.max(0, navNum - secs) : null;
      } catch {
        /* leave null */
      }
    }

    const cashPct =
      navNum != null && navNum > 0 && cashBalance != null ? (cashBalance / navNum) * 100 : null;

    const income = await portfolioIncomeKpis(fundId);

    return {
      fundId: fund.id,
      name: fund.name,
      nav: navNum != null ? moneyStr0(navNum) : null,
      pnl: moneyStr0(pnl.unrealized?.usd ?? 0),
      cashBalance: cashBalance != null ? moneyStr0(cashBalance) : null,
      cashPct: cashPct != null ? moneyStr0(cashPct, 4) : null,
      securitiesValue: securitiesValue != null ? moneyStr0(securitiesValue) : null,
      dividendIncome: income.dividendIncome,
      interestIncome: income.interestIncome,
      marginUsed: income.marginUsed,
      startDate: fund.createdAt,
      valuationDate: snap?.asOf ?? run?.asOf ?? null,
      baseCurrency: fund.listedEquityFundConfig?.baseCurrencyCode ?? "USD",
      portfolioManager: fund.fundManagers[0]?.user
        ? `${fund.fundManagers[0].user.firstName} ${fund.fundManagers[0].user.lastName}`.trim()
        : null,
      status: snap?.status ?? (run ? "COMPLETED" : "PENDING"),
    };
  }

  static async holdings(fundId: string, userId: string, user: any) {
    return ListedEquityPortfolioService.getHoldings(fundId, userId, user);
  }

  /** Canonical transaction item (paged route uses Phase1; this shape is the FE dual-name contract). */
  static presentTransaction(t: any) {
    return {
      id: t.id,
      type: t.transactionType || t.type,
      transactionType: t.transactionType || t.type,
      tradeRef: t.transactionRef || t.tradeRef,
      transactionRef: t.transactionRef || t.tradeRef,
      symbol: t.symbol ?? t.instrumentTicker ?? null,
      quantity: moneyStr(t.quantity, 6),
      price: moneyStr(t.unitPrice ?? t.price, 6),
      netAmount: moneyStr(t.netAmount),
      realizedPnl: moneyStr(t.realizedPnl),
      status: t.status,
      tradeDate: t.tradeDate,
      journalEntryId: t.journalEntryId ?? null,
    };
  }

  static async transactions(fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const trades = await prisma.listedEquityTrade.findMany({
      where: { fundId, status: { not: "DRAFT" } },
      include: { security: true, settlement: true },
      orderBy: { executedAt: "desc" },
      take: 200,
    });
    return trades.map((t) =>
      this.presentTransaction({
        id: t.id,
        type: t.side === "BUY" ? "PURCHASE" : "SALE",
        transactionType: t.side === "BUY" ? "PURCHASE" : "SALE",
        tradeRef: t.tradeRef,
        transactionRef: t.tradeRef,
        symbol: t.security.symbol,
        quantity: t.quantity,
        unitPrice: t.executionPrice,
        netAmount: Number(t.quantity) * Number(t.executionPrice) + Number(t.fees || 0),
        status: t.status,
        tradeDate: t.executedAt,
        journalEntryId: t.settlement?.journalEntryId ?? null,
        realizedPnl: t.settlement?.realizedPnl,
      })
    );
  }

  static async exposure(fundId: string, userId: string, user: any) {
    await ListedEquityAccessService.assertFundAccess(userId, fundId, user);
    const holdings = await ListedEquityPortfolioService.getHoldings(fundId, userId, user);
    const byExchange: Record<string, number> = {};
    const bySector: Record<string, number> = {};
    const byCountry: Record<string, number> = {};
    let total = 0;
    for (const h of holdings) {
      const mv = h.marketValue ?? 0;
      total += mv;
      const ex = h.security?.exchangeCode ?? h.instrument?.exchangeCode ?? "OTHER";
      byExchange[ex] = (byExchange[ex] || 0) + mv;
      const sector = h.instrument?.sector || "Unclassified";
      bySector[sector] = (bySector[sector] || 0) + mv;
      const country = h.instrument?.countryCode || "Unknown";
      byCountry[country] = (byCountry[country] || 0) + mv;
    }
    const toBreakdown = (map: Record<string, number>) =>
      Object.entries(map).map(([key, value]) => ({
        key,
        value: moneyStr0(value),
        pct: moneyStr0(total > 0 ? (value / total) * 100 : 0, 4),
      }));
    const income = await portfolioIncomeKpis(fundId);
    return {
      byExchange: toBreakdown(byExchange),
      bySector: toBreakdown(bySector),
      byCountry: toBreakdown(byCountry),
      dividendIncome: income.dividendIncome,
      interestIncome: income.interestIncome,
      marginUsed: income.marginUsed,
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
