/**
 * LP Portal FE gaps DDL — idempotent.
 * Run: npm run db:migrate:lp-portal-fe-gaps
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`[ok] ${table}.${column}`);
}

async function createTable(name: string, ddl: string) {
  if (await tableExists(name)) {
    console.log(`[skip] ${name}`);
    return;
  }
  await prisma.$executeRawUnsafe(ddl);
  console.log(`[ok] ${name}`);
}

async function main() {
  const dbRows = await prisma.$queryRawUnsafe<Array<{ db: string }>>(`SELECT DATABASE() AS db`);
  console.log(`[info] DATABASE()=${dbRows[0]?.db}`);

  await addColumn("lp_notices", "category", "`category` VARCHAR(32) NULL");
  await addColumn("lp_service_requests", "priority", "`priority` VARCHAR(16) NOT NULL DEFAULT 'NORMAL'");
  await addColumn("lp_dealing_requests", "share_class", "`share_class` VARCHAR(64) NULL");

  await addColumn("lp_portal_documents", "mime_type", "`mime_type` VARCHAR(128) NULL");
  await addColumn("lp_portal_documents", "file_size_bytes", "`file_size_bytes` BIGINT NULL");
  await addColumn("lp_portal_documents", "page_count", "`page_count` INT NULL");

  await addColumn(
    "lp_notification_prefs",
    "in_app_capital_calls",
    "`in_app_capital_calls` BOOLEAN NOT NULL DEFAULT true"
  );
  await addColumn(
    "lp_notification_prefs",
    "in_app_distributions",
    "`in_app_distributions` BOOLEAN NOT NULL DEFAULT true"
  );
  await addColumn(
    "lp_notification_prefs",
    "in_app_documents",
    "`in_app_documents` BOOLEAN NOT NULL DEFAULT true"
  );
  await addColumn(
    "lp_notification_prefs",
    "in_app_messages",
    "`in_app_messages` BOOLEAN NOT NULL DEFAULT true"
  );
  await addColumn(
    "lp_notification_prefs",
    "in_app_notices",
    "`in_app_notices` BOOLEAN NOT NULL DEFAULT true"
  );
  await addColumn(
    "lp_notification_prefs",
    "email_digest",
    "`email_digest` VARCHAR(16) NOT NULL DEFAULT 'WEEKLY'"
  );
  await addColumn(
    "lp_notification_prefs",
    "presentation_currency",
    "`presentation_currency` VARCHAR(8) NOT NULL DEFAULT 'USD'"
  );
  await addColumn(
    "lp_notification_prefs",
    "default_as_of_preference",
    "`default_as_of_preference` VARCHAR(16) NOT NULL DEFAULT 'LATEST'"
  );

  await createTable(
    "lp_portal_attachments",
    `CREATE TABLE \`lp_portal_attachments\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`client_id\` VARCHAR(191) NOT NULL,
      \`file_name\` VARCHAR(255) NOT NULL,
      \`mime_type\` VARCHAR(128) NOT NULL,
      \`storage_path\` VARCHAR(512) NOT NULL,
      \`file_size_bytes\` BIGINT NULL,
      \`sha256\` VARCHAR(64) NULL,
      \`request_id\` VARCHAR(191) NULL,
      \`message_id\` VARCHAR(191) NULL,
      \`uploaded_by_id\` VARCHAR(191) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`lp_portal_attachments_client_idx\` (\`client_id\`),
      INDEX \`lp_portal_attachments_request_idx\` (\`request_id\`),
      INDEX \`lp_portal_attachments_message_idx\` (\`message_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_dealing_estimate_snapshots",
    `CREATE TABLE \`lp_dealing_estimate_snapshots\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`client_id\` VARCHAR(191) NOT NULL,
      \`fund_id\` VARCHAR(191) NOT NULL,
      \`estimate_type\` VARCHAR(16) NOT NULL,
      \`estimate_json\` JSON NOT NULL,
      \`payload_hash\` VARCHAR(64) NOT NULL,
      \`expires_at\` DATETIME(3) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`lp_dealing_estimate_snapshots_client_idx\` (\`client_id\`),
      INDEX \`lp_dealing_estimate_snapshots_expires_idx\` (\`expires_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_bank_instruction_changes",
    `CREATE TABLE \`lp_bank_instruction_changes\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`client_id\` VARCHAR(191) NOT NULL,
      \`fund_id\` VARCHAR(191) NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED',
      \`requested_by_id\` VARCHAR(191) NULL,
      \`payload_json\` JSON NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`lp_bank_instruction_changes_client_idx\` (\`client_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  // Backfill notice categories from title heuristics
  await prisma.$executeRawUnsafe(`
    UPDATE lp_notices SET category = 'CAPITAL_CALL'
    WHERE category IS NULL AND (LOWER(title) LIKE '%capital call%' OR LOWER(title) LIKE '%call #%')
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE lp_notices SET category = 'REPORT'
    WHERE category IS NULL AND (LOWER(title) LIKE '%report%' OR LOWER(title) LIKE '%letter%' OR LOWER(title) LIKE '%quarterly%')
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE lp_notices SET category = 'POLICY'
    WHERE category IS NULL AND (LOWER(title) LIKE '%policy%' OR LOWER(title) LIKE '%terms%')
  `);
  await prisma.$executeRawUnsafe(`
    UPDATE lp_notices SET category = 'GENERAL' WHERE category IS NULL
  `);

  console.log("[done] LP Portal FE gaps migration");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
