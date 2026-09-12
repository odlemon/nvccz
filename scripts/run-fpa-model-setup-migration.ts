/**
 * FP&A model setup — scope / COA / dimension members / baseline columns.
 * Idempotent. Run: npm run db:migrate:fpa-model-setup
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

async function createTable(name: string, ddl: string) {
  if (await tableExists(name)) {
    console.log(`[skip] ${name}`);
    return;
  }
  await prisma.$executeRawUnsafe(ddl);
  console.log(`[ok] ${name}`);
}

async function addColumnIfMissing(table: string, column: string, definition: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`[ok] ${table}.${column}`);
}

async function main() {
  await addColumnIfMissing("planning_models", "baseline_mode", "VARCHAR(32) NULL");
  await addColumnIfMissing("planning_models", "baseline_source_version_id", "VARCHAR(191) NULL");
  await addColumnIfMissing("planning_models", "baseline_source_scenario_id", "VARCHAR(191) NULL");

  await createTable(
    "planning_model_entities",
    `CREATE TABLE \`planning_model_entities\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`entity_id\` VARCHAR(191) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`planning_model_entities_key\` (\`model_id\`, \`entity_id\`),
      INDEX \`planning_model_entities_model_idx\` (\`model_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_model_departments",
    `CREATE TABLE \`planning_model_departments\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`department_id\` VARCHAR(191) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`planning_model_departments_key\` (\`model_id\`, \`department_id\`),
      INDEX \`planning_model_departments_model_idx\` (\`model_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_model_accounts",
    `CREATE TABLE \`planning_model_accounts\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`entity_id\` VARCHAR(191) NULL,
      \`account_id\` VARCHAR(191) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`planning_model_accounts_key\` (\`model_id\`, \`account_id\`),
      INDEX \`planning_model_accounts_model_idx\` (\`model_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "planning_model_dimension_members",
    `CREATE TABLE \`planning_model_dimension_members\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`model_id\` VARCHAR(191) NOT NULL,
      \`dimension_id\` VARCHAR(191) NOT NULL,
      \`member_id\` VARCHAR(191) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`planning_model_dim_members_key\` (\`model_id\`, \`dimension_id\`, \`member_id\`),
      INDEX \`planning_model_dim_members_model_idx\` (\`model_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  console.log("FP&A model setup migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
