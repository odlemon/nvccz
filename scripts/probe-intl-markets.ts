/**
 * Probe NASDAQ (FastBull+Yahoo), NYSE (Yahoo), Zimrate.com FX.
 * Run: npm run probe:intl-markets
 */
import "dotenv/config";
import { FastBullMarketDataClient } from "../src/services/listedEquity/FastBullMarketDataClient";
import { NasdaqMarketDataService, NyseMarketDataService } from "../src/services/listedEquity/InternationalMarketDataService";
import { MarketDataScraperService } from "../src/services/listedEquity/MarketDataScraperService";
import { fetchZimrateRatesFromWebsite } from "../src/services/ZimrateRateService";
import { prisma } from "../src/utils/database";

async function main() {
  console.log("=== Zimrate.com USD/ZWG ===");
  const fx = await fetchZimrateRatesFromWebsite();
  console.log("USD/ZWG avg", fx.data.rates[0]?.avg, "updated", fx.meta.last_updated);

  console.log("\n=== FastBull IXIC ===");
  const ixic = await FastBullMarketDataClient.fetchNasdaqComposite();
  console.log(ixic);

  console.log("\n=== NASDAQ scrapeSource ===");
  const nasdaq = await MarketDataScraperService.scrapeSource("NASDAQ");
  const nasdaqTicks = await prisma.listedEquityPriceTick.count({ where: { batchId: nasdaq.batch.id } });
  console.log(`batch ${nasdaq.batch.id} records=${nasdaq.batch.recordCount} persisted=${nasdaqTicks}`);

  console.log("\n=== NYSE scrapeSource ===");
  const nyse = await MarketDataScraperService.scrapeSource("NYSE");
  const nyseTicks = await prisma.listedEquityPriceTick.count({ where: { batchId: nyse.batch.id } });
  console.log(`batch ${nyse.batch.id} records=${nyse.batch.recordCount} persisted=${nyseTicks}`);

  const nasdaqSecs = await prisma.listedEquitySecurity.count({ where: { exchangeCode: "NASDAQ" } });
  const nyseSecs = await prisma.listedEquitySecurity.count({ where: { exchangeCode: "NYSE" } });
  console.log(`\nSecurities NASDAQ=${nasdaqSecs} NYSE=${nyseSecs}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
