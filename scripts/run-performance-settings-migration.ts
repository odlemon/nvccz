/**
 * Performance module settings store.
 *
 * WHY THIS EXISTS
 * ---------------
 * `/performance/settings` renders a complete configuration workspace — organisation name,
 * timezone, date format, objective cascade, performance cycle, KPI and review approval
 * workflows, self-appraisal and KPI-lock switches, five notification cadences, four
 * financial-year / review-calendar dates, and four security & audit switches — and **none of
 * it was stored anywhere**. The "Save changes" button was wired to `toast-generic`: it showed
 * a success toast and made no request. The RBAC panel's "Save RBAC policy" called
 * `localStorage.setItem`, so a policy "saved" on one machine was invisible everywhere else.
 *
 * WHY A KEYED STORE RATHER THAN A WIDE TABLE
 * ------------------------------------------
 * There is no written specification for these settings — the field list above was read off
 * the rendered page, not off a requirements document. A 25-column table would freeze one
 * reading of a mock form into the schema, and every later addition would need a migration.
 * A key/value store with a JSON value keeps the schema stable while the settings surface is
 * still being agreed, and the keys are namespaced (`general.*`, `workflow.*`,
 * `notifications.*`, `calendar.*`, `security.*`, `rbac.*`) so they can be split into typed
 * tables later without a data migration.
 *
 * Scope: settings are organisation-wide, not per user. There is exactly one row per key.
 *
 * Idempotent: safe to re-run. Creates nothing that already exists, and seeds no values —
 * an unset setting must read as unset, not as a default someone might mistake for a choice.
 *
 * Usage:
 *   npm run db:migrate:performance-settings
 *   npx ts-node --transpile-only -r dotenv/config scripts/run-performance-settings-migration.ts
 */
// @ts-nocheck
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient() as any;
const TABLE = "performance_settings";

async function tableExists(name: string): Promise<boolean> {
  const rows: any[] = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?",
    name
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows: any[] = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?",
    table,
    column
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

async function indexExists(table: string, index: string): Promise<boolean> {
  const rows: any[] = await prisma.$queryRawUnsafe(
    "SELECT COUNT(*) AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?",
    table,
    index
  );
  return Number(rows?.[0]?.c || 0) > 0;
}

async function ensureColumn(column: string, ddl: string): Promise<void> {
  if (await columnExists(TABLE, column)) {
    console.log(`[skip] ${TABLE}.${column} exists`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${TABLE}\` ADD COLUMN ${ddl}`);
  console.log(`[ok]   added ${TABLE}.${column}`);
}

async function ensureIndex(index: string, ddl: string): Promise<void> {
  if (await indexExists(TABLE, index)) {
    console.log(`[skip] index ${index} exists`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${TABLE}\` ADD ${ddl}`);
  console.log(`[ok]   added index ${index}`);
}

async function main(): Promise<void> {

  if (await tableExists(TABLE)) {
    console.log(`[skip] ${TABLE} exists`);
  } else {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${TABLE}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`setting_key\` VARCHAR(191) NOT NULL,
        \`value\` JSON NULL,
        \`updated_by_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`performance_settings_setting_key_key\` (\`setting_key\`),
        INDEX \`performance_settings_updated_by_idx\` (\`updated_by_id\`),
        CONSTRAINT \`performance_settings_updated_by_fk\`
          FOREIGN KEY (\`updated_by_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log(`[ok]   created ${TABLE}`);
  }

  // Alter path, for a database where the table predates a column.
  await ensureColumn("setting_key", "`setting_key` VARCHAR(191) NOT NULL");
  await ensureColumn("value", "`value` JSON NULL");
  await ensureColumn("updated_by_id", "`updated_by_id` VARCHAR(191) NULL");
  await ensureColumn("created_at", "`created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)");
  await ensureColumn("updated_at", "`updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)");

  await ensureIndex(
    "performance_settings_setting_key_key",
    "UNIQUE INDEX `performance_settings_setting_key_key` (`setting_key`)"
  );
  await ensureIndex(
    "performance_settings_updated_by_idx",
    "INDEX `performance_settings_updated_by_idx` (`updated_by_id`)"
  );

  // Deliberately no seed. An unset setting must read as unset: seeding "Annual Performance
  // Cycle" here would put a value on screen that nobody chose, which is the exact defect this
  // whole exercise exists to remove.
  const [{ c }]: any[] = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM \`${TABLE}\``);
  console.log(`\nPerformance settings migration finished. ${Number(c)} setting(s) stored.`);
}

main()
  .catch((e) => {
    console.error("[performance-settings] FAILED:", e?.message || e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
