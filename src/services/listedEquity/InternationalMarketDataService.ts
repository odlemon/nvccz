// @ts-nocheck

import type { NormalisedTick } from "./MarketDataIngestService";

import { FastBullMarketDataClient } from "./FastBullMarketDataClient";

import { YahooFinanceChartClient } from "./YahooFinanceChartClient";

import { InternationalEquitySyncService } from "./InternationalEquitySyncService";



export class NasdaqMarketDataService {

  static async fetchTicks(): Promise<NormalisedTick[]> {

    const ticks: NormalisedTick[] = [];

    const syncRows: Array<{ symbol: string; name: string; providerCode: string }> = [];



    const ixic = await FastBullMarketDataClient.fetchNasdaqComposite();

    if (ixic) {

      syncRows.push({ symbol: "IXIC", name: ixic.name, providerCode: "FASTBULL" });

      ticks.push(...FastBullMarketDataClient.toNormalisedTicks([ixic], "NASDAQ"));

    }



    const symbols = (await InternationalEquitySyncService.listSymbolsToFetch("NASDAQ")).filter(

      (s) => s !== "IXIC"

    );

    const yahooSymbols = symbols.map((s) => (s === "IXIC" ? "^IXIC" : s));

    const quotes = await YahooFinanceChartClient.fetchMany(yahooSymbols);

    for (const q of quotes) {

      syncRows.push({

        symbol: q.symbol,

        name: q.name || q.symbol,

        providerCode: "YAHOO",

      });

    }

    ticks.push(...YahooFinanceChartClient.toNormalisedTicks(quotes, "NASDAQ"));



    if (syncRows.length) {

      await InternationalEquitySyncService.syncQuotes({

        exchangeCode: "NASDAQ",

        listingCurrencyCode: "USD",

        providerCode: "YAHOO",

        rows: syncRows,

      });

    }

    if (!ticks.length) throw new Error("No NASDAQ quotes fetched");

    return ticks;

  }

}



export class NyseMarketDataService {

  static async fetchTicks(): Promise<NormalisedTick[]> {

    const ticks: NormalisedTick[] = [];

    const syncRows: Array<{ symbol: string; name: string; providerCode: string }> = [];



    const nya = await YahooFinanceChartClient.fetchChart("^NYA");

    if (nya) {

      syncRows.push({

        symbol: "NYA",

        name: nya.name || "NYSE Composite Index",

        providerCode: "YAHOO",

      });

      ticks.push(

        ...YahooFinanceChartClient.toNormalisedTicks(

          [{ ...nya, symbol: "NYA", exchangeCode: "NYSE" }],

          "NYSE"

        )

      );

    }



    const symbols = (await InternationalEquitySyncService.listSymbolsToFetch("NYSE")).filter(

      (s) => s !== "NYA"

    );

    const quotes = await YahooFinanceChartClient.fetchMany(symbols);

    for (const q of quotes) {

      syncRows.push({

        symbol: q.symbol,

        name: q.name || q.symbol,

        providerCode: "YAHOO",

      });

    }

    ticks.push(...YahooFinanceChartClient.toNormalisedTicks(quotes, "NYSE"));



    if (syncRows.length) {

      await InternationalEquitySyncService.syncQuotes({

        exchangeCode: "NYSE",

        listingCurrencyCode: "USD",

        providerCode: "YAHOO",

        rows: syncRows,

      });

    }

    if (!ticks.length) throw new Error("No NYSE quotes fetched");

    return ticks;

  }

}

