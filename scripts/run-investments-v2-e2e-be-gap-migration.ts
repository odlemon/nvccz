/**
 * E2E audit BE asks DDL: currency decimalPlaces, fund config keys, blotter createdById.
 * Idempotent.
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

async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) {
    console.log(`skip ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`added ${table}.${column}`);
}

async function main() {
  const dbRows = await prisma.$queryRawUnsafe<Array<{ db: string }>>(`SELECT DATABASE() AS db`);
  console.log(`E2E BE gap DDL on DATABASE()=${dbRows[0]?.db}`);

  await addColumn("currencies", "decimal_places", "`decimal_places` INT NOT NULL DEFAULT 2");

  await addColumn(
    "listed_equity_fund_configs",
    "cost_basis_method",
    "`cost_basis_method` VARCHAR(32) NULL"
  );
  await addColumn(
    "listed_equity_fund_configs",
    "pricing_source",
    "`pricing_source` VARCHAR(64) NULL"
  );
  await addColumn(
    "listed_equity_fund_configs",
    "settlement_cycle",
    "`settlement_cycle` VARCHAR(16) NULL"
  );
  await addColumn(
    "listed_equity_fund_configs",
    "cutoff_time",
    "`cutoff_time` VARCHAR(16) NULL"
  );

  await addColumn("investment_blotters", "created_by_id", "`created_by_id` VARCHAR(191) NULL");

  console.log("E2E BE gap DDL complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
