/**
 * Adds rejection_reason + rejection_content_fingerprint to procurement entities (no prisma migrate).
 * Idempotent: skips columns that already exist.
 *
 * Usage: npm run db:migrate:procurement-rejection-metadata
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

async function addColumnIfMissing(
  table: string,
  column: string,
  definition: string,
  comment?: string
) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  const sql = comment
    ? `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition} COMMENT '${comment.replace(/'/g, "''")}'`
    : `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`;
  await prisma.$executeRawUnsafe(sql);
  console.log(`[ok] ${table}.${column}`);
}

async function main() {
  const reasonDef = "TEXT NULL";
  const fpDef = "VARCHAR(64) NULL";

  await addColumnIfMissing(
    "purchase_orders",
    "rejection_reason",
    reasonDef,
    "Approver rejection comment (approval workflow)"
  );
  await addColumnIfMissing(
    "purchase_orders",
    "rejection_content_fingerprint",
    fpDef,
    "SHA-256 hex snapshot at rejection"
  );

  await addColumnIfMissing(
    "procurement_invoices",
    "rejection_reason",
    reasonDef,
    "Approver rejection comment (approval workflow)"
  );
  await addColumnIfMissing(
    "procurement_invoices",
    "rejection_content_fingerprint",
    fpDef,
    "SHA-256 hex snapshot at rejection"
  );

  await addColumnIfMissing(
    "goods_received_notes",
    "rejection_reason",
    reasonDef,
    "Approver rejection comment (approval workflow)"
  );
  await addColumnIfMissing(
    "goods_received_notes",
    "rejection_content_fingerprint",
    fpDef,
    "SHA-256 hex snapshot at rejection"
  );

  await addColumnIfMissing(
    "procurement_rfqs",
    "rejection_reason",
    reasonDef,
    "Cancellation / rejection reason when applicable"
  );
  await addColumnIfMissing(
    "procurement_rfqs",
    "rejection_content_fingerprint",
    fpDef,
    "SHA-256 hex snapshot when RFQ closed with reason"
  );

  await addColumnIfMissing(
    "vendor_quotations",
    "rejection_content_fingerprint",
    fpDef,
    "SHA-256 hex snapshot at desk rejection (vendor quotation)"
  );

  console.log("Procurement rejection metadata migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
