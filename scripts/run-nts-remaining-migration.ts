/**
 * Idempotent DDL for remaining NTS gaps (ex-SmartStream).
 * Run: npm run db:migrate:nts-remaining
 *      (also included in npm run db:migrate:all)
 *
 * Arcus DEV selective --api deploy runs this after rebuilding the API image
 * so vendors.country / users approval fields cannot regress on arcus_dev.
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

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
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
  console.log("=== NTS remaining gaps migration (ex-SmartStream) ===\n");

  // §8 vendor
  await addColumn("vendors", "country", "`country` VARCHAR(64) NULL");
  await addColumn("vendors", "risk_rating", "`risk_rating` VARCHAR(32) NULL");
  await addColumn("vendors", "trading_name", "`trading_name` VARCHAR(255) NULL");
  await addColumn("vendors", "lifecycle_status", "`lifecycle_status` VARCHAR(32) NULL DEFAULT 'ACTIVE'");

  // §7 user master
  await addColumn("users", "approval_limit_amount", "`approval_limit_amount` DECIMAL(15,2) NULL");
  await addColumn("users", "delegated_approver_id", "`delegated_approver_id` VARCHAR(191) NULL");
  await addColumn("users", "branch", "`branch` VARCHAR(128) NULL");
  await addColumn("users", "business_unit", "`business_unit` VARCHAR(128) NULL");
  await addColumn("users", "cost_centre", "`cost_centre` VARCHAR(128) NULL");

  // §11 PR fields + §10 plan link
  await addColumn("purchase_requisitions", "branch", "`branch` VARCHAR(128) NULL");
  await addColumn("purchase_requisitions", "business_unit", "`business_unit` VARCHAR(128) NULL");
  await addColumn("purchase_requisitions", "budget_code", "`budget_code` VARCHAR(64) NULL");
  await addColumn("purchase_requisitions", "delivery_location", "`delivery_location` TEXT NULL");
  await addColumn("purchase_requisitions", "plan_item_id", "`plan_item_id` VARCHAR(191) NULL");

  // §13 method + §19 conflict
  await addColumn(
    "procurement_rfqs",
    "procurement_method",
    "`procurement_method` VARCHAR(32) NULL DEFAULT 'RFQ'"
  );
  await addColumn(
    "procurement_rfqs",
    "conflict_declarations_json",
    "`conflict_declarations_json` JSON NULL"
  );

  // §14 invitation delivery
  await addColumn(
    "rfq_vendor_invitations",
    "delivery_status",
    "`delivery_status` VARCHAR(32) NULL DEFAULT 'PENDING'"
  );
  await addColumn(
    "rfq_vendor_invitations",
    "delivery_error",
    "`delivery_error` TEXT NULL"
  );
  await addColumn(
    "rfq_vendor_invitations",
    "last_delivery_attempt_at",
    "`last_delivery_attempt_at` DATETIME(3) NULL"
  );

  // §24 / §34 / §39 settings
  await addColumn(
    "procurement_settings",
    "match_price_variance_pct",
    "`match_price_variance_pct` DECIMAL(5,2) NULL DEFAULT 2.00"
  );
  await addColumn(
    "procurement_settings",
    "match_qty_tolerance_pct",
    "`match_qty_tolerance_pct` DECIMAL(5,2) NULL DEFAULT 0.00"
  );
  await addColumn(
    "procurement_settings",
    "pr_number_format",
    "`pr_number_format` VARCHAR(64) NULL DEFAULT 'PR_{YYYY}{MM}{DD}_{####}'"
  );
  await addColumn(
    "procurement_settings",
    "po_number_format",
    "`po_number_format` VARCHAR(64) NULL DEFAULT 'PO_{YYYY}{MM}{DD}_{####}'"
  );
  await addColumn(
    "procurement_settings",
    "rfq_number_format",
    "`rfq_number_format` VARCHAR(64) NULL DEFAULT 'RFQ_{YYYY}{MM}{DD}_{####}'"
  );
  await addColumn(
    "procurement_settings",
    "consolidation_fx_currency_id",
    "`consolidation_fx_currency_id` VARCHAR(191) NULL"
  );
  await addColumn(
    "procurement_settings",
    "notification_rules_json",
    "`notification_rules_json` JSON NULL"
  );
  await addColumn(
    "procurement_settings",
    "status_vocabulary_json",
    "`status_vocabulary_json` JSON NULL"
  );

  // §28 RPA job ledger
  if (!(await tableExists("procurement_rpa_jobs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`procurement_rpa_jobs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`job_type\` VARCHAR(64) NOT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
        \`payload_json\` JSON NULL,
        \`result_json\` JSON NULL,
        \`error_message\` TEXT NULL,
        \`created_by_id\` VARCHAR(191) NULL,
        \`started_at\` DATETIME(3) NULL,
        \`finished_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`procurement_rpa_jobs_status_idx\`(\`status\`),
        INDEX \`procurement_rpa_jobs_type_idx\`(\`job_type\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok]   procurement_rpa_jobs");
  } else console.log("[skip] procurement_rpa_jobs");

  // §31 AI usage
  if (!(await tableExists("procurement_ai_usage"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`procurement_ai_usage\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`user_id\` VARCHAR(191) NULL,
        \`feature\` VARCHAR(64) NOT NULL,
        \`units\` INT NOT NULL DEFAULT 1,
        \`meta_json\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`procurement_ai_usage_feature_idx\`(\`feature\`),
        INDEX \`procurement_ai_usage_created_idx\`(\`created_at\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok]   procurement_ai_usage");
  } else console.log("[skip] procurement_ai_usage");

  console.log("\nDone.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
