/**
 * Ensures `performance_goals.description` is MySQL TEXT (long objective / A.09 ~500+ words).
 * Idempotent. Does not use Prisma migrations.
 *
 * Run: npm run db:migrate:performance-goal-description-text
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

async function main() {
  const rows = await queryRows<{ DATA_TYPE: string; COLUMN_TYPE: string }>(
    `SELECT DATA_TYPE, COLUMN_TYPE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'performance_goals'
        AND COLUMN_NAME = 'description'`
  );

  if (rows.length === 0) {
    console.log("[warn] performance_goals.description column missing — add via Prisma/schema first");
    await getConnection().then((c) => c.end());
    directConnection = null;
    return;
  }

  const { DATA_TYPE, COLUMN_TYPE } = rows[0];
  const ok =
    DATA_TYPE === "text" ||
    DATA_TYPE === "mediumtext" ||
    DATA_TYPE === "longtext" ||
    COLUMN_TYPE?.toLowerCase().includes("text");

  if (ok) {
    console.log(`[skip] performance_goals.description already long text (${COLUMN_TYPE})`);
  } else {
    await execute(
      `ALTER TABLE \`performance_goals\` MODIFY COLUMN \`description\` TEXT NULL`
    );
    console.log(`[ok] performance_goals.description altered to TEXT (was ${COLUMN_TYPE})`);
  }

  await getConnection().then((c) => c.end());
  directConnection = null;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
