/**
 * FP&A Model Builder — Detailed Workspace (A.4):
 * audit context columns, last_calculated_at, data sources / mappings tables.
 * Idempotent. Run: npm run db:migrate:fpa-detailed-workspace
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
  await addColumnIfMissing("planning_audit_logs", "line_item_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("planning_audit_logs", "module_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("planning_audit_logs", "entity_type", "VARCHAR(64) NULL");
  await addIndexIfMissing(
    "planning_audit_logs",
    "planning_audit_module_idx",
    "CREATE INDEX `planning_audit_module_idx` ON `planning_audit_logs` (`module_id`)"
  );
  await addIndexIfMissing(
    "planning_audit_logs",
    "planning_audit_line_item_idx",
    "CREATE INDEX `planning_audit_line_item_idx` ON `planning_audit_logs` (`line_item_id`)"
  );
  await addIndexIfMissing(
    "planning_audit_logs",
    "planning_audit_entity_type_idx",
    "CREATE INDEX `planning_audit_entity_type_idx` ON `planning_audit_logs` (`entity_type`)"
  );

  await addColumnIfMissing("planning_cells", "last_calculated_at", "DATETIME(3) NULL");

  if (!(await tableExists("planning_data_sources"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`planning_data_sources\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`model_id\` VARCHAR(191) NOT NULL,
        \`system_code\` VARCHAR(64) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`connector_config\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`planning_data_sources_model_system_key\` (\`model_id\`, \`system_code\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] planning_data_sources");
  } else {
    console.log("[skip] planning_data_sources");
  }

  if (!(await tableExists("planning_source_fields"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`planning_source_fields\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`data_source_id\` VARCHAR(191) NOT NULL,
        \`field_key\` VARCHAR(255) NOT NULL,
        \`data_type\` VARCHAR(64) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`planning_source_fields_ds_key\` (\`data_source_id\`, \`field_key\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] planning_source_fields");
  } else {
    console.log("[skip] planning_source_fields");
  }

  if (!(await tableExists("planning_line_item_mappings"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`planning_line_item_mappings\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`model_id\` VARCHAR(191) NOT NULL,
        \`source_field_id\` VARCHAR(191) NOT NULL,
        \`line_item_id\` VARCHAR(191) NULL,
        \`module_id\` VARCHAR(191) NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'UNMAPPED',
        \`mapped_at\` DATETIME(3) NULL,
        \`mapped_by\` VARCHAR(191) NULL,
        \`last_synced_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`planning_li_mappings_model_module_idx\` (\`model_id\`, \`module_id\`),
        INDEX \`planning_li_mappings_model_status_idx\` (\`model_id\`, \`status\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] planning_line_item_mappings");
  } else {
    console.log("[skip] planning_line_item_mappings");
    await addIndexIfMissing(
      "planning_line_item_mappings",
      "planning_li_mappings_model_module_idx",
      "CREATE INDEX `planning_li_mappings_model_module_idx` ON `planning_line_item_mappings` (`model_id`, `module_id`)"
    );
    await addIndexIfMissing(
      "planning_line_item_mappings",
      "planning_li_mappings_model_status_idx",
      "CREATE INDEX `planning_li_mappings_model_status_idx` ON `planning_line_item_mappings` (`model_id`, `status`)"
    );
  }

  console.log("FP&A detailed workspace migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
