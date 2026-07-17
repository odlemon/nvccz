/**
 * FP&A cross-tab gaps: persisted settings, connector state, comment threading.
 * Idempotent. Run: npm run db:migrate:fpa-cross-tab-gaps
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
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

async function main() {
  const db = (await prisma.$queryRawUnsafe<Array<{ d: string }>>(`SELECT DATABASE() AS d`))[0]?.d;
  console.log(`[fpa-cross-tab-gaps] database=${db}`);

  if (!(await columnExists("planning_comments", "parent_comment_id"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE planning_comments ADD COLUMN parent_comment_id VARCHAR(191) NULL AFTER task_id`
    );
    console.log("[ok] planning_comments.parent_comment_id");
  } else {
    console.log("[skip] planning_comments.parent_comment_id");
  }
  if (!(await indexExists("planning_comments", "planning_comments_parent_idx"))) {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX planning_comments_parent_idx ON planning_comments(parent_comment_id)`
    );
    console.log("[ok] planning_comments_parent_idx");
  } else {
    console.log("[skip] planning_comments_parent_idx");
  }

  if (!(await tableExists("fpa_settings"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE fpa_settings (
        id VARCHAR(64) NOT NULL,
        variance_json JSON NOT NULL,
        workflow_json JSON NOT NULL,
        updated_by VARCHAR(191) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] fpa_settings");
  } else {
    console.log("[skip] fpa_settings");
  }

  if (!(await tableExists("fpa_sync_sources"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE fpa_sync_sources (
        id VARCHAR(64) NOT NULL,
        label VARCHAR(128) NOT NULL,
        status VARCHAR(32) NOT NULL DEFAULT 'DISCONNECTED',
        last_sync_at DATETIME(3) NULL,
        last_error TEXT NULL,
        config_json JSON NULL,
        updated_by VARCHAR(191) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        INDEX fpa_sync_sources_status_idx (status)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] fpa_sync_sources");
  } else {
    console.log("[skip] fpa_sync_sources");
  }

  await prisma.$executeRawUnsafe(`
    INSERT INTO fpa_settings (id, variance_json, workflow_json)
    VALUES (
      'default',
      JSON_OBJECT(
        'commentaryThresholdPct', 5,
        'enforceCommentary', TRUE,
        'blockSubmitWithoutCommentary', FALSE
      ),
      JSON_OBJECT(
        'path', 'LINEAR',
        'requireCfoSignature', TRUE,
        'allowRerunAfterReturn', TRUE
      )
    )
    ON DUPLICATE KEY UPDATE id = VALUES(id)
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO fpa_sync_sources (id, label, status)
    VALUES ('netsuite', 'NetSuite', 'DISCONNECTED')
    ON DUPLICATE KEY UPDATE label = VALUES(label)
  `);
  console.log("[ok] defaults seeded");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
