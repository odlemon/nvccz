/**
 * Adds `performance_goals.pillar_id` (stable BSC slug) and backfills from `scorecard_pillar`.
 * Idempotent. Does not use Prisma migrations.
 *
 * Run: npm run db:migrate:performance-goal-pillar-id
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

async function main() {
  const table = "performance_goals";
  const col = "pillar_id";

  if (!(await columnExists(table, col))) {
    await execute(
      `ALTER TABLE \`${table}\` ADD COLUMN \`${col}\` VARCHAR(191) NULL COMMENT 'BSC pillar slug (aligned with scorecard_pillar)'`
    );
    console.log(`[ok] added ${table}.${col}`);
  } else {
    console.log(`[skip] ${table}.${col} already exists`);
  }

  const connection = await getConnection();
  // Prisma field `scorecardPillar` has no @map — MySQL column is camelCase like other performance_goals cols.
  const [res] = await connection.query(
    `UPDATE \`${table}\` SET \`${col}\` = CASE \`scorecardPillar\`
        WHEN 'Financial' THEN 'bsc_financial'
        WHEN 'Customer & Market' THEN 'bsc_customer_market'
        WHEN 'Internal Operations' THEN 'bsc_internal_operations'
        WHEN 'Learning, Growth & HR' THEN 'bsc_learning_growth_hr'
        ELSE NULL
      END
      WHERE (\`${col}\` IS NULL OR \`${col}\` = '')
        AND \`scorecardPillar\` IS NOT NULL`
  );
  const header = res as import("mysql2").ResultSetHeader;
  console.log(`[ok] pillar_id backfill affected ${header.affectedRows} row(s)`);

  await getConnection().then((c) => c.end());
  directConnection = null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
