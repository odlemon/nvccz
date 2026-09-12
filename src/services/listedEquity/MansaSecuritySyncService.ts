// @ts-nocheck
import { prisma } from "../../utils/database";
import type { MansaStockQuote } from "./MansaMarketDataClient";
import { bulkSyncListedSecurities } from "./listedEquityBulkPersist";

/** Upsert listed-equity securities from Mansa board quotes before price ingest. */
export class MansaSecuritySyncService {
  static async syncFromQuotes(params: {
    exchangeCode: string;
    listingCurrencyCode: string;
    stocks: MansaStockQuote[];
  }) {
    return bulkSyncListedSecurities({
      exchangeCode: params.exchangeCode,
      listingCurrencyCode: params.listingCurrencyCode,
      providerCode: "MANSA",
      rows: params.stocks.map((row) => ({
        symbol: String(row.ticker || "").toUpperCase(),
        name: String(row.name || row.ticker || ""),
      })),
    });
  }
}
