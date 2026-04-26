/**
 * Adds `terminated`, `terminatedAt`, `terminationReason` to `employees` and backfills from `isActive`.
 * Idempotent: skips columns that already exist.
 *
 * Run: npm run db:migrate:employee-terminated
 * Then: npx prisma generate
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

async function addColumnIfMissing(
  table: string,
  column: string,
  definition: string,
  comment?: string
) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column} already exists`);
    return;
  }
  const sql = comment
    ? `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition} COMMENT '${comment.replace(/'/g, "''")}'`
    : `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`;
  await prisma.$executeRawUnsafe(sql);
  console.log(`[ok] added ${table}.${column}`);
}

async function main() {
  const table = "employees";

  await addColumnIfMissing(
    table,
    "terminated",
    "BOOLEAN NOT NULL DEFAULT FALSE",
    "Left company — excluded from payroll and scorecards"
  );
  await addColumnIfMissing(
    table,
    "terminatedAt",
    "DATETIME(3) NULL",
    "When the employee was marked terminated"
  );
  await addColumnIfMissing(
    table,
    "terminationReason",
    "TEXT NULL",
    "Optional HR reason / notes"
  );

  for (const col of ["terminated", "terminatedAt", "terminationReason"]) {
    if (!(await columnExists(table, col))) {
      throw new Error(`Missing column after migration: ${table}.${col}`);
    }
    console.log(`[verify OK] ${table}.${col}`);
  }

  if (await columnExists(table, "terminated") && (await columnExists(table, "isActive"))) {
    const backfill = await prisma.$executeRawUnsafe(
      `UPDATE \`${table}\` SET \`terminated\` = 1, \`terminatedAt\` = COALESCE(\`terminatedAt\`, \`updatedAt\`, NOW(3))
       WHERE \`isActive\` = 0 AND \`terminated\` = 0`
    );
    console.log(
      "[ok] backfill: inactive → terminated (affected row count is driver-dependent):",
      backfill
    );
  }

  console.log("\nEmployee terminated columns migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
