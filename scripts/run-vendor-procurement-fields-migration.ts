// @ts-nocheck
/**
 * Idempotent migration: vendor procurement fields + VendorBank + VendorKycDocument tables
 *
 * Adds to vendors table:
 *   category, is_blacklisted, blacklist_reason, vendor_rating, vendor_rating_updated_at,
 *   settlement_currency_id, registration_status, self_registered, self_registration_token
 *
 * Creates tables:
 *   vendor_banks
 *   vendor_kyc_documents
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = ?
       AND COLUMN_NAME  = ?`,
    table,
    column
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = ?`,
    table
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column} already exists`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`[ok]   added ${table}.${column}`);
}

async function main() {
  console.log("=== Vendor Procurement Fields Migration ===\n");

  // ── vendors table additions ──────────────────────────────────────────────
  await addColumn("vendors", "category",
    "`category` VARCHAR(100) NULL COMMENT 'Commodity/service category for RFQ filtering'");

  await addColumn("vendors", "is_blacklisted",
    "`is_blacklisted` TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'Excluded from all RFQs and POs when 1'");

  await addColumn("vendors", "blacklist_reason",
    "`blacklist_reason` TEXT NULL");

  await addColumn("vendors", "vendor_rating",
    "`vendor_rating` DECIMAL(3,2) NULL COMMENT '1-5 star rating auto-calculated from GRN history'");

  await addColumn("vendors", "vendor_rating_updated_at",
    "`vendor_rating_updated_at` DATETIME(3) NULL");

  await addColumn("vendors", "settlement_currency_id",
    "`settlement_currency_id` VARCHAR(191) NULL COMMENT 'Primary settlement currency for PO generation'");

  await addColumn("vendors", "registration_status",
    "`registration_status` VARCHAR(50) NOT NULL DEFAULT 'ACTIVE' COMMENT 'PENDING_REVIEW | ACTIVE | SUSPENDED'");

  await addColumn("vendors", "self_registered",
    "`self_registered` TINYINT(1) NOT NULL DEFAULT 0");

  await addColumn("vendors", "self_registration_token",
    "`self_registration_token` VARCHAR(191) NULL");

  // unique index on self_registration_token
  const tokenIdxRows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME   = 'vendors'
       AND INDEX_NAME   = 'vendors_self_registration_token_key'`
  );
  if (Number(tokenIdxRows[0]?.cnt ?? 0) === 0) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`vendors\` ADD UNIQUE INDEX \`vendors_self_registration_token_key\` (\`self_registration_token\`)`
    );
    console.log("[ok]   added unique index on vendors.self_registration_token");
  } else {
    console.log("[skip] unique index on vendors.self_registration_token already exists");
  }

  // ── vendor_banks table ───────────────────────────────────────────────────
  if (!(await tableExists("vendor_banks"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`vendor_banks\` (
        \`id\`             VARCHAR(191) NOT NULL,
        \`vendor_id\`      VARCHAR(191) NOT NULL,
        \`bank_name\`      VARCHAR(255) NOT NULL,
        \`account_name\`   VARCHAR(255) NOT NULL,
        \`account_number\` VARCHAR(100) NOT NULL,
        \`iban\`           VARCHAR(100) NULL,
        \`branch_code\`    VARCHAR(50)  NOT NULL COMMENT 'Required for ZW payment readiness',
        \`swift_code\`     VARCHAR(20)  NOT NULL COMMENT 'SWIFT/BIC — required for ZW payment readiness',
        \`currency_code\`  VARCHAR(10)  NOT NULL COMMENT 'ISO currency code — required for ZW payment readiness',
        \`is_primary\`     TINYINT(1)   NOT NULL DEFAULT 0,
        \`is_active\`      TINYINT(1)   NOT NULL DEFAULT 1,
        \`created_by_id\`  VARCHAR(191) NOT NULL,
        \`created_at\`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`     DATETIME(3)  NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`vendor_banks_vendor_id_idx\` (\`vendor_id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log("[ok]   created vendor_banks table");
  } else {
    console.log("[skip] vendor_banks table already exists");
  }

  // ── vendor_kyc_documents table ───────────────────────────────────────────
  if (!(await tableExists("vendor_kyc_documents"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`vendor_kyc_documents\` (
        \`id\`             VARCHAR(191) NOT NULL,
        \`vendor_id\`      VARCHAR(191) NOT NULL,
        \`document_type\`  VARCHAR(100) NOT NULL COMMENT 'CR14 | BANK_LETTER | CERTIFICATE_OF_INCORPORATION | ITF263 | OTHER',
        \`file_name\`      VARCHAR(255) NOT NULL,
        \`file_url\`       TEXT         NOT NULL,
        \`file_path\`      TEXT         NULL,
        \`file_size\`      INT          NULL,
        \`mime_type\`      VARCHAR(100) NULL,
        \`is_verified\`    TINYINT(1)   NOT NULL DEFAULT 0,
        \`verified_by_id\` VARCHAR(191) NULL,
        \`verified_at\`    DATETIME(3)  NULL,
        \`uploaded_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\`     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\`     DATETIME(3)  NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`vendor_kyc_documents_vendor_id_idx\` (\`vendor_id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    `);
    console.log("[ok]   created vendor_kyc_documents table");
  } else {
    console.log("[skip] vendor_kyc_documents table already exists");
  }

  console.log("\n=== Migration complete ===");
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
