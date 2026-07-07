// @ts-nocheck
import { prisma } from "../../utils/database";
import { MarketDataScraperService } from "../listedEquity/MarketDataScraperService";

const STALE_HOURS_DEFAULT = 24;

export class InvestmentMarketDataFacadeService {
  static async latestPrices() {
    const securities = await prisma.listedEquitySecurity.findMany({ where: { isActive: true }, take: 500 });
    const out = [];
    for (const s of securities) {
      const tick = await prisma.listedEquityPriceTick.findFirst({
        where: { securityId: s.id, validationStatus: { in: ["APPROVED", "API_CONFIRMED"] } },
        orderBy: { pricedAt: "desc" },
      });
      out.push({
        securityId: s.id,
        symbol: s.symbol,
        exchangeCode: s.exchangeCode,
        price: tick ? Number(tick.price) : null,
        pricedAt: tick?.pricedAt ?? null,
        validationStatus: tick?.validationStatus ?? "STALE",
        sourceStatus: tick?.sourceStatus ?? "FALLBACK",
      });
    }
    return out;
  }

  static async stalePrices(hours = STALE_HOURS_DEFAULT) {
    const cutoff = new Date(Date.now() - hours * 3600 * 1000);
    const securities = await prisma.listedEquitySecurity.findMany({ where: { isActive: true } });
    const stale = [];
    for (const s of securities) {
      const tick = await prisma.listedEquityPriceTick.findFirst({
        where: { securityId: s.id, validationStatus: "APPROVED" },
        orderBy: { pricedAt: "desc" },
      });
      if (!tick || tick.pricedAt < cutoff) {
        stale.push({
          securityId: s.id,
          symbol: s.symbol,
          exchangeCode: s.exchangeCode,
          lastPrice: tick ? Number(tick.price) : null,
          pricedAt: tick?.pricedAt ?? null,
          status: "STALE",
        });
      }
    }
    return stale;
  }

  static async manualPriceEntry(data: {
    securityId: string;
    price: number;
    priceType?: string;
    userId: string;
  }) {
    const sec = await prisma.listedEquitySecurity.findUnique({ where: { id: data.securityId } });
    if (!sec) throw new Error("Security not found");
    return MarketDataScraperService.scrapeSource(sec.exchangeCode, [
      {
        symbol: sec.symbol,
        exchangeCode: sec.exchangeCode,
        priceType: data.priceType || "REFERENCE",
        price: data.price,
        pricedAt: new Date(),
        tickFrequency: "EOD",
      },
    ]);
  }

  static async uploadPricesCsv(csvText: string, sourceCode: string) {
    const lines = csvText.trim().split(/\r?\n/).filter(Boolean);
    const ticks = [];
    for (let i = 1; i < lines.length; i++) {
      const [symbol, price] = lines[i].split(",");
      const sec = await prisma.listedEquitySecurity.findFirst({
        where: { symbol: symbol.trim().toUpperCase(), exchangeCode: sourceCode },
      });
      if (!sec || !Number.isFinite(Number(price))) continue;
      ticks.push({
        symbol: sec.symbol,
        exchangeCode: sec.exchangeCode,
        priceType: "CLOSE",
        price: Number(price),
        pricedAt: new Date(),
        tickFrequency: "EOD",
      });
    }
    return MarketDataScraperService.scrapeSource(sourceCode, ticks);
  }

  static async runIngest(sourceCode: string) {
    return MarketDataScraperService.scrapeSource(sourceCode);
  }
}
