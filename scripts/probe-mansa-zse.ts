/**
 * Probe Mansa ZSE feed + optional Arcus ingest.
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/probe-mansa-zse.ts
 */
import "dotenv/config";
import { MansaMarketDataClient } from "../src/services/listedEquity/MansaMarketDataClient";
import { MarketDataScraperService } from "../src/services/listedEquity/MarketDataScraperService";
import { prisma } from "../src/utils/database";

async function main() {
  console.log("=== Mansa API probe (ZSE) ===");
  const { stocks, currency, pricedAt } = await MansaMarketDataClient.fetchExchangeStocks("ZIMBABWE");
  console.log(`Fetched ${stocks.length} stocks, currency=${currency}, pricedAt=${pricedAt.toISOString()}`);
  console.log("Sample:", stocks.slice(0, 3));

  console.log("\n=== Arcus scrapeSource(ZSE) ===");
  const result = await MarketDataScraperService.scrapeSource("ZSE");
  const tickCount = await prisma.listedEquityPriceTick.count({
    where: { batchId: result.batch.id },
  });
  const zseSecurities = await prisma.listedEquitySecurity.count({ where: { exchangeCode: "ZSE" } });
  console.log(`Batch ${result.batch.id}: sourceType implied MANSA, recordCount=${result.batch.recordCount}, ticks persisted=${tickCount}`);
  console.log(`ZSE securities in DB: ${zseSecurities}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
