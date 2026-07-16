/**
 * Model Planning cycle owners + workflowId column.
 * Table: model_planning_cycle_owners (distinct from planning_budget_cycle_owners).
 * Also adds workflow_id on model_planning_cycles for owner tasks.
 *
 * Idempotent. Run: npm run db:migrate:model-planning-cycle-owners
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

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const cycles = "model_planning_cycles";
  if (!(await tableExists(cycles))) {
    console.log(`[skip] ${cycles} missing — run db:migrate:model-planning-cycle first`);
  } else if (await columnExists(cycles, "workflow_id")) {
    console.log(`[skip] ${cycles}.workflow_id already exists`);
  } else {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${cycles}\` ADD COLUMN \`workflow_id\` VARCHAR(191) NULL AFTER \`approval_workflow_id\``
    );
    console.log(`[ok] Added ${cycles}.workflow_id`);
  }

  const owners = "model_planning_cycle_owners";
  if (await tableExists(owners)) {
    console.log(`[skip] ${owners} already exists`);
    return;
  }

  await prisma.$executeRawUnsafe(
    `CREATE TABLE \`${owners}\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`cycle_id\` VARCHAR(191) NOT NULL,
      \`department_id\` VARCHAR(191) NOT NULL,
      \`assignee_id\` VARCHAR(191) NULL,
      \`task_id\` VARCHAR(191) NULL,
      \`due_date\` DATE NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`model_planning_cycle_owners_key\` (\`cycle_id\`, \`department_id\`),
      INDEX \`model_planning_cycle_owners_cycle_idx\` (\`cycle_id\`),
      INDEX \`model_planning_cycle_owners_assignee_idx\` (\`assignee_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  console.log(`[ok] Created ${owners}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
