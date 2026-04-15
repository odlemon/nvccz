// @ts-nocheck
/**
 * Idempotent DDL for Suite 01 supplement:
 * - purchase_requisitions.sourcing_category
 * - vendor_kyc_documents encryption metadata columns
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
  console.log("=== Procurement Suite 01 supplement migration ===\n");

  await addColumn(
    "purchase_requisitions",
    "sourcing_category",
    "`sourcing_category` VARCHAR(100) NULL COMMENT 'Matches vendor.category for RFQ filtering'"
  );

  await addColumn(
    "vendor_kyc_documents",
    "is_encrypted",
    "`is_encrypted` TINYINT(1) NOT NULL DEFAULT 1"
  );
  await addColumn(
    "vendor_kyc_documents",
    "encryption_iv",
    "`encryption_iv` TEXT NULL"
  );
  await addColumn(
    "vendor_kyc_documents",
    "encryption_auth_tag",
    "`encryption_auth_tag` VARCHAR(64) NULL"
  );

  console.log("\n=== done ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
