/**
 * Forecasting Engine — hypercube tables (MySQL). Idempotent.
 * Run: npm run db:migrate:forecasting-engine
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
  if (!(await tableExists("forecast_scenarios"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`forecast_scenarios\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(512) NOT NULL,
        \`description\` TEXT NULL,
        \`entity_id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NULL,
        \`base_currency\` VARCHAR(3) NOT NULL,
        \`horizon_start_date\` DATE NOT NULL,
        \`horizon_end_date\` DATE NOT NULL,
        \`granularity\` VARCHAR(16) NOT NULL,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
        \`version_label\` VARCHAR(255) NULL,
        \`locked_at\` DATETIME(3) NULL,
        \`locked_by_id\` VARCHAR(191) NULL,
        \`last_gl_sync_at\` DATETIME(3) NULL,
        \`last_compute_at\` DATETIME(3) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`forecast_scenarios_entity_status_idx\` (\`entity_id\`, \`status\`),
        INDEX \`forecast_scenarios_fund_status_idx\` (\`fund_id\`, \`status\`),
        INDEX \`forecast_scenarios_created_by_idx\` (\`created_by_id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created forecast_scenarios");
  } else {
    console.log("[skip] forecast_scenarios exists");
  }

  if (!(await tableExists("forecast_dimensions"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`forecast_dimensions\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`scenario_id\` VARCHAR(191) NOT NULL,
        \`dimension_type\` VARCHAR(64) NOT NULL,
        \`value_id\` VARCHAR(191) NOT NULL,
        \`range_start\` INT NULL,
        \`range_end\` INT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`forecast_dimensions_scenario_type_value_key\` (\`scenario_id\`, \`dimension_type\`, \`value_id\`),
        INDEX \`forecast_dimensions_scenario_idx\` (\`scenario_id\`),
        CONSTRAINT \`forecast_dimensions_scenario_fk\` FOREIGN KEY (\`scenario_id\`) REFERENCES \`forecast_scenarios\`(\`id\`) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created forecast_dimensions");
  } else {
    console.log("[skip] forecast_dimensions exists");
  }

  if (!(await tableExists("forecast_cells"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`forecast_cells\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`scenario_id\` VARCHAR(191) NOT NULL,
        \`period_key\` VARCHAR(32) NOT NULL,
        \`account_id\` VARCHAR(191) NOT NULL,
        \`entity_id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL DEFAULT '',
        \`portfolio_company_id\` VARCHAR(191) NOT NULL DEFAULT '',
        \`analytical_tag\` VARCHAR(191) NOT NULL DEFAULT '',
        \`natural_key_hash\` CHAR(64) NOT NULL,
        \`forecast_value\` DECIMAL(15,3) NOT NULL DEFAULT 0,
        \`actual_value_override\` DECIMAL(15,3) NULL,
        \`tx_currency\` VARCHAR(3) NOT NULL,
        \`tx_currency_value\` DECIMAL(15,3) NOT NULL DEFAULT 0,
        \`base_currency_value\` DECIMAL(15,3) NOT NULL DEFAULT 0,
        \`projected_rate\` DECIMAL(18,8) NULL,
        \`actual_rate\` DECIMAL(18,8) NULL,
        \`variance_absolute\` DECIMAL(15,3) NULL,
        \`variance_percent\` DECIMAL(8,4) NULL,
        \`is_manual_override\` BOOLEAN NOT NULL DEFAULT false,
        \`last_edited_by_id\` VARCHAR(191) NULL,
        \`last_edited_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`forecast_cells_natural_key_hash\` (\`natural_key_hash\`),
        INDEX \`forecast_cells_scenario_period_idx\` (\`scenario_id\`, \`period_key\`),
        INDEX \`forecast_cells_scenario_account_idx\` (\`scenario_id\`, \`account_id\`),
        CONSTRAINT \`forecast_cells_scenario_fk\` FOREIGN KEY (\`scenario_id\`) REFERENCES \`forecast_scenarios\`(\`id\`) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created forecast_cells");
  } else {
    console.log("[skip] forecast_cells exists");
  }

  if (!(await tableExists("forecast_drivers"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`forecast_drivers\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`scenario_id\` VARCHAR(191) NOT NULL,
        \`target_account_range_start\` INT NOT NULL,
        \`target_account_range_end\` INT NOT NULL,
        \`driver_type\` VARCHAR(64) NOT NULL,
        \`formula_expression\` TEXT NOT NULL,
        \`parameters\` JSON NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`forecast_drivers_scenario_idx\` (\`scenario_id\`),
        CONSTRAINT \`forecast_drivers_scenario_fk\` FOREIGN KEY (\`scenario_id\`) REFERENCES \`forecast_scenarios\`(\`id\`) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created forecast_drivers");
  } else {
    console.log("[skip] forecast_drivers exists");
  }

  if (!(await tableExists("forecast_versions"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`forecast_versions\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`scenario_id\` VARCHAR(191) NOT NULL,
        \`version_label\` VARCHAR(255) NOT NULL,
        \`snapshot_payload\` JSON NOT NULL,
        \`checksum_sha256\` VARCHAR(64) NULL,
        \`locked_by_id\` VARCHAR(191) NOT NULL,
        \`locked_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`forecast_versions_scenario_idx\` (\`scenario_id\`),
        CONSTRAINT \`forecast_versions_scenario_fk\` FOREIGN KEY (\`scenario_id\`) REFERENCES \`forecast_scenarios\`(\`id\`) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created forecast_versions");
  } else {
    console.log("[skip] forecast_versions exists");
  }

  if (!(await tableExists("forecast_audit_logs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`forecast_audit_logs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`scenario_id\` VARCHAR(191) NOT NULL,
        \`user_id\` VARCHAR(191) NULL,
        \`action_type\` VARCHAR(64) NOT NULL,
        \`delta_payload\` JSON NOT NULL,
        \`priority\` VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`forecast_audit_scenario_created_idx\` (\`scenario_id\`, \`created_at\`),
        INDEX \`forecast_audit_action_priority_idx\` (\`action_type\`, \`priority\`),
        CONSTRAINT \`forecast_audit_scenario_fk\` FOREIGN KEY (\`scenario_id\`) REFERENCES \`forecast_scenarios\`(\`id\`) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created forecast_audit_logs");
  } else {
    console.log("[skip] forecast_audit_logs exists");
  }

  if (!(await tableExists("forecast_compute_jobs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`forecast_compute_jobs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`scenario_id\` VARCHAR(191) NOT NULL,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        \`trigger_type\` VARCHAR(64) NOT NULL,
        \`affected_cell_count\` INT NULL,
        \`duration_ms\` INT NULL,
        \`error_message\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`forecast_compute_jobs_scenario_idx\` (\`scenario_id\`),
        CONSTRAINT \`forecast_compute_jobs_scenario_fk\` FOREIGN KEY (\`scenario_id\`) REFERENCES \`forecast_scenarios\`(\`id\`) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created forecast_compute_jobs");
  } else {
    console.log("[skip] forecast_compute_jobs exists");
  }

  if (!(await tableExists("forecast_goal_links"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`forecast_goal_links\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`scenario_id\` VARCHAR(191) NOT NULL,
        \`performance_goal_id\` VARCHAR(191) NOT NULL,
        \`account_id\` VARCHAR(191) NULL,
        \`threshold_value\` DECIMAL(15,3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`forecast_goal_links_scenario_goal_key\` (\`scenario_id\`, \`performance_goal_id\`),
        CONSTRAINT \`forecast_goal_links_scenario_fk\` FOREIGN KEY (\`scenario_id\`) REFERENCES \`forecast_scenarios\`(\`id\`) ON DELETE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created forecast_goal_links");
  } else {
    console.log("[skip] forecast_goal_links exists");
  }

  console.log("\nForecasting engine migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
