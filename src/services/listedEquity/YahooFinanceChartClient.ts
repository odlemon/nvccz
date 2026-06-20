/** Yahoo Finance chart API (unofficial) — used for NYSE/NASDAQ equity quotes. */
import type { NormalisedTick } from "./MarketDataIngestService";
import { marketDataFetch } from "./listedEquityExternalFetch";

export type YahooChartQuote = {
  symbol: string;
  name?: string;
  exchangeCode: string;
  open?: number;
  close: number;
  high?: number;
  low?: number;
  volume?: number;
  pricedAt: Date;
  currency: string;
};

const USER_AGENT = "Mozilla/5.0 (compatible; ArcusListedEquity/1.0)";

export class YahooFinanceChartClient {
  static async fetchChart(symbol: string): Promise<YahooChartQuote | null> {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`;
    const res = await marketDataFetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Yahoo chart HTTP ${res.status} for ${symbol}`);
    const json = (await res.json()) as any;
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta || {};
    const quote = result.indicators?.quote?.[0] || {};
    const ts: number[] = result.timestamp || [];
    const lastIdx = ts.length ? ts.length - 1 : -1;
    const close = Number(meta.regularMarketPrice ?? quote.close?.[lastIdx]);
    if (!Number.isFinite(close)) return null;
    const open = Number(quote.open?.[lastIdx] ?? meta.regularMarketOpen);
    const high = Number(quote.high?.[lastIdx]);
    const low = Number(quote.low?.[lastIdx]);
    const volume = Number(quote.volume?.[lastIdx]);
    const pricedAt = meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000)
      : ts[lastIdx]
        ? new Date(ts[lastIdx] * 1000)
        : new Date();
    const arcusSymbol = String(meta.symbol || symbol).toUpperCase().replace(/^\^/, "");
    return {
      symbol: arcusSymbol,
      name: meta.longName || meta.shortName || arcusSymbol,
      exchangeCode: this.mapExchange(meta.exchangeName, meta.instrumentType),
      open: Number.isFinite(open) ? open : undefined,
      close,
      high: Number.isFinite(high) ? high : undefined,
      low: Number.isFinite(low) ? low : undefined,
      volume: Number.isFinite(volume) ? volume : undefined,
      pricedAt,
      currency: String(meta.currency || "USD").toUpperCase(),
    };
  }

  static mapExchange(exchangeName?: string, instrumentType?: string): string {
    const ex = String(exchangeName || "").toUpperCase();
    if (ex === "NMS" || ex === "NGM" || ex === "NCM" || ex === "NIM" || ex.includes("NASDAQ")) return "NASDAQ";
    if (ex === "NYQ" || ex === "NYS" || ex.includes("NYSE")) return "NYSE";
    if (instrumentType === "INDEX") return ex.includes("NASDAQ") ? "NASDAQ" : "NYSE";
    return "NYSE";
  }

  static async fetchMany(symbols: string[]): Promise<YahooChartQuote[]> {
    const out: YahooChartQuote[] = [];
    for (const symbol of symbols) {
      try {
        const q = await this.fetchChart(symbol);
        if (q) out.push(q);
      } catch (e: any) {
        console.warn(`[YahooFinanceChartClient] skip ${symbol}: ${e.message}`);
      }
    }
    return out;
  }

  static toNormalisedTicks(quotes: YahooChartQuote[], exchangeCode: string): NormalisedTick[] {
    const ticks: NormalisedTick[] = [];
    for (const q of quotes) {
      const ex = exchangeCode || q.exchangeCode;
      if (q.open != null && Number.isFinite(q.open)) {
        ticks.push({
          symbol: q.symbol,
          exchangeCode: ex,
          priceType: "OPEN",
          price: q.open,
          pricedAt: q.pricedAt,
          tickFrequency: "DELAYED_15M",
        });
      }
      ticks.push({
        symbol: q.symbol,
        exchangeCode: ex,
        priceType: "CLOSE",
        price: q.close,
        pricedAt: q.pricedAt,
        tickFrequency: "DELAYED_15M",
      });
    }
    return ticks;
  }
}
