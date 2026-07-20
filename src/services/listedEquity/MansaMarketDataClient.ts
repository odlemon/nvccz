/** Mansa Markets API client — https://mansaapi.com/docs */
import { marketDataFetch } from "./listedEquityExternalFetch";

export const MANSA_API_BASE_URL =
  process.env.MANSA_API_BASE_URL?.trim() || "https://mansaapi.com";

/** Arcus source_code → Mansa exchange code */
export const MANSA_EXCHANGE_BY_SOURCE: Record<string, string> = {
  ZSE: "ZIMBABWE",
};

export type MansaStockQuote = {
  ticker: string;
  name: string;
  price: number;
  change?: number;
  change_pct?: number;
  volume?: number;
  scraped_at?: string;
};

type MansaStocksResponse = {
  success: boolean;
  data?: MansaStockQuote[];
  meta?: { exchange?: string; currency?: string; updated_at?: string };
  error?: { message?: string };
};

function requireMansaApiKey(): string {
  const key = process.env.MANSA_API_KEY?.trim();
  if (!key) {
    throw new Error("MANSA_API_KEY is not configured");
  }
  return key;
}

async function mansaFetch<T>(path: string): Promise<T> {
  const res = await marketDataFetch(`${MANSA_API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${requireMansaApiKey()}` },
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
  if (!res.ok) {
    throw new Error(body?.error?.message || `Mansa API HTTP ${res.status}`);
  }
  return body;
}

export class MansaMarketDataClient {
  static resolveMansaExchange(sourceCode: string): string | null {
    return MANSA_EXCHANGE_BY_SOURCE[sourceCode.toUpperCase()] || null;
  }

  static async fetchExchangeStocks(mansaExchangeCode: string): Promise<{
    stocks: MansaStockQuote[];
    currency: string;
    pricedAt: Date;
  }> {
    const json = await mansaFetch<MansaStocksResponse>(
      `/api/v1/markets/exchanges/${encodeURIComponent(mansaExchangeCode)}/stocks`
    );
    if (!json.success || !Array.isArray(json.data)) {
      throw new Error(json.error?.message || "Mansa stocks response invalid");
    }
    const pricedAt = json.meta?.updated_at ? new Date(json.meta.updated_at) : new Date();
    return {
      stocks: json.data,
      currency: json.meta?.currency || "ZWG",
      pricedAt,
    };
  }
}

/** @deprecated use MANSA_API_KEY env — kept only so accidental imports fail closed */
export const MANSA_API_KEY = "";
