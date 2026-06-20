/** FastBull homepage quote scrape — https://www.fastbull.com */
import type { NormalisedTick } from "./MarketDataIngestService";
import { marketDataFetch } from "./listedEquityExternalFetch";

export const FASTBULL_HOME_URL = "https://www.fastbull.com/?platform=4";

export type FastBullQuote = {
  symbol: string;
  name: string;
  open?: number;
  close: number;
  high?: number;
  low?: number;
  bid?: number;
  ask?: number;
  volume?: number;
  pricedAt: Date;
};

type FastBullRow = {
  symbol: string;
  stockName?: string;
  openPrice?: number | null;
  close?: number;
  high?: number;
  low?: number;
  bidPrice?: number;
  askPrice?: number;
  vol?: number;
  time?: number;
};

export class FastBullMarketDataClient {
  static parseMyStocks(html: string): FastBullRow[] {
    const m = html.match(/var myStocks = (\[[\s\S]*?\]);/);
    if (!m) throw new Error("FastBull myStocks payload not found");
    return JSON.parse(m[1]) as FastBullRow[];
  }

  static async fetchHomeQuotes(): Promise<FastBullQuote[]> {
    const res = await marketDataFetch(FASTBULL_HOME_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; ArcusListedEquity/1.0)" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`FastBull HTTP ${res.status}`);
    const html = await res.text();
    const rows = this.parseMyStocks(html);
    const quotes: FastBullQuote[] = [];
    for (const row of rows) {
      const close = Number(row.close ?? row.bidPrice ?? row.askPrice);
      if (!row.symbol || !Number.isFinite(close)) continue;
      const pricedAt = row.time ? new Date(row.time * 1000) : new Date();
      quotes.push({
        symbol: String(row.symbol).toUpperCase(),
        name: String(row.stockName || row.symbol),
        open: Number.isFinite(Number(row.openPrice)) ? Number(row.openPrice) : undefined,
        close,
        high: Number.isFinite(Number(row.high)) ? Number(row.high) : undefined,
        low: Number.isFinite(Number(row.low)) ? Number(row.low) : undefined,
        bid: Number.isFinite(Number(row.bidPrice)) ? Number(row.bidPrice) : undefined,
        ask: Number.isFinite(Number(row.askPrice)) ? Number(row.askPrice) : undefined,
        volume: Number.isFinite(Number(row.vol)) ? Number(row.vol) : undefined,
        pricedAt,
      });
    }
    return quotes;
  }

  /** NASDAQ composite (IXIC) from FastBull board. */
  static async fetchNasdaqComposite(): Promise<FastBullQuote | null> {
    const quotes = await this.fetchHomeQuotes();
    return quotes.find((q) => q.symbol === "IXIC") || null;
  }

  static toNormalisedTicks(quotes: FastBullQuote[], exchangeCode: string): NormalisedTick[] {
    const ticks: NormalisedTick[] = [];
    for (const q of quotes) {
      const open = q.open ?? q.bid;
      if (open != null && Number.isFinite(open)) {
        ticks.push({
          symbol: q.symbol,
          exchangeCode,
          priceType: "OPEN",
          price: open,
          pricedAt: q.pricedAt,
          tickFrequency: "DELAYED_15M",
        });
      }
      ticks.push({
        symbol: q.symbol,
        exchangeCode,
        priceType: "CLOSE",
        price: q.close,
        pricedAt: q.pricedAt,
        tickFrequency: "DELAYED_15M",
      });
    }
    return ticks;
  }
}
