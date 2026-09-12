/**
 * FP&A budget cycles — planning_budget_cycles + owners.
 * Idempotent. Run: npm run db:migrate:fpa-budget-cycles
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

async function createTable(name: string, ddl: string) {
  if (await tableExists(name)) {
    console.log(`[skip] ${name}`);
    return;
  }
  await prisma.$executeRawUnsafe(ddl);
  console.log(`[ok] ${name}`);
}

async function main() {
  await createTable(
    "planning_budget_cycles",
    `CREATE TABLE \`planning_budget_cycles\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`version_id\` VARCHAR(191) NOT NULL,
      \`scenario_id\` VARCHAR(191) NULL,
      \`workflow_id\` VARCHAR(191) NULL,
      \`fiscal_year\` INT NOT NULL,
      \`status\` VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
      \`current_stage\` VARCHAR(64) NOT NULL DEFAULT 'CREATE_CYCLE',
      \`start_date\` DATE NULL,
      \`end_date\` DATE NULL,
      \`input_categories_json\` JSON NULL,
      \`locked_at\` DATETIME(3) NULL,
      \`locked_by_id\` VARCHAR(191) NULL,
      \`approved_at\` DATETIME(3) NULL,
      \`approved_by_id\` VARCHAR(191) NULL,
      \`board_pack_url\` VARCHAR(512) NULL,
      \`created_by\` VARCHAR(191) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`planning_budget_cycles_model_idx\` (\`model_id\`),
      INDEX \`planning_budget_cycles_model_fy_idx\` (\`model_id\`, \`fiscal_year\`),
      INDEX \`planning_budget_cycles_status_idx\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_budget_cycle_owners",
    `CREATE TABLE \`planning_budget_cycle_owners\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`cycle_id\` VARCHAR(191) NOT NULL,
      \`department_id\` VARCHAR(191) NOT NULL,
      \`assignee_id\` VARCHAR(191) NULL,
      \`task_id\` VARCHAR(191) NULL,
      \`categories_json\` JSON NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`planning_budget_cycle_owners_key\` (\`cycle_id\`, \`department_id\`),
      INDEX \`planning_budget_cycle_owners_cycle_idx\` (\`cycle_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  console.log("FP&A budget cycles migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
