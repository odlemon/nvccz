/**
 * Financial reports: add `reportingPeriod` (DATE) + performance indexes. Idempotent (MySQL).
 *
 * Run: npm run db:migrate:financial-reports-reporting-period
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

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    indexName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const table = "financial_reports";
  if (!(await tableExists(table))) {
    throw new Error(
      `Table ${table} does not exist. Create it first (see scripts/sql/add_financial_reports_table.sql).`
    );
  }

  if (!(await columnExists(table, "reportingPeriod"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${table}\` ADD COLUMN \`reportingPeriod\` DATE NULL AFTER \`periodEnd\``
    );
    console.log("[ok] added financial_reports.reportingPeriod");
  } else {
    console.log("[skip] financial_reports.reportingPeriod exists");
  }

  // Composite index for fast per-company per-period listing and required-doc validation.
  const idxCompanyPeriod = "financial_reports_company_reporting_period_idx";
  if (!(await indexExists(table, idxCompanyPeriod))) {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX \`${idxCompanyPeriod}\` ON \`${table}\`(\`portfolioCompanyId\`, \`reportingPeriod\`)`
    );
    console.log(`[ok] created index ${idxCompanyPeriod}`);
  } else {
    console.log(`[skip] index ${idxCompanyPeriod} exists`);
  }

  // Composite index for fast inbox/review queues.
  const idxStatusCreated = "financial_reports_status_createdAt_idx";
  if (!(await indexExists(table, idxStatusCreated))) {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX \`${idxStatusCreated}\` ON \`${table}\`(\`status\`, \`createdAt\`)`
    );
    console.log(`[ok] created index ${idxStatusCreated}`);
  } else {
    console.log(`[skip] index ${idxStatusCreated} exists`);
  }

  console.log("\nFinancial reports reportingPeriod migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

