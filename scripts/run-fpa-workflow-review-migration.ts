/**
 * FP&A workflow / approvals cockpit gaps.
 * Idempotent. Run: npm run db:migrate:fpa-workflow-review
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

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function addColumnIfMissing(table: string, column: string, definition: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`[ok] ${table}.${column}`);
}

async function addIndexIfMissing(table: string, indexName: string, ddl: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    indexName
  );
  if (Number(rows[0]?.c ?? 0) > 0) {
    console.log(`[skip] index ${indexName}`);
    return;
  }
  await prisma.$executeRawUnsafe(ddl);
  console.log(`[ok] index ${indexName}`);
}

async function main() {
  await addColumnIfMissing("planning_budget_cycles", "opened_at", "DATETIME(3) NULL");
  await addColumnIfMissing("planning_budget_cycles", "fpa_review_at", "DATETIME(3) NULL");
  await addColumnIfMissing("planning_budget_cycles", "cfo_review_at", "DATETIME(3) NULL");

  await addColumnIfMissing("planning_tasks", "reviewer_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("planning_tasks", "change_notes", "TEXT NULL");

  await addColumnIfMissing("planning_comments", "cycle_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("planning_comments", "task_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("planning_comments", "visibility", "VARCHAR(16) NOT NULL DEFAULT 'ALL'");
  await addIndexIfMissing(
    "planning_comments",
    "planning_comments_cycle_idx",
    "CREATE INDEX `planning_comments_cycle_idx` ON `planning_comments` (`cycle_id`)"
  );
  await addIndexIfMissing(
    "planning_comments",
    "planning_comments_task_idx",
    "CREATE INDEX `planning_comments_task_idx` ON `planning_comments` (`task_id`)"
  );

  if (!(await tableExists("planning_attachments"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`planning_attachments\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`task_id\` VARCHAR(191) NULL,
        \`cycle_id\` VARCHAR(191) NULL,
        \`file_name\` VARCHAR(255) NOT NULL,
        \`mime_type\` VARCHAR(128) NULL,
        \`size_bytes\` INT NULL,
        \`storage_key\` VARCHAR(1024) NOT NULL,
        \`file_url\` VARCHAR(1024) NULL,
        \`uploaded_by\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`planning_attachments_task_idx\` (\`task_id\`),
        INDEX \`planning_attachments_cycle_idx\` (\`cycle_id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] planning_attachments");
  } else {
    console.log("[skip] planning_attachments");
  }

  console.log("FP&A workflow review migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
