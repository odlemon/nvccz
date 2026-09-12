// @ts-nocheck
import { prisma } from "../../utils/database";
import type { VfexResolvedQuote } from "./VfexMarketDataClient";
import { bulkSyncListedSecurities } from "./listedEquityBulkPersist";

/** Upsert VFEX securities from scraped board quotes before price ingest. */
export class VfexSecuritySyncService {
  static async syncFromQuotes(params: {
    exchangeCode: string;
    listingCurrencyCode: string;
    quotes: VfexResolvedQuote[];
  }) {
    return bulkSyncListedSecurities({
      exchangeCode: params.exchangeCode,
      listingCurrencyCode: params.listingCurrencyCode,
      providerCode: "VFEX",
      rows: params.quotes.map((row) => ({
        symbol: String(row.symbol || "").toUpperCase(),
        name: String(row.name || row.symbol || ""),
        isin: row.isin || null,
      })),
    });
  }
}
