/**
 * Adds scorecard contract/storage tables and supporting performance goal columns.
 * Idempotent. Does not use Prisma migrations.
 *
 * Run: npm run db:migrate:performance-scorecards
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    tableName,
    columnName
  );

  return Number(rows[0]?.c ?? 0) > 0;
}

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    tableName
  );

  return Number(rows[0]?.c ?? 0) > 0;
}

async function addColumnIfMissing(tableName: string, columnName: string, columnSql: string) {
  if (await columnExists(tableName, columnName)) {
    console.log(`[skip] ${tableName}.${columnName} already exists`);
    return;
  }

  await prisma.$executeRawUnsafe(`ALTER TABLE \`${tableName}\` ADD COLUMN ${columnSql}`);
  console.log(`[ok] added ${tableName}.${columnName}`);
}

async function addIndexIfMissing(tableName: string, indexName: string, indexSql: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?`,
    tableName,
    indexName
  );

  if (Number(rows[0]?.c ?? 0) > 0) {
    console.log(`[skip] index ${indexName} already exists on ${tableName}`);
    return;
  }

  await prisma.$executeRawUnsafe(`ALTER TABLE \`${tableName}\` ADD ${indexSql}`);
  console.log(`[ok] added index ${indexName} on ${tableName}`);
}

async function main() {
  await addColumnIfMissing(
    "employees",
    "line_manager_user_id",
    "`line_manager_user_id` VARCHAR(191) NULL"
  );
  await addIndexIfMissing(
    "employees",
    "employees_line_manager_user_id_idx",
    "INDEX `employees_line_manager_user_id_idx` (`line_manager_user_id`)"
  );

  await addColumnIfMissing(
    "performance_goals",
    "performanceContractId",
    "`performanceContractId` VARCHAR(191) NULL"
  );
  await addColumnIfMissing(
    "performance_goals",
    "scorecardWeight",
    "`scorecardWeight` DECIMAL(7,4) NULL"
  );
  await addColumnIfMissing(
    "performance_goals",
    "allowableVariance",
    "`allowableVariance` DECIMAL(7,4) NULL DEFAULT 0.1000"
  );
  await addColumnIfMissing(
    "performance_goals",
    "isReverseKpi",
    "`isReverseKpi` BOOLEAN NOT NULL DEFAULT FALSE"
  );
  await addColumnIfMissing(
    "performance_goals",
    "isPendingApproval",
    "`isPendingApproval` BOOLEAN NOT NULL DEFAULT FALSE"
  );
  await addColumnIfMissing(
    "performance_goals",
    "formulaType",
    "`formulaType` VARCHAR(191) NULL"
  );
  await addColumnIfMissing(
    "performance_goals",
    "measureName",
    "`measureName` VARCHAR(191) NULL"
  );
  await addColumnIfMissing(
    "performance_goals",
    "scorecardSection",
    "`scorecardSection` VARCHAR(191) NULL"
  );
  await addColumnIfMissing(
    "performance_goals",
    "scorecardPillar",
    "`scorecardPillar` VARCHAR(191) NULL"
  );
  await addColumnIfMissing(
    "performance_goals",
    "displayOrder",
    "`displayOrder` INT NOT NULL DEFAULT 0"
  );
  await addIndexIfMissing(
    "performance_goals",
    "performance_goals_contract_idx",
    "INDEX `performance_goals_contract_idx` (`performanceContractId`)"
  );
  await addIndexIfMissing(
    "performance_goals",
    "performance_goals_section_idx",
    "INDEX `performance_goals_section_idx` (`scorecardSection`, `scorecardPillar`)"
  );

  const contractTableExisted = await tableExists("performance_contracts");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`performance_contracts\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`contractType\` VARCHAR(191) NOT NULL,
      \`title\` VARCHAR(255) NOT NULL,
      \`status\` VARCHAR(64) NOT NULL DEFAULT 'ACTIVE',
      \`periodLabel\` VARCHAR(191) NULL,
      \`periodStart\` DATETIME(3) NOT NULL,
      \`periodEnd\` DATETIME(3) NOT NULL,
      \`subjectUserId\` VARCHAR(191) NULL,
      \`departmentName\` VARCHAR(191) NULL,
      \`reviewerUserId\` VARCHAR(191) NULL,
      \`approverUserId\` VARCHAR(191) NULL,
      \`createdById\` VARCHAR(191) NOT NULL,
      \`allocatedBudget\` DECIMAL(15,2) NULL,
      \`actualSpend\` DECIMAL(15,2) NULL,
      \`stretchScoringEnabled\` BOOLEAN NOT NULL DEFAULT FALSE,
      \`strategyDocumentUrl\` TEXT NULL,
      \`visionStatement\` TEXT NULL,
      \`sectionWeights\` JSON NULL,
      \`qualitativeTemplate\` JSON NULL,
      \`metadata\` JSON NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`performance_contracts_subject_idx\` (\`subjectUserId\`, \`departmentName\`),
      KEY \`performance_contracts_period_idx\` (\`contractType\`, \`periodStart\`, \`periodEnd\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log(contractTableExisted ? "[skip] performance_contracts table already present" : "[ok] created performance_contracts table");

  const scorecardTableExisted = await tableExists("performance_scorecards");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS \`performance_scorecards\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`contractId\` VARCHAR(191) NULL,
      \`scorecardType\` VARCHAR(191) NOT NULL,
      \`status\` VARCHAR(64) NOT NULL DEFAULT 'DRAFT',
      \`subjectUserId\` VARCHAR(191) NULL,
      \`departmentName\` VARCHAR(191) NULL,
      \`generatedById\` VARCHAR(191) NOT NULL,
      \`finalisedById\` VARCHAR(191) NULL,
      \`periodLabel\` VARCHAR(191) NULL,
      \`periodStart\` DATETIME(3) NOT NULL,
      \`periodEnd\` DATETIME(3) NOT NULL,
      \`resultsDeliveryScore\` DECIMAL(6,2) NULL,
      \`budgetScore\` DECIMAL(6,2) NULL,
      \`finalScore\` DECIMAL(6,2) NULL,
      \`warnings\` JSON NULL,
      \`sections\` JSON NULL,
      \`matrixRows\` JSON NULL,
      \`rollupSummary\` JSON NULL,
      \`qualitativeSections\` JSON NULL,
      \`signatureState\` JSON NULL,
      \`documentPayload\` JSON NULL,
      \`isLocked\` BOOLEAN NOT NULL DEFAULT FALSE,
      \`documentLockedAt\` DATETIME(3) NULL,
      \`archivedAt\` DATETIME(3) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`performance_scorecards_subject_idx\` (\`scorecardType\`, \`subjectUserId\`, \`departmentName\`),
      KEY \`performance_scorecards_period_idx\` (\`periodStart\`, \`periodEnd\`),
      KEY \`performance_scorecards_status_idx\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log(scorecardTableExisted ? "[skip] performance_scorecards table already present" : "[ok] created performance_scorecards table");

  console.log("\nPerformance scorecards schema update finished.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
