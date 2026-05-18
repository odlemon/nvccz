/**
 * Adds purchase_requisitions.rejection_content_fingerprint (SHA-256 hex) for resubmit-after-reject rules.
 * Idempotent: skips if column exists.
 *
 * Usage: npm run db:migrate:purchase-requisition-rejection-fingerprint
 */
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
  const table = "purchase_requisitions";
  const column = "rejection_content_fingerprint";
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column} already exists`);
  } else {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` VARCHAR(64) NULL COMMENT 'SHA-256 hex of header+items at rejection; resubmit blocked until content differs'`
    );
    console.log(`[ok] ${table}.${column}`);
  }
  console.log("Purchase requisition rejection fingerprint migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
