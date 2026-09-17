/**
 * Performance <-> FP&A integration tables (SRD-4 §22): Target Mapping,
 * Driver Mapping, Forecast Review Triggers, and two snapshot tables.
 * Idempotent: skips if tables exist. No Prisma migrate.
 *
 * Run: npm run db:migrate:performance-fpa-integration
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

async function main() {
  if (!(await tableExists("performance_fpa_target_mappings"))) {
    await prisma.$executeRawUnsafe(`
CREATE TABLE \`performance_fpa_target_mappings\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`kpi_id\` VARCHAR(191) NOT NULL,
  \`model_id\` VARCHAR(191) NOT NULL,
  \`line_item_id\` VARCHAR(191) NOT NULL,
  \`target_source_version_id\` VARCHAR(191) NULL,
  \`target_mapping_method\` VARCHAR(32) NOT NULL DEFAULT 'FULL_YEAR_VALUE',
  \`is_active\` BOOLEAN NOT NULL DEFAULT true,
  \`created_by_id\` VARCHAR(191) NOT NULL,
  \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  INDEX \`performance_fpa_target_mappings_kpi_idx\` (\`kpi_id\`),
  INDEX \`performance_fpa_target_mappings_model_idx\` (\`model_id\`),
  CONSTRAINT \`pfa_target_mappings_kpi_fk\` FOREIGN KEY (\`kpi_id\`) REFERENCES \`kpis\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`pfa_target_mappings_model_fk\` FOREIGN KEY (\`model_id\`) REFERENCES \`planning_models\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`pfa_target_mappings_line_item_fk\` FOREIGN KEY (\`line_item_id\`) REFERENCES \`planning_line_items\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`pfa_target_mappings_version_fk\` FOREIGN KEY (\`target_source_version_id\`) REFERENCES \`planning_versions\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`pfa_target_mappings_user_fk\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
`);
    console.log("[ok] created performance_fpa_target_mappings");
  } else {
    console.log("[skip] performance_fpa_target_mappings already exists");
  }

  if (!(await tableExists("performance_fpa_driver_mappings"))) {
    await prisma.$executeRawUnsafe(`
CREATE TABLE \`performance_fpa_driver_mappings\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`kpi_id\` VARCHAR(191) NOT NULL,
  \`model_id\` VARCHAR(191) NOT NULL,
  \`line_item_id\` VARCHAR(191) NOT NULL,
  \`threshold_pct\` DECIMAL(7,4) NOT NULL DEFAULT 70.00,
  \`consecutive_periods\` INT NOT NULL DEFAULT 1,
  \`is_active\` BOOLEAN NOT NULL DEFAULT true,
  \`created_by_id\` VARCHAR(191) NOT NULL,
  \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  INDEX \`performance_fpa_driver_mappings_kpi_idx\` (\`kpi_id\`),
  CONSTRAINT \`pfa_driver_mappings_kpi_fk\` FOREIGN KEY (\`kpi_id\`) REFERENCES \`kpis\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`pfa_driver_mappings_model_fk\` FOREIGN KEY (\`model_id\`) REFERENCES \`planning_models\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`pfa_driver_mappings_line_item_fk\` FOREIGN KEY (\`line_item_id\`) REFERENCES \`planning_line_items\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`pfa_driver_mappings_user_fk\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
`);
    console.log("[ok] created performance_fpa_driver_mappings");
  } else {
    console.log("[skip] performance_fpa_driver_mappings already exists");
  }

  if (!(await tableExists("performance_forecast_review_triggers"))) {
    await prisma.$executeRawUnsafe(`
CREATE TABLE \`performance_forecast_review_triggers\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`kpi_id\` VARCHAR(191) NOT NULL,
  \`performance_goal_id\` VARCHAR(191) NOT NULL,
  \`kpi_owner_id\` VARCHAR(191) NULL,
  \`performance_period\` VARCHAR(20) NOT NULL,
  \`target_value\` DECIMAL(18,6) NULL,
  \`actual_value\` DECIMAL(18,6) NULL,
  \`achievement_pct\` DECIMAL(7,4) NULL,
  \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
  \`driver_mapping_id\` VARCHAR(191) NULL,
  \`current_driver_value\` DECIMAL(18,6) NULL,
  \`trigger_reason\` TEXT NULL,
  \`trigger_date\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`fpa_reviewer_id\` VARCHAR(191) NULL,
  \`review_status\` VARCHAR(32) NULL,
  \`review_decision\` TEXT NULL,
  \`resulting_forecast_version_id\` VARCHAR(191) NULL,
  \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  INDEX \`performance_forecast_review_triggers_kpi_idx\` (\`kpi_id\`),
  INDEX \`performance_forecast_review_triggers_status_idx\` (\`status\`),
  CONSTRAINT \`pfa_review_triggers_kpi_fk\` FOREIGN KEY (\`kpi_id\`) REFERENCES \`kpis\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`pfa_review_triggers_goal_fk\` FOREIGN KEY (\`performance_goal_id\`) REFERENCES \`performance_goals\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`pfa_review_triggers_owner_fk\` FOREIGN KEY (\`kpi_owner_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`pfa_review_triggers_driver_map_fk\` FOREIGN KEY (\`driver_mapping_id\`) REFERENCES \`performance_fpa_driver_mappings\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`pfa_review_triggers_reviewer_fk\` FOREIGN KEY (\`fpa_reviewer_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`pfa_review_triggers_version_fk\` FOREIGN KEY (\`resulting_forecast_version_id\`) REFERENCES \`planning_versions\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
`);
    console.log("[ok] created performance_forecast_review_triggers");
  } else {
    console.log("[skip] performance_forecast_review_triggers already exists");
  }

  if (!(await tableExists("performance_financial_target_snapshots"))) {
    await prisma.$executeRawUnsafe(`
CREATE TABLE \`performance_financial_target_snapshots\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`target_mapping_id\` VARCHAR(191) NOT NULL,
  \`performance_goal_id\` VARCHAR(191) NULL,
  \`source_version_id\` VARCHAR(191) NOT NULL,
  \`snapshot_value\` DECIMAL(18,6) NOT NULL,
  \`applied_to_goal\` BOOLEAN NOT NULL DEFAULT false,
  \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  INDEX \`performance_financial_target_snapshots_mapping_idx\` (\`target_mapping_id\`),
  CONSTRAINT \`pfa_target_snapshots_mapping_fk\` FOREIGN KEY (\`target_mapping_id\`) REFERENCES \`performance_fpa_target_mappings\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`pfa_target_snapshots_goal_fk\` FOREIGN KEY (\`performance_goal_id\`) REFERENCES \`performance_goals\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`pfa_target_snapshots_version_fk\` FOREIGN KEY (\`source_version_id\`) REFERENCES \`planning_versions\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
`);
    console.log("[ok] created performance_financial_target_snapshots");
  } else {
    console.log("[skip] performance_financial_target_snapshots already exists");
  }

  if (!(await tableExists("performance_forecast_snapshots"))) {
    await prisma.$executeRawUnsafe(`
CREATE TABLE \`performance_forecast_snapshots\` (
  \`id\` VARCHAR(191) NOT NULL,
  \`kpi_id\` VARCHAR(191) NOT NULL,
  \`performance_goal_id\` VARCHAR(191) NULL,
  \`model_id\` VARCHAR(191) NOT NULL,
  \`source_version_id\` VARCHAR(191) NOT NULL,
  \`forecast_value\` DECIMAL(18,6) NOT NULL,
  \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (\`id\`),
  INDEX \`performance_forecast_snapshots_kpi_idx\` (\`kpi_id\`),
  CONSTRAINT \`pfa_forecast_snapshots_kpi_fk\` FOREIGN KEY (\`kpi_id\`) REFERENCES \`kpis\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`pfa_forecast_snapshots_goal_fk\` FOREIGN KEY (\`performance_goal_id\`) REFERENCES \`performance_goals\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT \`pfa_forecast_snapshots_model_fk\` FOREIGN KEY (\`model_id\`) REFERENCES \`planning_models\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT \`pfa_forecast_snapshots_version_fk\` FOREIGN KEY (\`source_version_id\`) REFERENCES \`planning_versions\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
`);
    console.log("[ok] created performance_forecast_snapshots");
  } else {
    console.log("[skip] performance_forecast_snapshots already exists");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
