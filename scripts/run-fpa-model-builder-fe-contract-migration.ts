/**
 * FP&A Model Builder FE contract — dimension_keys, LI description, version publish fields.
 * Idempotent. Run: npm run db:migrate:fpa-model-builder-fe-contract
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function addColumnIfMissing(table: string, column: string, definition: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`[ok] ${table}.${column}`);
}

async function main() {
  console.log("FPA model-builder FE contract migration…");

  await addColumnIfMissing("planning_modules", "dimension_keys", "JSON NULL");
  await addColumnIfMissing("planning_line_items", "description", "TEXT NULL");
  await addColumnIfMissing("planning_line_items", "dimension_keys", "JSON NULL");
  await addColumnIfMissing("planning_versions", "published_at", "DATETIME(3) NULL");
  await addColumnIfMissing("planning_versions", "published_by", "VARCHAR(191) NULL");
  await addColumnIfMissing("planning_versions", "checksum", "VARCHAR(128) NULL");
  await addColumnIfMissing("planning_versions", "publish_notes", "TEXT NULL");

  // Default dimension keys for modules that have none
  const defaultKeys = JSON.stringify(["Time", "Product", "Region", "Version", "Scenario"]);
  const updated = await prisma.$executeRawUnsafe(
    `UPDATE planning_modules SET dimension_keys = CAST(? AS JSON) WHERE dimension_keys IS NULL`,
    defaultKeys
  );
  console.log(`[ok] backfill module dimension_keys rows≈${updated}`);

  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
