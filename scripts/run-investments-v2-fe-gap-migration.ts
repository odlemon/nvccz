/**
 * FE gap closure DDL: model linkedFundId + broker/custodian amount columns.
 * Idempotent — safe to re-run on nts / client1_db / demo_env.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    indexName
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) {
    console.log(`skip ${table}.${column} (exists)`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`added ${table}.${column}`);
}

async function main() {
  const dbRows = await prisma.$queryRawUnsafe<Array<{ db: string }>>(`SELECT DATABASE() AS db`);
  console.log(`FE gap DDL on DATABASE()=${dbRows[0]?.db}`);

  await addColumn(
    "investment_model_portfolios",
    "linked_fund_id",
    "`linked_fund_id` VARCHAR(191) NULL"
  );
  if (!(await indexExists("investment_model_portfolios", "investment_model_portfolios_linked_fund_idx"))) {
    await prisma.$executeRawUnsafe(
      `CREATE INDEX \`investment_model_portfolios_linked_fund_idx\` ON \`investment_model_portfolios\` (\`linked_fund_id\`)`
    );
    console.log("added index investment_model_portfolios_linked_fund_idx");
  } else {
    console.log("skip index investment_model_portfolios_linked_fund_idx");
  }

  const brokerCols: Array<[string, string]> = [
    ["internal_amount", "`internal_amount` DECIMAL(24,6) NULL"],
    ["broker_amount", "`broker_amount` DECIMAL(24,6) NULL"],
    ["custodian_amount", "`custodian_amount` DECIMAL(24,6) NULL"],
    ["internal_ref", "`internal_ref` VARCHAR(128) NULL"],
    ["broker_ref", "`broker_ref` VARCHAR(128) NULL"],
    ["custodian_ref", "`custodian_ref` VARCHAR(128) NULL"],
  ];
  for (const [col, ddl] of brokerCols) {
    await addColumn("sp_cash_broker_custodian_items", col, ddl);
  }

  console.log("FE gap DDL complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
