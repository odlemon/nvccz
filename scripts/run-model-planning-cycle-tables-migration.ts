/**
 * Model Planning cycles — model_planning_cycles.
 * Distinct from planning_budget_cycles (annual budget execution workflow) by product
 * decision. Idempotent. Run: npm run db:migrate:model-planning-cycle
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
  const table = "model_planning_cycles";
  if (await tableExists(table)) {
    console.log(`[skip] ${table} already exists`);
    return;
  }

  await prisma.$executeRawUnsafe(
    `CREATE TABLE \`model_planning_cycles\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`cycle_name\` VARCHAR(255) NOT NULL,
      \`financial_year\` INT NOT NULL,
      \`planning_type\` VARCHAR(64) NOT NULL,
      \`source_model_id\` VARCHAR(191) NOT NULL,
      \`source_model_version_id\` VARCHAR(191) NOT NULL,
      \`actuals_cutoff_period\` DATE NULL,
      \`forecast_start_period\` DATE NULL,
      \`planning_horizon\` INT NULL,
      \`base_scenario_id\` VARCHAR(191) NULL,
      \`submission_deadline\` DATE NULL,
      \`approval_workflow_id\` VARCHAR(191) NULL,
      \`planning_owner_id\` VARCHAR(191) NULL,
      \`status\` VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
      \`created_by\` VARCHAR(191) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_by\` VARCHAR(191) NULL,
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`model_planning_cycles_source_model_idx\` (\`source_model_id\`),
      INDEX \`model_planning_cycles_planning_type_idx\` (\`planning_type\`),
      INDEX \`model_planning_cycles_status_idx\` (\`status\`),
      INDEX \`model_planning_cycles_owner_idx\` (\`planning_owner_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  console.log(`[ok] Created ${table}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());