/**
 * Wipe listed-equity securities, prices, ingest batches, and related UAT rows.
 * Keeps source configs and fund/stakeholder setup.
 *
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/reset-listed-equity-market-data.ts
 */
import "dotenv/config";
import { prisma } from "../src/utils/database";

async function main() {
  const before = {
    securities: await prisma.listedEquitySecurity.count(),
    ticks: await prisma.listedEquityPriceTick.count(),
    batches: await prisma.listedEquityMarketDataIngestBatch.count(),
  };
  console.log("Before:", before);

  await prisma.$transaction([
    prisma.listedEquityCashHold.deleteMany(),
    prisma.listedEquityTradeSettlement.deleteMany(),
    prisma.listedEquityTradeRoutingHop.deleteMany(),
    prisma.listedEquityTrade.deleteMany(),
    prisma.listedEquityHoldingLot.deleteMany(),
    prisma.listedEquityHolding.deleteMany(),
    prisma.listedEquityValuationSnapshot.deleteMany(),
    prisma.listedEquityWatchlistEntry.deleteMany(),
    prisma.listedEquityPriceTick.deleteMany(),
    prisma.listedEquityMarketDataIngestBatch.deleteMany(),
    prisma.listedEquitySecurityVendorSymbol.deleteMany(),
    prisma.listedEquitySecurity.deleteMany(),
  ]);

  const after = {
    securities: await prisma.listedEquitySecurity.count(),
    ticks: await prisma.listedEquityPriceTick.count(),
    batches: await prisma.listedEquityMarketDataIngestBatch.count(),
    sourceConfigs: await prisma.listedEquityMarketDataSourceConfig.count(),
  };
  console.log("After:", after);
  console.log("Listed-equity market data reset complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
