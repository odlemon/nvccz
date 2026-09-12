/**
 * Portfolio Funds schema:
 *   - funds.vintage_year / currency_code / geography (nullable)
 *   - fund_performance_snapshots (NAV / called / distributed / returns per fund per date)
 *   - fund_documents (fund document room)
 *
 * All additive and idempotent. Safe to re-run.
 *
 * Run: npm run db:migrate:portfolio-fund-schema
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

async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column} exists`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`[ok] ${table}.${column}`);
}

async function main() {
  // —— funds: vintage / currency / geography ——
  // Backs the Fund Terms card and the create/edit fund forms.
  await addColumn("funds", "vintage_year", "`vintage_year` INT NULL");
  await addColumn("funds", "currency_code", "`currency_code` VARCHAR(8) NULL");
  await addColumn("funds", "geography", "`geography` VARCHAR(191) NULL");

  // —— fund_performance_snapshots ——
  // Written by FundService.recordPerformanceSnapshot() on fund create/update and
  // on capital-call initiation/payment. Backs the NAV and J-Curve charts.
  if (await tableExists("fund_performance_snapshots")) {
    console.log("[skip] fund_performance_snapshots exists");
  } else {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fund_performance_snapshots\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL,
        \`as_of_date\` DATE NOT NULL,
        \`total_commitment\` DECIMAL(18,2) NOT NULL,
        \`called_capital\` DECIMAL(18,2) NOT NULL,
        \`distributed_capital\` DECIMAL(18,2) NOT NULL,
        \`nav\` DECIMAL(18,2) NOT NULL,
        \`gross_irr\` DECIMAL(7,4) NULL,
        \`net_irr\` DECIMAL(7,4) NULL,
        \`tvpi\` DECIMAL(7,4) NULL,
        \`dpi\` DECIMAL(7,4) NULL,
        \`created_by_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`fund_performance_snapshots_fund_date_key\` (\`fund_id\`, \`as_of_date\`),
        KEY \`fund_performance_snapshots_fund_asof_idx\` (\`fund_id\`, \`as_of_date\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fund_performance_snapshots");
  }

  // —— fund_documents ——
  // General-purpose fund document room. The investment-ops document endpoints
  // are hard-filtered to LISTED_EQUITY funds and reject PE funds, so they
  // could not be reused here.
  if (await tableExists("fund_documents")) {
    console.log("[skip] fund_documents exists");
  } else {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fund_documents\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`category\` VARCHAR(64) NOT NULL DEFAULT 'General',
        \`file_url\` TEXT NOT NULL,
        \`storage_path\` VARCHAR(512) NULL,
        \`mime_type\` VARCHAR(128) NULL,
        \`file_size_bytes\` INT NULL,
        \`uploaded_by_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        KEY \`fund_documents_fund_idx\` (\`fund_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fund_documents");
  }

  console.log("\nPortfolio fund schema migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
