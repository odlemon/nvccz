/**
 * FPA Planning — drop legacy forecast_* tables and create planning_* tables.
 * Idempotent. Run: npm run db:migrate:fpa-planning
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

async function dropIfExists(name: string) {
  if (await tableExists(name)) {
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS \`${name}\``);
    console.log(`[ok] dropped ${name}`);
  } else {
    console.log(`[skip] drop ${name} (not present)`);
  }
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
  // Legacy forecasting tables (FK-safe order)
  const legacy = [
    "forecast_goal_links",
    "forecast_compute_jobs",
    "forecast_audit_logs",
    "forecast_versions",
    "forecast_drivers",
    "forecast_cells",
    "forecast_dimensions",
    "forecast_scenarios",
  ];
  for (const t of legacy) {
    await dropIfExists(t);
  }

  await createTable(
    "planning_models",
    `CREATE TABLE \`planning_models\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_name\` VARCHAR(255) NOT NULL,
      \`model_type\` VARCHAR(100) NOT NULL,
      \`description\` TEXT NULL,
      \`owner_user_id\` VARCHAR(191) NOT NULL,
      \`base_currency\` VARCHAR(3) NOT NULL,
      \`start_period\` DATE NOT NULL,
      \`end_period\` DATE NOT NULL,
      \`time_granularity\` VARCHAR(20) NOT NULL,
      \`status\` VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
      \`created_by\` VARCHAR(191) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_by\` VARCHAR(191) NULL,
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`planning_models_status_idx\` (\`status\`),
      INDEX \`planning_models_owner_idx\` (\`owner_user_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_dimensions",
    `CREATE TABLE \`planning_dimensions\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`code\` VARCHAR(64) NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`dimension_type\` VARCHAR(64) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`planning_dimensions_code_key\` (\`code\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_dimension_members",
    `CREATE TABLE \`planning_dimension_members\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`dimension_id\` VARCHAR(191) NOT NULL,
      \`code\` VARCHAR(64) NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`parent_id\` VARCHAR(191) NULL,
      \`sort_order\` INT NOT NULL DEFAULT 0,
      \`is_active\` BOOLEAN NOT NULL DEFAULT true,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`planning_dim_members_dim_code_key\` (\`dimension_id\`, \`code\`),
      INDEX \`planning_dim_members_dim_idx\` (\`dimension_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_model_dimensions",
    `CREATE TABLE \`planning_model_dimensions\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`dimension_id\` VARCHAR(191) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`planning_model_dims_key\` (\`model_id\`, \`dimension_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_line_items",
    `CREATE TABLE \`planning_line_items\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`code\` VARCHAR(64) NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`line_item_type\` VARCHAR(50) NOT NULL,
      \`category\` VARCHAR(50) NOT NULL DEFAULT 'GENERAL',
      \`data_type\` VARCHAR(32) NOT NULL DEFAULT 'CURRENCY',
      \`summary_method\` VARCHAR(32) NOT NULL DEFAULT 'SUM',
      \`format\` VARCHAR(32) NULL,
      \`is_editable\` BOOLEAN NOT NULL DEFAULT true,
      \`sort_order\` INT NOT NULL DEFAULT 0,
      \`account_id\` VARCHAR(191) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`planning_line_items_model_code_key\` (\`model_id\`, \`code\`),
      INDEX \`planning_line_items_model_cat_idx\` (\`model_id\`, \`category\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_versions",
    `CREATE TABLE \`planning_versions\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`status\` VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
      \`locked_at\` DATETIME(3) NULL,
      \`locked_by_id\` VARCHAR(191) NULL,
      \`created_by\` VARCHAR(191) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`planning_versions_model_status_idx\` (\`model_id\`, \`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_scenarios",
    `CREATE TABLE \`planning_scenarios\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`scenario_type\` VARCHAR(50) NOT NULL,
      \`description\` TEXT NULL,
      \`is_official\` BOOLEAN NOT NULL DEFAULT false,
      \`status\` VARCHAR(50) NOT NULL DEFAULT 'DRAFT',
      \`created_by\` VARCHAR(191) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`planning_scenarios_model_type_idx\` (\`model_id\`, \`scenario_type\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_formulas",
    `CREATE TABLE \`planning_formulas\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`line_item_id\` VARCHAR(191) NOT NULL,
      \`expression\` TEXT NOT NULL,
      \`is_valid\` BOOLEAN NOT NULL DEFAULT true,
      \`validation_msg\` TEXT NULL,
      \`created_by\` VARCHAR(191) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`planning_formulas_model_line_idx\` (\`model_id\`, \`line_item_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_formula_dependencies",
    `CREATE TABLE \`planning_formula_dependencies\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`formula_id\` VARCHAR(191) NOT NULL,
      \`depends_on_formula_id\` VARCHAR(191) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`planning_formula_deps_key\` (\`formula_id\`, \`depends_on_formula_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_drivers",
    `CREATE TABLE \`planning_drivers\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`scenario_id\` VARCHAR(191) NULL,
      \`version_id\` VARCHAR(191) NULL,
      \`code\` VARCHAR(64) NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`category\` VARCHAR(64) NOT NULL,
      \`period_date\` DATE NULL,
      \`value\` DECIMAL(20, 8) NOT NULL,
      \`unit\` VARCHAR(32) NULL,
      \`requires_approval\` BOOLEAN NOT NULL DEFAULT false,
      \`created_by\` VARCHAR(191) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`planning_drivers_model_code_idx\` (\`model_id\`, \`code\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_cells",
    `CREATE TABLE \`planning_cells\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`scenario_id\` VARCHAR(191) NOT NULL,
      \`version_id\` VARCHAR(191) NOT NULL,
      \`line_item_id\` VARCHAR(191) NOT NULL,
      \`period_date\` DATE NOT NULL,
      \`entity_id\` VARCHAR(191) NULL,
      \`department_id\` VARCHAR(191) NULL,
      \`cost_centre_id\` VARCHAR(191) NULL,
      \`account_id\` VARCHAR(191) NULL,
      \`currency_code\` VARCHAR(3) NOT NULL,
      \`value\` DECIMAL(20, 4) NULL,
      \`value_type\` VARCHAR(50) NOT NULL,
      \`source_type\` VARCHAR(50) NOT NULL,
      \`is_editable\` BOOLEAN NOT NULL DEFAULT true,
      \`is_locked\` BOOLEAN NOT NULL DEFAULT false,
      \`formula_id\` VARCHAR(191) NULL,
      \`driver_id\` VARCHAR(191) NULL,
      \`last_updated_by\` VARCHAR(191) NULL,
      \`last_updated_at\` DATETIME(3) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`planning_cells_mvs_idx\` (\`model_id\`, \`version_id\`, \`scenario_id\`),
      INDEX \`planning_cells_line_period_idx\` (\`model_id\`, \`line_item_id\`, \`period_date\`),
      INDEX \`planning_cells_version_locked_idx\` (\`version_id\`, \`is_locked\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_actuals_snapshots",
    `CREATE TABLE \`planning_actuals_snapshots\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`period_date\` DATE NOT NULL,
      \`entity_id\` VARCHAR(191) NULL,
      \`account_id\` VARCHAR(191) NULL,
      \`line_item_id\` VARCHAR(191) NULL,
      \`currency_code\` VARCHAR(3) NOT NULL,
      \`amount\` DECIMAL(20, 4) NOT NULL,
      \`source_module\` VARCHAR(64) NOT NULL,
      \`import_job_id\` VARCHAR(191) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`planning_actuals_model_period_idx\` (\`model_id\`, \`period_date\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_variance_results",
    `CREATE TABLE \`planning_variance_results\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`line_item_id\` VARCHAR(191) NOT NULL,
      \`period_date\` DATE NOT NULL,
      \`entity_id\` VARCHAR(191) NULL,
      \`department_id\` VARCHAR(191) NULL,
      \`variance_type\` VARCHAR(50) NOT NULL,
      \`actual_value\` DECIMAL(20, 4) NULL,
      \`plan_value\` DECIMAL(20, 4) NULL,
      \`variance_amount\` DECIMAL(20, 4) NOT NULL,
      \`variance_percent\` DECIMAL(12, 4) NULL,
      \`direction\` VARCHAR(20) NOT NULL,
      \`commentary_required\` BOOLEAN NOT NULL DEFAULT false,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`planning_variance_model_type_idx\` (\`model_id\`, \`variance_type\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_comments",
    `CREATE TABLE \`planning_comments\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`cell_id\` VARCHAR(191) NULL,
      \`variance_id\` VARCHAR(191) NULL,
      \`body\` TEXT NOT NULL,
      \`corrective_action\` TEXT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
      \`created_by\` VARCHAR(191) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`planning_comments_model_idx\` (\`model_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_workflows",
    `CREATE TABLE \`planning_workflows\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`workflow_type\` VARCHAR(50) NOT NULL,
      \`stage\` VARCHAR(50) NOT NULL DEFAULT 'SETUP',
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
      \`start_date\` DATE NULL,
      \`end_date\` DATE NULL,
      \`created_by\` VARCHAR(191) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`planning_workflows_model_status_idx\` (\`model_id\`, \`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_tasks",
    `CREATE TABLE \`planning_tasks\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`workflow_id\` VARCHAR(191) NOT NULL,
      \`title\` VARCHAR(255) NOT NULL,
      \`department_id\` VARCHAR(191) NULL,
      \`assignee_id\` VARCHAR(191) NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      \`priority\` VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
      \`due_date\` DATE NULL,
      \`submitted_at\` DATETIME(3) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`planning_tasks_assignee_status_idx\` (\`assignee_id\`, \`status\`),
      INDEX \`planning_tasks_workflow_idx\` (\`workflow_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_approvals",
    `CREATE TABLE \`planning_approvals\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`workflow_id\` VARCHAR(191) NOT NULL,
      \`task_id\` VARCHAR(191) NULL,
      \`actor_id\` VARCHAR(191) NOT NULL,
      \`action\` VARCHAR(32) NOT NULL,
      \`comment\` TEXT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`planning_approvals_workflow_idx\` (\`workflow_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_import_jobs",
    `CREATE TABLE \`planning_import_jobs\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`source_module\` VARCHAR(64) NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      \`period_start\` DATE NULL,
      \`period_end\` DATE NULL,
      \`row_count\` INT NULL,
      \`error_message\` TEXT NULL,
      \`created_by\` VARCHAR(191) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`completed_at\` DATETIME(3) NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`planning_import_jobs_model_status_idx\` (\`model_id\`, \`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_export_jobs",
    `CREATE TABLE \`planning_export_jobs\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`version_id\` VARCHAR(191) NULL,
      \`export_type\` VARCHAR(64) NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      \`file_url\` VARCHAR(1024) NULL,
      \`payload_json\` JSON NULL,
      \`created_by\` VARCHAR(191) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`completed_at\` DATETIME(3) NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`planning_export_jobs_model_idx\` (\`model_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_audit_logs",
    `CREATE TABLE \`planning_audit_logs\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NULL,
      \`scenario_id\` VARCHAR(191) NULL,
      \`version_id\` VARCHAR(191) NULL,
      \`cell_id\` VARCHAR(191) NULL,
      \`user_id\` VARCHAR(191) NOT NULL,
      \`action_type\` VARCHAR(100) NOT NULL,
      \`old_value\` TEXT NULL,
      \`new_value\` TEXT NULL,
      \`reason\` TEXT NULL,
      \`ip_address\` VARCHAR(100) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`planning_audit_model_created_idx\` (\`model_id\`, \`created_at\`),
      INDEX \`planning_audit_action_idx\` (\`action_type\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_locks",
    `CREATE TABLE \`planning_locks\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`version_id\` VARCHAR(191) NULL,
      \`period_date\` DATE NULL,
      \`lock_type\` VARCHAR(32) NOT NULL,
      \`locked_by\` VARCHAR(191) NOT NULL,
      \`locked_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`reason\` TEXT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`planning_locks_model_type_idx\` (\`model_id\`, \`lock_type\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_ai_forecasts",
    `CREATE TABLE \`planning_ai_forecasts\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`suggestion_type\` VARCHAR(64) NOT NULL,
      \`payload_json\` JSON NOT NULL,
      \`confidence\` DECIMAL(8, 4) NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
      \`created_by\` VARCHAR(191) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`planning_ai_model_type_idx\` (\`model_id\`, \`suggestion_type\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  console.log("FPA planning migration complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
