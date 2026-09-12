/**
 * Probe NASDAQ (FastBull+Yahoo), NYSE (Yahoo), Zimrate.com FX.
 * Run: npm run probe:intl-markets
 */
import "dotenv/config";
import { FastBullMarketDataClient } from "../src/services/listedEquity/FastBullMarketDataClient";
import { NasdaqMarketDataService, NyseMarketDataService } from "../src/services/listedEquity/InternationalMarketDataService";
import { MarketDataScraperService } from "../src/services/listedEquity/MarketDataScraperService";
import { fetchZimrateRatesFromWebsite, parseOfficialAndStreetFromHtml } from "../src/services/ZimrateRateService";
import { prisma } from "../src/utils/database";

async function main() {
  console.log("=== Zimrate.com USD/ZWG ===");
  const fx = await fetchZimrateRatesFromWebsite();
  console.log("rates count", fx.data.rates.length, "updated", fx.meta.last_updated);
  for (const r of fx.data.rates) {
    console.log(`  ${r.rate_type || "UNKNOWN"} avg=${r.avg}`);
  }
  const { data: html } = await import("axios").then((m) =>
    m.default.get<string>("https://zimrate.com/", { responseType: "text", timeout: 15000 })
  );
  const parsed = parseOfficialAndStreetFromHtml(typeof html === "string" ? html : String(html));
  console.log("parsed official", parsed.official, "street", parsed.street);

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
