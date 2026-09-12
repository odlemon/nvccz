/**
 * financial_reports.reportType is often still MySQL ENUM('BALANCE_SHEET','INCOME_STATEMENT','CASHFLOW_STATEMENT'),
 * which rejects Arcus types (e.g. INCOME_STATEMENTS). Widen to VARCHAR(64). Idempotent (MySQL).
 *
 * Run: npm run db:migrate:financial-reports-report-type-varchar
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const table = "financial_reports";
  if (!(await tableExists(table))) {
    throw new Error(`Table ${table} does not exist.`);
  }

  const rows = await prisma.$queryRawUnsafe<Array<{ DATA_TYPE: string; COLUMN_TYPE: string }>>(
    `SELECT DATA_TYPE, COLUMN_TYPE
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = 'reportType'`,
    table
  );
  const dataType = String(rows[0]?.DATA_TYPE ?? "").toLowerCase();
  if (!dataType) {
    throw new Error("Column financial_reports.reportType not found.");
  }

  if (dataType === "varchar") {
    console.log("[skip] financial_reports.reportType is already VARCHAR");
    return;
  }

  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${table}\`
       MODIFY COLUMN \`reportType\` VARCHAR(64) COLLATE utf8mb4_unicode_ci NOT NULL`
  );
  console.log("[ok] financial_reports.reportType is now VARCHAR(64) (supports INCOME_STATEMENTS, etc.)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
