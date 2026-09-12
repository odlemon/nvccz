/**
 * Verify listed-equity market terminal tables exist.
 * Run: npm run verify:listed-equity-market-terminal
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TABLES = [
  "listed_equity_securities",
  "listed_equity_security_vendor_symbols",
  "listed_equity_market_data_source_configs",
  "listed_equity_market_data_ingest_batches",
  "listed_equity_price_ticks",
  "listed_equity_watchlist_entries",
  "listed_equity_stakeholder_profiles",
  "listed_equity_fund_configs",
  "listed_equity_fund_signing_keys",
  "listed_equity_holdings",
  "listed_equity_holding_lots",
  "listed_equity_valuation_snapshots",
  "listed_equity_trades",
  "listed_equity_trade_routing_hops",
  "listed_equity_trade_settlements",
  "listed_equity_cash_holds",
];

async function main() {
  let ok = true;
  for (const table of TABLES) {
    const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
      table
    );
    const exists = Number(rows[0]?.c ?? 0) > 0;
    console.log(`[${exists ? "ok" : "MISSING"}] ${table}`);
    if (!exists) ok = false;
  }
  if (!ok) process.exit(1);
  console.log("Listed equity schema verification passed.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
