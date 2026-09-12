/**
 * Investment report run scope columns + widen report_type.
 * Usage: npm run db:migrate:investment-report-run-scope
 */
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

async function addColumnIfMissing(table: string, column: string, definition: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`[ok] ${table}.${column}`);
}

async function modifyColumnIfNeeded(table: string, column: string, definition: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ col: string }>>(
    `SELECT COLUMN_TYPE AS col FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  const current = String(rows[0]?.col || "").toLowerCase();
  if (current.includes("varchar(64)")) {
    console.log(`[skip] ${table}.${column} already VARCHAR(64)`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` MODIFY COLUMN \`${column}\` ${definition}`);
  console.log(`[ok] modify ${table}.${column}`);
}

async function main() {
  const table = "investment_report_runs";
  await addColumnIfMissing(table, "client_id", "VARCHAR(191) NULL");
  await addColumnIfMissing(table, "scope_type", "VARCHAR(32) NULL");
  await modifyColumnIfNeeded(table, "report_type", "VARCHAR(64) NOT NULL");
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
