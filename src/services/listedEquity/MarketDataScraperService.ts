// @ts-nocheck
import { prisma } from "../../utils/database";
import { MarketDataIngestService, type NormalisedTick } from "./MarketDataIngestService";
import { MansaMarketDataClient } from "./MansaMarketDataClient";
import { MansaSecuritySyncService } from "./MansaSecuritySyncService";
import { MansaMarketDataAdapter } from "./MarketDataProviderAdapter";
import { VfexMarketDataClient } from "./VfexMarketDataClient";
import { VfexSecuritySyncService } from "./VfexSecuritySyncService";
import { NasdaqMarketDataService, NyseMarketDataService } from "./InternationalMarketDataService";
import { loadLatestApprovedPriceMap } from "./listedEquityBulkPersist";
import { marketDataFetch } from "./listedEquityExternalFetch";
import { ingestLog, ingestTimed } from "./listedEquityIngestLogger";

const MAX_ATTEMPTS = 5;

async function fetchWithBackoff(url: string): Promise<string> {
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await marketDataFetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e: any) {
      lastErr = e;
      const delay = Math.min(60_000, 1000 * 2 ** (attempt - 1) + Math.random() * 500);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr || new Error("Fetch failed");
}

function parseCsvOrJson(text: string, sourceCode: string): NormalisedTick[] {
  const pricedAt = new Date();
  const ticks: NormalisedTick[] = [];
  const trimmed = text.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const data = JSON.parse(trimmed);
    const rows = Array.isArray(data) ? data : data.ticks || data.prices || [];
    for (const row of rows) {
      ticks.push({
        symbol: String(row.symbol || row.ticker || "").toUpperCase(),
        exchangeCode: String(row.exchangeCode || row.exchange || sourceCode).toUpperCase(),
        priceType: String(row.priceType || "CLOSE").toUpperCase(),
        price: Number(row.price || row.close || row.value),
        pricedAt: row.pricedAt ? new Date(row.pricedAt) : pricedAt,
        tickFrequency: row.tickFrequency || "EOD",
      });
    }
    return ticks.filter((t) => t.symbol && Number.isFinite(t.price));
  }
  const lines = trimmed.split(/\r?\n/).filter(Boolean);
  const header = lines[0]?.toLowerCase() || "";
  const symIdx = header.includes("symbol") ? header.split(",").indexOf("symbol") : 0;
  const priceIdx = header.includes("close") ? header.split(",").indexOf("close") : 1;
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const symbol = (cols[symIdx] || "").trim().toUpperCase();
    const price = Number((cols[priceIdx] || cols[1] || "").trim());
    if (!symbol || !Number.isFinite(price)) continue;
    ticks.push({
      symbol,
      exchangeCode: sourceCode,
      priceType: "CLOSE",
      price,
      pricedAt,
      tickFrequency: "EOD",
    });
  }
  return ticks;
}

export class MarketDataScraperService {
  static async fetchMansaTicks(sourceCode: string): Promise<NormalisedTick[]> {
    const { stocks, currency, pricedAt } = await ingestTimed("mansa.fetch", () =>
      MansaMarketDataClient.fetchExchangeStocks(
        MansaMarketDataClient.resolveMansaExchange(sourceCode)!
      ),
      { sourceCode }
    );
    const sync = await ingestTimed("mansa.securitySync", () =>
      MansaSecuritySyncService.syncFromQuotes({
        exchangeCode: sourceCode,
        listingCurrencyCode: currency,
        stocks,
      }),
      { sourceCode, stockCount: stocks.length }
    );
    ingestLog("mansa.securitySync result", sync);
    const adapter = new MansaMarketDataAdapter(sourceCode);
    const ticks = adapter.normaliseMansaStocks(stocks, pricedAt, sourceCode);
    ingestLog("mansa.normalise", { sourceCode, tickCount: ticks.length });
    return ticks;
  }

  static async fetchVfexTicks(sourceCode: string): Promise<NormalisedTick[]> {
    const { quotes, listingCurrencyCode } = await VfexMarketDataClient.fetchBoard();
    await VfexSecuritySyncService.syncFromQuotes({
      exchangeCode: sourceCode,
      listingCurrencyCode,
      quotes,
    });
    return VfexMarketDataClient.toNormalisedTicks(quotes, sourceCode);
  }

  static async scrapeSource(sourceCode: string, manualTicks?: NormalisedTick[]) {
    return ingestTimed(
      "scrapeSource",
      async () => {
        const config = await prisma.listedEquityMarketDataSourceConfig.findUnique({
          where: { sourceCode },
        });
        if (!config?.isEnabled && !manualTicks?.length) {
          throw new Error(`Source ${sourceCode} is disabled`);
        }

        let ticks: NormalisedTick[] = manualTicks || [];
        let sourceStatus = "OK";
        let sourceType = manualTicks?.length ? "MANUAL" : "SCRAPER";

        if (!manualTicks?.length) {
          const mansaExchange = MansaMarketDataClient.resolveMansaExchange(sourceCode);
          if (mansaExchange) {
            try {
              ticks = await MarketDataScraperService.fetchMansaTicks(sourceCode);
              sourceType = "MANSA";
            } catch (e: any) {
              sourceStatus = "FALLBACK";
              ticks = await this.fallbackTicks(sourceCode);
              if (!ticks.length) throw new Error(`Mansa fetch failed for ${sourceCode}: ${e.message}`);
            }
          } else if (VfexMarketDataClient.supports(sourceCode)) {
            try {
              ticks = await MarketDataScraperService.fetchVfexTicks(sourceCode);
              sourceType = "SCRAPER";
            } catch (e: any) {
              sourceStatus = "FALLBACK";
              ticks = await this.fallbackTicks(sourceCode);
              if (!ticks.length) throw new Error(`VFEX scrape failed for ${sourceCode}: ${e.message}`);
            }
          } else if (sourceCode.toUpperCase() === "NASDAQ") {
            try {
              ticks = await NasdaqMarketDataService.fetchTicks();
              sourceType = "SCRAPER";
            } catch (e: any) {
              sourceStatus = "FALLBACK";
              ticks = await this.fallbackTicks(sourceCode);
              if (!ticks.length) throw new Error(`NASDAQ scrape failed: ${e.message}`);
            }
          } else if (sourceCode.toUpperCase() === "NYSE") {
            try {
              ticks = await NyseMarketDataService.fetchTicks();
              sourceType = "SCRAPER";
            } catch (e: any) {
              sourceStatus = "FALLBACK";
              ticks = await this.fallbackTicks(sourceCode);
              if (!ticks.length) throw new Error(`NYSE scrape failed: ${e.message}`);
            }
          } else if (config?.sourceUrl) {
            try {
              const body = await fetchWithBackoff(config.sourceUrl);
              ticks = parseCsvOrJson(body, sourceCode);
            } catch (e: any) {
              sourceStatus = "FALLBACK";
              ticks = await this.fallbackTicks(sourceCode);
              if (!ticks.length) throw new Error(`Scrape failed for ${sourceCode}: ${e.message}`);
            }
          }
        }

        ingestLog("ingestBatch.enqueue", { sourceCode, sourceType, tickCount: ticks.length, sourceStatus });
        return MarketDataIngestService.ingestBatch({
          sourceType,
          sourceCode,
          asOfDate: new Date(),
          ticks,
          sourceStatus,
        });
      },
      { sourceCode, manual: Boolean(manualTicks?.length) }
    );
  }

  static async fallbackTicks(sourceCode: string): Promise<NormalisedTick[]> {
    const securities = await prisma.listedEquitySecurity.findMany({
      where: { exchangeCode: sourceCode, isActive: true },
      take: 50,
    });
    const prevMap = await loadLatestApprovedPriceMap(securities.map((s) => s.id));
    const ticks: NormalisedTick[] = [];
    for (const sec of securities) {
      const closeKey = `${sec.id}:CLOSE`;
      const price = prevMap.get(closeKey) ?? prevMap.get(`${sec.id}:LAST`);
      if (price == null) continue;
      ticks.push({
        symbol: sec.symbol,
        exchangeCode: sec.exchangeCode,
        priceType: prevMap.has(closeKey) ? "CLOSE" : "LAST",
        price,
        pricedAt: new Date(),
        sourceStatus: "FALLBACK",
        tickFrequency: "EOD",
      });
    }
    return ticks;
  }

  static async scrapeAllDomestic() {
    const configs = await prisma.listedEquityMarketDataSourceConfig.findMany({
      where: { isEnabled: true },
    });
    const results = [];
    for (const cfg of configs) {
      try {
        const r = await this.scrapeSource(cfg.sourceCode);
        results.push({ sourceCode: cfg.sourceCode, ok: true, batchId: r.batch.id });
      } catch (e: any) {
        results.push({ sourceCode: cfg.sourceCode, ok: false, error: e.message });
      }
    }
    return results;
  }
}
