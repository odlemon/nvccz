// @ts-nocheck
import { prisma } from "../../utils/database";
import { bulkSyncListedSecurities } from "./listedEquityBulkPersist";

const DEFAULT_NASDAQ_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "META", "AMZN", "GOOGL", "AMD"];
const DEFAULT_NYSE_SYMBOLS = ["JPM", "BAC", "XOM", "WMT", "JNJ", "PG", "V", "DIS"];

export class InternationalEquitySyncService {
  static defaultSymbols(exchangeCode: string): string[] {
    const envKey = exchangeCode === "NASDAQ" ? "NASDAQ_WATCHLIST_SYMBOLS" : "NYSE_WATCHLIST_SYMBOLS";
    const raw = process.env[envKey];
    if (raw?.trim()) {
      return raw.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    }
    return exchangeCode === "NASDAQ" ? DEFAULT_NASDAQ_SYMBOLS : DEFAULT_NYSE_SYMBOLS;
  }

  static async listSymbolsToFetch(exchangeCode: string): Promise<string[]> {
    const fromDb = await prisma.listedEquitySecurity.findMany({
      where: { exchangeCode, isActive: true },
      select: { symbol: true },
    });
    const symbols = new Set<string>(this.defaultSymbols(exchangeCode));
    for (const row of fromDb) symbols.add(row.symbol.toUpperCase());
    if (exchangeCode === "NASDAQ") symbols.add("IXIC");
    if (exchangeCode === "NYSE") symbols.add("NYA");
    return [...symbols];
  }

  static async syncQuotes(params: {
    exchangeCode: string;
    listingCurrencyCode: string;
    providerCode: string;
    rows: Array<{ symbol: string; name: string; providerCode?: string }>;
  }) {
    return bulkSyncListedSecurities({
      exchangeCode: params.exchangeCode,
      listingCurrencyCode: params.listingCurrencyCode,
      providerCode: params.providerCode,
      rows: params.rows.map((r) => ({
        symbol: r.symbol,
        name: r.name,
        providerCode: r.providerCode ?? params.providerCode,
      })),
    });
  }

  static async syncQuote(params: {
    exchangeCode: string;
    listingCurrencyCode: string;
    symbol: string;
    name: string;
    providerCode: string;
  }) {
    await this.syncQuotes({
      exchangeCode: params.exchangeCode,
      listingCurrencyCode: params.listingCurrencyCode,
      providerCode: params.providerCode,
      rows: [{ symbol: params.symbol, name: params.name }],
    });
  }
}
