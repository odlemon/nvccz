/**
 * Investment Operations SRD v2 gap remediation — schema extensions.
 * Idempotent. Run: npm run db:migrate:investment-ops-gap
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

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

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  console.log(`[ok] ${table}.${column}`);
}

async function main() {
  await addColumn(
    "investment_accounting_events",
    "reversal_journal_entry_id",
    "reversal_journal_entry_id VARCHAR(191) NULL"
  );
  await addColumn("investment_compliance_rules", "sector_code", "sector_code VARCHAR(64) NULL");
  await addColumn("investment_compliance_rules", "country_code", "country_code VARCHAR(8) NULL");
  await addColumn("investment_compliance_rules", "issuer_name", "issuer_name VARCHAR(255) NULL");
  await addColumn("investment_compliance_rules", "esg_flag", "esg_flag VARCHAR(32) NULL");
  await addColumn(
    "investment_compliance_results",
    "override_document_id",
    "override_document_id VARCHAR(191) NULL"
  );
  await addColumn(
    "investment_reconciliation_batches",
    "external_file_name",
    "external_file_name VARCHAR(255) NULL"
  );
  await addColumn(
    "investment_reconciliation_items",
    "resolution_document_id",
    "resolution_document_id VARCHAR(191) NULL"
  );
  await addColumn("investment_valuation_runs", "parameters_json", "parameters_json JSON NULL");
  await addColumn("investment_valuation_exceptions", "resolved_by_id", "resolved_by_id VARCHAR(191) NULL");
  await addColumn(
    "investment_valuation_exceptions",
    "resolution_action",
    "resolution_action VARCHAR(32) NULL"
  );
  await addColumn("investment_valuation_exceptions", "resolution_note", "resolution_note TEXT NULL");
  await addColumn("investment_instruments", "issuer_id", "issuer_id VARCHAR(191) NULL");

  // Widen status for COMPLETED_WITH_EXCEPTIONS (26 chars)
  await prisma.$executeRawUnsafe(
    `ALTER TABLE investment_valuation_runs MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'RUNNING'`
  );
  console.log("[ok] investment_valuation_runs.status VARCHAR(32)");

  if (!(await tableExists("investment_countries"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_countries (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        country_code VARCHAR(8) NOT NULL,
        country_name VARCHAR(128) NOT NULL,
        region VARCHAR(64) NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL,
        UNIQUE KEY investment_countries_code_key (country_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_countries");
  } else {
    console.log("[skip] investment_countries");
  }

  if (!(await tableExists("investment_issuers"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_issuers (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        issuer_code VARCHAR(64) NOT NULL,
        legal_name VARCHAR(255) NOT NULL,
        country_code VARCHAR(8) NULL,
        sector VARCHAR(128) NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL,
        UNIQUE KEY investment_issuers_code_key (issuer_code),
        KEY investment_issuers_country_idx (country_code),
        CONSTRAINT investment_issuers_country_fk FOREIGN KEY (country_code)
          REFERENCES investment_countries (country_code) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_issuers");
  } else {
    console.log("[skip] investment_issuers");
  }

  const countries = [
    ["ZW", "Zimbabwe", "Africa"],
    ["US", "United States", "Americas"],
    ["GB", "United Kingdom", "Europe"],
  ];
  for (const [code, name, region] of countries) {
    const existing = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM investment_countries WHERE country_code = ?`,
      code
    );
    if (Number(existing[0]?.c ?? 0) > 0) continue;
    await prisma.$executeRawUnsafe(
      `INSERT INTO investment_countries (id, country_code, country_name, region, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, true, NOW(3), NOW(3))`,
      randomUUID(),
      code,
      name,
      region
    );
    console.log(`[ok] seed country ${code}`);
  }

  console.log("\nInvestment Ops gap remediation migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
