/**
 * BSC workflow tables: budget variance narrative + statutory submission sign-off.
 * Idempotent: skips if tables exist. No Prisma migrate.
 *
 * Run: npm run db:migrate:bsc-workflow-tables
 * Then: npx prisma generate
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(1) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(1) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function main() {
  if (!(await tableExists("bsc_budget_variance_reports"))) {
    await prisma.$executeRawUnsafe(`
CREATE TABLE \`bsc_budget_variance_reports\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`performance_goal_id\` VARCHAR(191) NOT NULL,
  \`period_label\` VARCHAR(255) NULL,
  \`period_start\` DATETIME(3) NULL,
  \`period_end\` DATETIME(3) NULL,
  \`narrative\` TEXT NOT NULL,
  \`actual_spend_snapshot\` DECIMAL(15,2) NULL,
  \`allocation_snapshot\` DECIMAL(15,2) NULL,
  \`submitted_by_id\` VARCHAR(191) NOT NULL,
  \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  INDEX \`bsc_budget_variance_reports_goal_idx\` (\`performance_goal_id\`),
  CONSTRAINT \`bsc_budget_variance_reports_goal_fk\` FOREIGN KEY (\`performance_goal_id\`) REFERENCES \`performance_goals\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`bsc_budget_variance_reports_user_fk\` FOREIGN KEY (\`submitted_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
`);
    console.log("[ok] created bsc_budget_variance_reports");
  } else {
    console.log("[skip] bsc_budget_variance_reports already exists");
  }

  if (!(await tableExists("bsc_statutory_submissions"))) {
    await prisma.$executeRawUnsafe(`
CREATE TABLE \`bsc_statutory_submissions\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`performance_goal_id\` VARCHAR(191) NOT NULL,
  \`period_label\` VARCHAR(255) NULL,
  \`evidence_document_url\` TEXT NULL,
  \`submitted_by_id\` VARCHAR(191) NOT NULL,
  \`manager_sign_off_by_id\` VARCHAR(191) NULL,
  \`manager_sign_off_at\` DATETIME(3) NULL,
  \`manager_sign_off_note\` TEXT NULL,
  \`status\` VARCHAR(64) NOT NULL DEFAULT 'pending_manager_review',
  \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  INDEX \`bsc_statutory_submissions_goal_idx\` (\`performance_goal_id\`),
  INDEX \`bsc_statutory_submissions_status_idx\` (\`status\`),
  CONSTRAINT \`bsc_statutory_submissions_goal_fk\` FOREIGN KEY (\`performance_goal_id\`) REFERENCES \`performance_goals\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`bsc_statutory_submissions_submitter_fk\` FOREIGN KEY (\`submitted_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT \`bsc_statutory_submissions_manager_fk\` FOREIGN KEY (\`manager_sign_off_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
`);
    console.log("[ok] created bsc_statutory_submissions");
  } else {
    console.log("[skip] bsc_statutory_submissions already exists");
  }

  /** Older DBs: table without timestamp columns (Prisma orderBy needs these). */
  if (await tableExists("bsc_statutory_submissions")) {
    if (!(await columnExists("bsc_statutory_submissions", "created_at"))) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE \`bsc_statutory_submissions\`
        ADD COLUMN \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      `);
      console.log("[ok] added bsc_statutory_submissions.created_at");
    } else {
      console.log("[skip] bsc_statutory_submissions.created_at already exists");
    }
    if (!(await columnExists("bsc_statutory_submissions", "updated_at"))) {
      await prisma.$executeRawUnsafe(`
        ALTER TABLE \`bsc_statutory_submissions\`
        ADD COLUMN \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
      `);
      console.log("[ok] added bsc_statutory_submissions.updated_at");
    } else {
      console.log("[skip] bsc_statutory_submissions.updated_at already exists");
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
