/**
 * Employee Scorecard workspace apparatus (MySQL). Idempotent.
 * One append-only event log per employee+period (`kind`: note | evidence | history | publish),
 * backing the Employee Scorecard page's "Add note" / "Add evidence" / update history / publish
 * workflow, which previously lived entirely in localStorage (V.notes/V.evidence/V.history/V.products).
 * Run: npm run db:migrate:performance-scorecard-entries
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { assertDevDatabase } from "./lib/assert-dev-database";

const prisma = new PrismaClient();

const TABLE = "performance_scorecard_entries";

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
  await assertDevDatabase(prisma, "performance-scorecard-entries");

  if (!(await tableExists(TABLE))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS \`${TABLE}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`employee_id\` VARCHAR(191) NOT NULL,
        \`period\` VARCHAR(64) NOT NULL,
        \`kind\` VARCHAR(16) NOT NULL,
        \`note_type\` VARCHAR(64) NULL,
        \`text\` TEXT NULL,
        \`file_url\` VARCHAR(1024) NULL,
        \`storage_path\` VARCHAR(1024) NULL,
        \`mime_type\` VARCHAR(191) NULL,
        \`file_size_bytes\` INT NULL,
        \`actor_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`performance_scorecard_entries_employee_period_idx\` (\`employee_id\`, \`period\`),
        INDEX \`performance_scorecard_entries_kind_idx\` (\`kind\`),
        INDEX \`performance_scorecard_entries_actor_idx\` (\`actor_id\`),
        CONSTRAINT \`performance_scorecard_entries_employee_fk\`
          FOREIGN KEY (\`employee_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`performance_scorecard_entries_actor_fk\`
          FOREIGN KEY (\`actor_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log(`[ok] created ${TABLE}`);
  } else {
    console.log(`[skip] ${TABLE} exists`);
  }

  await ensureColumn("employee_id", "`employee_id` VARCHAR(191) NOT NULL");
  await ensureColumn("period", "`period` VARCHAR(64) NOT NULL");
  await ensureColumn("kind", "`kind` VARCHAR(16) NOT NULL");
  await ensureColumn("note_type", "`note_type` VARCHAR(64) NULL");
  await ensureColumn("text", "`text` TEXT NULL");
  await ensureColumn("file_url", "`file_url` VARCHAR(1024) NULL");
  await ensureColumn("storage_path", "`storage_path` VARCHAR(1024) NULL");
  await ensureColumn("mime_type", "`mime_type` VARCHAR(191) NULL");
  await ensureColumn("file_size_bytes", "`file_size_bytes` INT NULL");
  await ensureColumn("actor_id", "`actor_id` VARCHAR(191) NOT NULL");
  await ensureColumn("created_at", "`created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)");

  await ensureIndex(
    "performance_scorecard_entries_employee_period_idx",
    "INDEX `performance_scorecard_entries_employee_period_idx` (`employee_id`, `period`)"
  );
  await ensureIndex(
    "performance_scorecard_entries_kind_idx",
    "INDEX `performance_scorecard_entries_kind_idx` (`kind`)"
  );
  await ensureIndex(
    "performance_scorecard_entries_actor_idx",
    "INDEX `performance_scorecard_entries_actor_idx` (`actor_id`)"
  );

  console.log("\nPerformance scorecard entries migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
