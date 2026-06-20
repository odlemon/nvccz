/** VFEX public price sheet API (embedded in https://www.vfex.exchange frontend). */
import type { NormalisedTick } from "./MarketDataIngestService";
import { marketDataFetch } from "./listedEquityExternalFetch";

export const VFEX_SITE_ORIGIN = "https://www.vfex.exchange";
export const VFEX_PRICE_API_BASE = "https://ds88jcmqc11je.cloudfront.net";

export type VfexPriceSheetRow = {
  name: string;
  symbol?: string;
  isin?: string;
  openPrice?: number;
  closePrice?: number;
  statsDate?: number[];
  modifiedDate?: number;
  turnover?: number;
};

export type VfexMarketCapRow = {
  companyName: string;
  symbol: string;
  closingPrice?: number;
  isin?: string;
};

export type VfexResolvedQuote = {
  symbol: string;
  name: string;
  isin?: string;
  openPrice?: number;
  closePrice: number;
  pricedAt: Date;
  volume?: number;
};

function normalizeVfexName(name: string): string {
  return name
    .toUpperCase()
    .replace(/\s+/g, " ")
    .replace(
      /\b(LIMITED|LTD|PLC|INC|CORP|CORPORATION|DEPOSITORY RECEIPTS|ZIMBABWE DEPOSITORY RECEIPTS|ZDRS|ZIMBABWE|FUND|TRUST)\b/g,
      ""
    )
    .replace(/\s+/g, " ")
    .trim();
}

function nameMatchScore(a: string, b: string): number {
  const na = normalizeVfexName(a);
  const nb = normalizeVfexName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 85;
  const ta = new Set(na.split(" ").filter(Boolean));
  const tb = new Set(nb.split(" ").filter(Boolean));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  if (!inter) return 0;
  return ((2 * inter) / (ta.size + tb.size)) * 75;
}

function fallbackSymbol(name: string): string {
  const words = normalizeVfexName(name).split(" ").filter(Boolean);
  const code = (words[0] || "UNK").slice(0, 6);
  return code.includes(".") ? code : `${code}.VX`;
}

function statsDateToPricedAt(statsDate?: number[], modifiedDate?: number): Date {
  if (Array.isArray(statsDate) && statsDate.length >= 3) {
    const [y, m, d] = statsDate;
    return new Date(Date.UTC(y, m - 1, d, 14, 0, 0));
  }
  if (modifiedDate && Number.isFinite(modifiedDate)) {
    const ms = modifiedDate > 1e12 ? modifiedDate : modifiedDate * 1000;
    return new Date(ms);
  }
  return new Date();
}

export class VfexMarketDataClient {
  static supports(sourceCode: string): boolean {
    return sourceCode.toUpperCase() === "VFEX";
  }

  static resolveTicker(priceRow: VfexPriceSheetRow, marketCapRows: VfexMarketCapRow[]): string {
    let best: { symbol: string; score: number } | null = null;
    for (const mc of marketCapRows) {
      const score = nameMatchScore(priceRow.name, mc.companyName);
      if (!best || score > best.score) best = { symbol: mc.symbol, score };
    }
    if (best && best.score >= 45) return best.symbol.toUpperCase();
    return fallbackSymbol(priceRow.name);
  }

  static async fetchBoard(): Promise<{
    quotes: VfexResolvedQuote[];
    listingCurrencyCode: string;
  }> {
    const headers = {
      Accept: "application/json",
      Origin: VFEX_SITE_ORIGIN,
      Referer: `${VFEX_SITE_ORIGIN}/`,
    };
    const [priceRes, capRes] = await Promise.all([
      marketDataFetch(`${VFEX_PRICE_API_BASE}/api/fetch/price-sheet?exchange=VFEX`, {
        headers,
        signal: AbortSignal.timeout(30_000),
      }),
      marketDataFetch(`${VFEX_PRICE_API_BASE}/api/fetch/market-capitalisation?exchange=VFEX`, {
        headers,
        signal: AbortSignal.timeout(30_000),
      }),
    ]);
    const priceJson = (await priceRes.json()) as { data?: VfexPriceSheetRow[]; message?: string };
    const capJson = (await capRes.json()) as { data?: VfexMarketCapRow[]; message?: string };
    if (!priceRes.ok || !Array.isArray(priceJson.data)) {
      throw new Error(priceJson.message || `VFEX price-sheet HTTP ${priceRes.status}`);
    }
    const marketCapRows = Array.isArray(capJson.data) ? capJson.data : [];

    const quotes: VfexResolvedQuote[] = [];
    for (const row of priceJson.data) {
      const closePrice = Number(row.closePrice);
      if (!row.name || !Number.isFinite(closePrice)) continue;
      const symbol = this.resolveTicker(row, marketCapRows);
      const pricedAt = statsDateToPricedAt(row.statsDate, row.modifiedDate);
      quotes.push({
        symbol,
        name: row.name,
        isin: row.isin,
        openPrice: Number.isFinite(Number(row.openPrice)) ? Number(row.openPrice) : undefined,
        closePrice,
        pricedAt,
        volume: Number.isFinite(Number(row.turnover)) ? Number(row.turnover) : undefined,
      });
    }
    if (!quotes.length) throw new Error("VFEX price sheet returned no usable rows");
    return { quotes, listingCurrencyCode: "USD" };
  }

  static toNormalisedTicks(quotes: VfexResolvedQuote[], exchangeCode: string): NormalisedTick[] {
    const ticks: NormalisedTick[] = [];
    for (const q of quotes) {
      if (q.openPrice != null && Number.isFinite(q.openPrice)) {
        ticks.push({
          symbol: q.symbol,
          exchangeCode,
          priceType: "OPEN",
          price: q.openPrice,
          pricedAt: q.pricedAt,
          tickFrequency: "EOD",
        });
      }
      ticks.push({
        symbol: q.symbol,
        exchangeCode,
        priceType: "CLOSE",
        price: q.closePrice,
        pricedAt: q.pricedAt,
        tickFrequency: "EOD",
      });
    }
    return ticks;
  }
}
