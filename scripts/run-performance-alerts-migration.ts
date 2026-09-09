/**
 * Performance Alerts & Escalations table (MySQL). Idempotent.
 * Backs the Performance module's Alerts & Escalations board (Alert / Source / Severity /
 * Owner / Escalation / Elapsed / Status). "Elapsed" is NOT stored — PerformanceAlertService
 * derives `elapsedMinutes` from `raised_at` on read so it can never go stale.
 * Run: npm run db:migrate:performance-alerts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient();

const TABLE = "performance_alerts";

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function indexExists(table: string, index: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    index
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

/** Additive column add — no-op when the column is already present. */
async function ensureColumn(column: string, ddl: string): Promise<void> {
  if (await columnExists(TABLE, column)) {
    console.log(`[skip] ${TABLE}.${column} exists`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${TABLE}\` ADD COLUMN ${ddl}`);
  console.log(`[ok] added ${TABLE}.${column}`);
}

async function ensureIndex(index: string, ddl: string): Promise<void> {
  if (await indexExists(TABLE, index)) {
    console.log(`[skip] ${TABLE}.${index} exists`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${TABLE}\` ADD ${ddl}`);
  console.log(`[ok] added index ${index}`);
}

async function main() {
  await assertDevDatabase(prisma, "performance-alerts");

  if (!(await tableExists(TABLE))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`reference\` VARCHAR(64) NOT NULL,
        \`title\` VARCHAR(255) NOT NULL,
        \`description\` TEXT NULL,
        \`source\` VARCHAR(191) NOT NULL DEFAULT 'Manual',
        \`severity\` VARCHAR(32) NOT NULL DEFAULT 'warning',
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'open',
        \`owner_id\` VARCHAR(191) NULL,
        \`department_id\` VARCHAR(191) NULL,
        \`escalation_level\` INT NOT NULL DEFAULT 0,
        \`raised_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`acknowledged_at\` DATETIME(3) NULL,
        \`resolved_at\` DATETIME(3) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`performance_alerts_reference_key\` (\`reference\`),
        INDEX \`performance_alerts_status_idx\` (\`status\`),
        INDEX \`performance_alerts_severity_idx\` (\`severity\`),
        INDEX \`performance_alerts_owner_idx\` (\`owner_id\`),
        INDEX \`performance_alerts_department_idx\` (\`department_id\`),
        INDEX \`performance_alerts_created_by_idx\` (\`created_by_id\`),
        CONSTRAINT \`performance_alerts_owner_fk\`
          FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`performance_alerts_department_fk\`
          FOREIGN KEY (\`department_id\`) REFERENCES \`departments\`(\`id\`)
          ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`performance_alerts_created_by_fk\`
          FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log(`[ok] created ${TABLE}`);
  } else {
    console.log(`[skip] ${TABLE} exists`);
  }

  // Additive guards so a table created by an older run of this script is brought forward.
  await ensureColumn("reference", "`reference` VARCHAR(64) NOT NULL");
  await ensureColumn("title", "`title` VARCHAR(255) NOT NULL");
  await ensureColumn("description", "`description` TEXT NULL");
  await ensureColumn("source", "`source` VARCHAR(191) NOT NULL DEFAULT 'Manual'");
  await ensureColumn("severity", "`severity` VARCHAR(32) NOT NULL DEFAULT 'warning'");
  await ensureColumn("status", "`status` VARCHAR(32) NOT NULL DEFAULT 'open'");
  await ensureColumn("owner_id", "`owner_id` VARCHAR(191) NULL");
  await ensureColumn("department_id", "`department_id` VARCHAR(191) NULL");
  await ensureColumn("escalation_level", "`escalation_level` INT NOT NULL DEFAULT 0");
  await ensureColumn("raised_at", "`raised_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)");
  await ensureColumn("acknowledged_at", "`acknowledged_at` DATETIME(3) NULL");
  await ensureColumn("resolved_at", "`resolved_at` DATETIME(3) NULL");
  await ensureColumn("created_by_id", "`created_by_id` VARCHAR(191) NOT NULL");
  await ensureColumn("created_at", "`created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)");
  await ensureColumn("updated_at", "`updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)");

  await ensureIndex(
    "performance_alerts_reference_key",
    "UNIQUE INDEX `performance_alerts_reference_key` (`reference`)"
  );
  await ensureIndex("performance_alerts_status_idx", "INDEX `performance_alerts_status_idx` (`status`)");
  await ensureIndex("performance_alerts_severity_idx", "INDEX `performance_alerts_severity_idx` (`severity`)");
  await ensureIndex("performance_alerts_owner_idx", "INDEX `performance_alerts_owner_idx` (`owner_id`)");
  await ensureIndex(
    "performance_alerts_department_idx",
    "INDEX `performance_alerts_department_idx` (`department_id`)"
  );
  await ensureIndex(
    "performance_alerts_created_by_idx",
    "INDEX `performance_alerts_created_by_idx` (`created_by_id`)"
  );

  console.log("\nPerformance alerts migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
