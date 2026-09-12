/**
 * Probe VFEX price sheet scrape + Arcus ingest.
 * Run: npm run probe:vfex
 */
import "dotenv/config";
import { VfexMarketDataClient } from "../src/services/listedEquity/VfexMarketDataClient";
import { MarketDataScraperService } from "../src/services/listedEquity/MarketDataScraperService";
import { prisma } from "../src/utils/database";

async function main() {
  console.log("=== VFEX board fetch ===");
  const { quotes, listingCurrencyCode } = await VfexMarketDataClient.fetchBoard();
  console.log(`Quotes: ${quotes.length}, currency=${listingCurrencyCode}`);
  console.log("Sample:", quotes.slice(0, 3));

  console.log("\n=== Arcus scrapeSource(VFEX) ===");
  const result = await MarketDataScraperService.scrapeSource("VFEX");
  const tickCount = await prisma.listedEquityPriceTick.count({
    where: { batchId: result.batch.id },
  });
  const vfexSecurities = await prisma.listedEquitySecurity.count({ where: { exchangeCode: "VFEX" } });
  console.log(`Batch ${result.batch.id}: recordCount=${result.batch.recordCount}, ticks persisted=${tickCount}`);
  console.log(`VFEX securities in DB: ${vfexSecurities}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
