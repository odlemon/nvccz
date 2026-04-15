// @ts-nocheck
/**
 * Idempotent DDL: investee drawdown ↔ portfolio (Suite 02 MVP).
 * purchase_requisitions: portfolio_company_id, fund_id, use_of_funds_document_url,
 * drawdown_request_amount, investee_submitted_at
 *
 * Run: npx ts-node scripts/run-purchase-requisition-investee-portfolio-migration.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`[ok]   ${table}.${column}`);
}

async function indexExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME = ?`,
    name
  );
  return Number(rows[0]?.cnt ?? 0) > 0;
}

async function main() {
  console.log("=== Purchase requisition investee / portfolio columns ===\n");
  const t = "purchase_requisitions";

  await addColumn(
    t,
    "portfolio_company_id",
    "`portfolio_company_id` VARCHAR(191) NULL COMMENT 'Investee portfolio company (Suite 02)'"
  );
  await addColumn(
    t,
    "fund_id",
    "`fund_id` VARCHAR(191) NULL COMMENT 'Fund scope for investee PR'"
  );
  await addColumn(
    t,
    "use_of_funds_document_url",
    "`use_of_funds_document_url` TEXT NULL COMMENT 'Use of funds / business case attachment'"
  );
  await addColumn(
    t,
    "drawdown_request_amount",
    "`drawdown_request_amount` DECIMAL(15,2) NULL COMMENT 'Declared drawdown vs tranche'"
  );
  await addColumn(
    t,
    "investee_submitted_at",
    "`investee_submitted_at` DATETIME(3) NULL COMMENT 'When investee submitted for VC CFO review'"
  );

  if (!(await indexExists("purchase_requisitions_portfolio_company_id_idx"))) {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX \`purchase_requisitions_portfolio_company_id_idx\` ON \`${t}\` (\`portfolio_company_id\`)`
    );
    console.log("[ok]   index portfolio_company_id");
  } else {
    console.log("[skip] index portfolio_company_id");
  }
  if (!(await indexExists("purchase_requisitions_fund_id_idx"))) {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX \`purchase_requisitions_fund_id_idx\` ON \`${t}\` (\`fund_id\`)`
    );
    console.log("[ok]   index fund_id");
  } else {
    console.log("[skip] index fund_id");
  }

  const fkPortfolio = "purchase_requisitions_portfolio_company_id_fkey";
  const fkFund = "purchase_requisitions_fund_id_fkey";
  const fks = await prisma.$queryRawUnsafe<any[]>(
    `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    t
  );
  const names = new Set(fks.map((r) => r.CONSTRAINT_NAME));
  if (!names.has(fkPortfolio)) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${t}\` ADD CONSTRAINT \`${fkPortfolio}\` FOREIGN KEY (\`portfolio_company_id\`) REFERENCES \`portfolio_companies\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`
    );
    console.log("[ok]   FK portfolio_company_id");
  } else {
    console.log("[skip] FK portfolio_company_id");
  }
  if (!names.has(fkFund)) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`${t}\` ADD CONSTRAINT \`${fkFund}\` FOREIGN KEY (\`fund_id\`) REFERENCES \`funds\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`
    );
    console.log("[ok]   FK fund_id");
  } else {
    console.log("[skip] FK fund_id");
  }

  console.log("\n=== done ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
