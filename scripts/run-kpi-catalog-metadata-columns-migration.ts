/**
 * Adds catalog metadata columns on `kpis` (code, description, GL hints) to align with `hardcodedKPIs.ts`.
 * Idempotent. Run: npm run db:migrate:kpi-catalog-metadata
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?`,
    tableName,
    columnName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function indexExists(tableName: string, indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND INDEX_NAME = ?`,
    tableName,
    indexName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function addColumnIfMissing(tableName: string, columnName: string, columnSql: string) {
  if (await columnExists(tableName, columnName)) {
    console.log(`[skip] ${tableName}.${columnName} already exists`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${tableName}\` ADD COLUMN ${columnSql}`);
  console.log(`[ok] added ${tableName}.${columnName}`);
}

async function main() {
  await addColumnIfMissing("kpis", "kpi_code", "`kpi_code` VARCHAR(80) NULL");
  await addColumnIfMissing("kpis", "catalog_description", "`catalog_description` TEXT NULL");
  await addColumnIfMissing(
    "kpis",
    "catalog_department_name",
    "`catalog_department_name` VARCHAR(120) NULL"
  );
  await addColumnIfMissing("kpis", "account_type", "`account_type` VARCHAR(32) NULL");
  await addColumnIfMissing("kpis", "account_number", "`account_number` VARCHAR(64) NULL");
  await addColumnIfMissing("kpis", "journal_entry_type", "`journal_entry_type` VARCHAR(16) NULL");
  await addColumnIfMissing("kpis", "is_financial", "`is_financial` TINYINT(1) NOT NULL DEFAULT 0");

  if (!(await indexExists("kpis", "kpis_kpi_code_key"))) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`kpis\` ADD UNIQUE KEY \`kpis_kpi_code_key\` (\`kpi_code\`)`
    );
    console.log("[ok] added UNIQUE KEY kpis_kpi_code_key (kpi_code)");
  } else {
    console.log("[skip] UNIQUE kpis_kpi_code_key already exists");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
