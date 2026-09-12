/**
 * Accounting period-close task checklist table (MySQL). Idempotent.
 * This gates FiscalPeriod locking (see PeriodLockService for the actual lock/commit engine) —
 * it only creates the checklist table itself; it does not touch period-lock tables/logic.
 * Run: npm run db:migrate:accounting-close-tasks
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  if (!(await tableExists("accounting_close_tasks"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`accounting_close_tasks\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fiscal_period_id\` VARCHAR(191) NOT NULL,
        \`workstream\` VARCHAR(64) NOT NULL,
        \`task\` VARCHAR(255) NOT NULL,
        \`owner_id\` VARCHAR(191) NULL,
        \`due_at\` DATETIME(3) NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
        \`depends_on_id\` VARCHAR(191) NULL,
        \`completed_by_id\` VARCHAR(191) NULL,
        \`completed_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`accounting_close_tasks_fp_idx\` (\`fiscal_period_id\`),
        INDEX \`accounting_close_tasks_status_idx\` (\`status\`),
        INDEX \`accounting_close_tasks_depends_on_idx\` (\`depends_on_id\`),
        CONSTRAINT \`accounting_close_tasks_fp_fk\`
          FOREIGN KEY (\`fiscal_period_id\`) REFERENCES \`fiscal_periods\`(\`id\`)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`accounting_close_tasks_owner_fk\`
          FOREIGN KEY (\`owner_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`accounting_close_tasks_completed_by_fk\`
          FOREIGN KEY (\`completed_by_id\`) REFERENCES \`users\`(\`id\`)
          ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`accounting_close_tasks_depends_on_fk\`
          FOREIGN KEY (\`depends_on_id\`) REFERENCES \`accounting_close_tasks\`(\`id\`)
          ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created accounting_close_tasks");
  } else {
    console.log("[skip] accounting_close_tasks exists");
  }

  console.log("\nAccounting close-task migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
