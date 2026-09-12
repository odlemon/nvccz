/**
 * Adds backend-only UAT support for performance strategies, themes, sync jobs,
 * review documents, goal sync metadata, and immutable audit-log triggers.
 * Idempotent. Does not use Prisma migrations.
 *
 * Run: npm run db:migrate:performance-uat-backend
 */
import "dotenv/config";
import mysql from "mysql2/promise";

let directConnection: mysql.Connection | null = null;

async function getConnection() {
  if (!directConnection) {
    directConnection = await mysql.createConnection(process.env.DATABASE_URL || "");
  }

  return directConnection;
}

async function queryRows<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const connection = await getConnection();
  const [rows] = await connection.query(sql, params);
  return rows as T[];
}

async function execute(sql: string, params: any[] = []) {
  const connection = await getConnection();
  await connection.query(sql, params);
}

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const rows = await queryRows<Array<{ c: bigint }>[number]>(
    `SELECT COUNT(*) AS c
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );

  return Number(rows[0]?.c ?? 0) > 0;
}

async function tableExists(tableName: string): Promise<boolean> {
  const rows = await queryRows<Array<{ c: bigint }>[number]>(
    `SELECT COUNT(*) AS c
       FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?`,
    [tableName]
  );

  return Number(rows[0]?.c ?? 0) > 0;
}

async function triggerExists(triggerName: string): Promise<boolean> {
  const rows = await queryRows<Array<{ c: bigint }>[number]>(
    `SELECT COUNT(*) AS c
       FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA = DATABASE()
        AND TRIGGER_NAME = ?`,
    [triggerName]
  );

  return Number(rows[0]?.c ?? 0) > 0;
}

async function addColumnIfMissing(tableName: string, columnName: string, columnSql: string) {
  if (await columnExists(tableName, columnName)) {
    console.log(`[skip] ${tableName}.${columnName} already exists`);
    return;
  }

  await execute(`ALTER TABLE \`${tableName}\` ADD COLUMN ${columnSql}`);
  console.log(`[ok] added ${tableName}.${columnName}`);
}

async function addIndexIfMissing(tableName: string, indexName: string, indexSql: string) {
  const rows = await queryRows<Array<{ c: bigint }>[number]>(
    `SELECT COUNT(*) AS c
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?`,
    [tableName, indexName]
  );

  if (Number(rows[0]?.c ?? 0) > 0) {
    console.log(`[skip] index ${indexName} already exists on ${tableName}`);
    return;
  }

  await execute(`ALTER TABLE \`${tableName}\` ADD ${indexSql}`);
  console.log(`[ok] added index ${indexName} on ${tableName}`);
}

async function createTriggerIfMissing(triggerName: string, sql: string) {
  if (await triggerExists(triggerName)) {
    console.log(`[skip] trigger ${triggerName} already exists`);
    return;
  }

  try {
    await execute(sql);
    console.log(`[ok] created trigger ${triggerName}`);
  } catch (error: any) {
    console.warn(`[warn] could not create trigger ${triggerName}: ${error.message}`);
  }
}

async function main() {
  const performanceGoalColumns: Array<[string, string]> = [
    ["performanceContractId", "`performanceContractId` VARCHAR(191) NULL"],
    ["scorecardWeight", "`scorecardWeight` DECIMAL(7,4) NULL"],
    ["allowableVariance", "`allowableVariance` DECIMAL(7,4) NULL DEFAULT 0.1000"],
    ["isReverseKpi", "`isReverseKpi` BOOLEAN NOT NULL DEFAULT FALSE"],
    ["isPendingApproval", "`isPendingApproval` BOOLEAN NOT NULL DEFAULT FALSE"],
    ["formulaType", "`formulaType` VARCHAR(191) NULL"],
    ["measureName", "`measureName` VARCHAR(191) NULL"],
    ["scorecardSection", "`scorecardSection` VARCHAR(191) NULL"],
    ["scorecardPillar", "`scorecardPillar` VARCHAR(191) NULL"],
    ["displayOrder", "`displayOrder` INT NOT NULL DEFAULT 0"],
    ["strategyId", "`strategyId` VARCHAR(191) NULL"],
    ["strategicThemeId", "`strategicThemeId` VARCHAR(191) NULL"],
    ["requiresManagerApproval", "`requiresManagerApproval` BOOLEAN NOT NULL DEFAULT FALSE"],
    ["preciseTargetValue", "`preciseTargetValue` DECIMAL(18,6) NULL"],
    ["preciseCurrentValue", "`preciseCurrentValue` DECIMAL(18,6) NULL"],
    ["pendingActualValue", "`pendingActualValue` DECIMAL(18,6) NULL"],
    ["lastApprovedValue", "`lastApprovedValue` DECIMAL(18,6) NULL"],
    ["lastSyncedValue", "`lastSyncedValue` DECIMAL(18,6) NULL"],
    ["lastSyncedAt", "`lastSyncedAt` DATETIME(3) NULL"],
    ["lastSyncJobId", "`lastSyncJobId` VARCHAR(191) NULL"],
    ["syncEndpointPath", "`syncEndpointPath` TEXT NULL"],
    ["syncConfig", "`syncConfig` JSON NULL"],
    ["manualOverrideComment", "`manualOverrideComment` TEXT NULL"],
    ["manualOverrideById", "`manualOverrideById` VARCHAR(191) NULL"],
    ["manualOverrideAt", "`manualOverrideAt` DATETIME(3) NULL"],
    ["targetChangeReason", "`targetChangeReason` TEXT NULL"],
    ["weightChangeReason", "`weightChangeReason` TEXT NULL"]
  ];

  for (const [columnName, columnSql] of performanceGoalColumns) {
    await addColumnIfMissing("performance_goals", columnName, columnSql);
  }

  await addIndexIfMissing(
    "performance_goals",
    "performance_goals_strategy_theme_idx",
    "INDEX `performance_goals_strategy_theme_idx` (`strategyId`, `strategicThemeId`, `scorecardPillar`)"
  );

  const performanceReviewColumns: Array<[string, string]> = [
    ["ratingValue", "`ratingValue` INT NULL"],
    ["quantitativeSnapshot", "`quantitativeSnapshot` JSON NULL"],
    ["documentPath", "`documentPath` TEXT NULL"],
    ["documentStatus", "`documentStatus` VARCHAR(64) NOT NULL DEFAULT 'DRAFT'"],
    ["documentPayload", "`documentPayload` JSON NULL"],
    ["isLocked", "`isLocked` BOOLEAN NOT NULL DEFAULT FALSE"],
    ["lockedAt", "`lockedAt` DATETIME(3) NULL"],
    ["finalizedAt", "`finalizedAt` DATETIME(3) NULL"],
    ["finalizedById", "`finalizedById` VARCHAR(191) NULL"]
  ];

  for (const [columnName, columnSql] of performanceReviewColumns) {
    await addColumnIfMissing("performance_reviews", columnName, columnSql);
  }

  await addIndexIfMissing(
    "performance_reviews",
    "performance_reviews_document_status_idx",
    "INDEX `performance_reviews_document_status_idx` (`documentStatus`, `revieweeId`, `reviewPeriod`)"
  );

  const strategiesTableExisted = await tableExists("performance_strategies");
  await execute(`
    CREATE TABLE IF NOT EXISTS \`performance_strategies\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`title\` VARCHAR(255) NOT NULL,
      \`status\` VARCHAR(64) NOT NULL DEFAULT 'ACTIVE',
      \`periodStart\` DATETIME(3) NOT NULL,
      \`periodEnd\` DATETIME(3) NOT NULL,
      \`strategicGoalId\` VARCHAR(191) NULL,
      \`strategyDocumentUrl\` TEXT NULL,
      \`visionStatement\` TEXT NULL,
      \`pillarWeights\` JSON NULL,
      \`metadata\` JSON NULL,
      \`archivedAt\` DATETIME(3) NULL,
      \`createdById\` VARCHAR(191) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`performance_strategies_status_idx\` (\`status\`, \`periodStart\`, \`periodEnd\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log(strategiesTableExisted ? "[skip] performance_strategies table already present" : "[ok] created performance_strategies table");

  const themesTableExisted = await tableExists("performance_themes");
  await execute(`
    CREATE TABLE IF NOT EXISTS \`performance_themes\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`name\` VARCHAR(191) NOT NULL,
      \`description\` TEXT NULL,
      \`color\` VARCHAR(32) NULL,
      \`status\` VARCHAR(64) NOT NULL DEFAULT 'ACTIVE',
      \`createdById\` VARCHAR(191) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`performance_themes_name_key\` (\`name\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log(themesTableExisted ? "[skip] performance_themes table already present" : "[ok] created performance_themes table");

  const syncJobsTableExisted = await tableExists("performance_sync_jobs");
  await execute(`
    CREATE TABLE IF NOT EXISTS \`performance_sync_jobs\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`goalId\` VARCHAR(191) NULL,
      \`kpiId\` VARCHAR(191) NULL,
      \`jobType\` VARCHAR(64) NOT NULL,
      \`status\` VARCHAR(64) NOT NULL DEFAULT 'PENDING',
      \`targetEndpoint\` TEXT NOT NULL,
      \`errorCode\` VARCHAR(64) NULL,
      \`errorMessage\` TEXT NULL,
      \`payloadSummary\` JSON NULL,
      \`requestPayload\` JSON NULL,
      \`responsePayload\` JSON NULL,
      \`attempts\` INT NOT NULL DEFAULT 0,
      \`nextRetryAt\` DATETIME(3) NULL,
      \`startedAt\` DATETIME(3) NULL,
      \`finishedAt\` DATETIME(3) NULL,
      \`approvalStatus\` VARCHAR(64) NOT NULL DEFAULT 'NOT_REQUIRED',
      \`approvedById\` VARCHAR(191) NULL,
      \`overrideComment\` TEXT NULL,
      \`createdById\` VARCHAR(191) NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`performance_sync_jobs_goal_idx\` (\`goalId\`, \`status\`, \`createdAt\`),
      KEY \`performance_sync_jobs_kpi_idx\` (\`kpiId\`, \`approvalStatus\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  console.log(syncJobsTableExisted ? "[skip] performance_sync_jobs table already present" : "[ok] created performance_sync_jobs table");

  await createTriggerIfMissing(
    "audit_logs_prevent_update",
    `
      CREATE TRIGGER \`audit_logs_prevent_update\`
      BEFORE UPDATE ON \`audit_logs\`
      FOR EACH ROW
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'audit_logs are immutable and cannot be updated'
    `
  );

  await createTriggerIfMissing(
    "audit_logs_prevent_delete",
    `
      CREATE TRIGGER \`audit_logs_prevent_delete\`
      BEFORE DELETE ON \`audit_logs\`
      FOR EACH ROW
      SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'audit_logs are immutable and cannot be deleted'
    `
  );

  console.log("\nPerformance backend UAT schema update finished.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (directConnection) {
      await directConnection.end();
    }
  });
