/**
 * Idempotent DDL for NTS SRD Phase 1 P0 product gaps.
 * Run: npx ts-node scripts/run-nts-p0-migration.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`[ok]   ${table}.${column}`);
}

async function main() {
  console.log("=== NTS P0 procurement migration ===\n");

  // §16 sealed bid opening stamp
  await addColumn("procurement_rfqs", "bid_opened_at", "`bid_opened_at` DATETIME(3) NULL");
  await addColumn("procurement_rfqs", "bid_opened_by_id", "`bid_opened_by_id` VARCHAR(191) NULL");
  await addColumn(
    "procurement_rfqs",
    "bid_opening_attendees_json",
    "`bid_opening_attendees_json` JSON NULL"
  );
  await addColumn(
    "procurement_rfqs",
    "sealed_bidding",
    "`sealed_bidding` BOOLEAN NOT NULL DEFAULT false"
  );

  // §20 award recommendation package
  await addColumn(
    "procurement_rfqs",
    "recommendation_status",
    "`recommendation_status` VARCHAR(32) NULL"
  );
  await addColumn(
    "procurement_rfqs",
    "award_recommendation_json",
    "`award_recommendation_json` JSON NULL"
  );

  // §25 finance handoff
  await addColumn(
    "procurement_invoices",
    "finance_handoff_status",
    "`finance_handoff_status` VARCHAR(32) NULL DEFAULT 'READY_FOR_FINANCE'"
  );

  // §12 multi-dimension stage match rules
  await addColumn(
    "procurement_approval_stages",
    "match_rules",
    "`match_rules` JSON NULL"
  );

  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
