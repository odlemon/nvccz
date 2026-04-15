/**
 * Adds vendors.bp_number (Business Partner / BP registration id). Idempotent.
 *
 * Run: npm run db:migrate:vendor-bp-number
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

async function main() {
  const table = "vendors";
  const column = "bp_number";

  if (!(await columnExists(table, column))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` VARCHAR(191) NULL
       COMMENT 'Business Partner (BP) number — deduped vs other active vendors'`
    );
    console.log("[ok] added vendors.bp_number");
  } else {
    console.log("[skip] vendors.bp_number exists");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
