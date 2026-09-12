/**
 * Procurement V23 registers (MySQL). Idempotent; safe on every environment.
 *
 *   procurement_documents   document vault
 *   procurement_contracts   contracts register
 *   procurement_plans       annual procurement plans
 *   procurement_plan_items  plan lines (cascade with their plan)
 *
 * Each table is created if missing, then every column and index is ensured, so a table created
 * by an earlier version of this script gains what was added since.
 *
 * Run: npm run db:migrate:procurement-registers
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function indexExists(table: string, index: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    index
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

type Table = {
  name: string;
  create: string;
  columns: Array<[string, string]>;
  indexes: Array<[string, string]>;
};

const TS = "DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)";

const TABLES: Table[] = [
  {
    name: "procurement_documents",
    create: `
      CREATE TABLE IF NOT EXISTS \`procurement_documents\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`folder\` VARCHAR(64) NOT NULL DEFAULT 'General',
        \`document_type\` VARCHAR(64) NULL,
        \`related_record\` VARCHAR(128) NULL,
        \`classification\` VARCHAR(32) NOT NULL DEFAULT 'Internal',
        \`source\` VARCHAR(32) NOT NULL DEFAULT 'Internal upload',
        \`version\` VARCHAR(16) NOT NULL DEFAULT 'v1.0',
        \`status\` VARCHAR(24) NOT NULL DEFAULT 'under_review',
        \`description\` TEXT NULL,
        \`file_url\` TEXT NOT NULL,
        \`storage_path\` VARCHAR(512) NULL,
        \`mime_type\` VARCHAR(128) NULL,
        \`file_size_bytes\` INT NULL,
        \`uploaded_by_id\` VARCHAR(191) NULL,
        \`created_at\` ${TS},
        \`updated_at\` ${TS},
        PRIMARY KEY (\`id\`),
        INDEX \`procurement_documents_folder_idx\` (\`folder\`),
        INDEX \`procurement_documents_status_idx\` (\`status\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    columns: [
      ["name", "`name` VARCHAR(255) NOT NULL"],
      ["folder", "`folder` VARCHAR(64) NOT NULL DEFAULT 'General'"],
      ["document_type", "`document_type` VARCHAR(64) NULL"],
      ["related_record", "`related_record` VARCHAR(128) NULL"],
      ["classification", "`classification` VARCHAR(32) NOT NULL DEFAULT 'Internal'"],
      ["source", "`source` VARCHAR(32) NOT NULL DEFAULT 'Internal upload'"],
      ["version", "`version` VARCHAR(16) NOT NULL DEFAULT 'v1.0'"],
      ["status", "`status` VARCHAR(24) NOT NULL DEFAULT 'under_review'"],
      ["description", "`description` TEXT NULL"],
      ["file_url", "`file_url` TEXT NOT NULL"],
      ["storage_path", "`storage_path` VARCHAR(512) NULL"],
      ["mime_type", "`mime_type` VARCHAR(128) NULL"],
      ["file_size_bytes", "`file_size_bytes` INT NULL"],
      ["uploaded_by_id", "`uploaded_by_id` VARCHAR(191) NULL"],
      ["created_at", `\`created_at\` ${TS}`],
      ["updated_at", `\`updated_at\` ${TS}`],
    ],
    indexes: [
      ["procurement_documents_folder_idx", "INDEX `procurement_documents_folder_idx` (`folder`)"],
      ["procurement_documents_status_idx", "INDEX `procurement_documents_status_idx` (`status`)"],
    ],
  },
  {
    name: "procurement_contracts",
    create: `
      CREATE TABLE IF NOT EXISTS \`procurement_contracts\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`contract_number\` VARCHAR(32) NOT NULL,
        \`title\` VARCHAR(255) NOT NULL,
        \`vendor_id\` VARCHAR(191) NOT NULL,
        \`quotation_id\` VARCHAR(191) NULL,
        \`purchase_order_id\` VARCHAR(191) NULL,
        \`rfq_number\` VARCHAR(64) NULL,
        \`value\` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        \`currency_code\` VARCHAR(8) NULL,
        \`start_date\` DATETIME(3) NULL,
        \`end_date\` DATETIME(3) NULL,
        \`status\` VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
        \`payment_terms\` TEXT NULL,
        \`scope\` TEXT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`activated_at\` DATETIME(3) NULL,
        \`created_at\` ${TS},
        \`updated_at\` ${TS},
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`procurement_contracts_contract_number_key\` (\`contract_number\`),
        INDEX \`procurement_contracts_vendor_idx\` (\`vendor_id\`),
        INDEX \`procurement_contracts_status_idx\` (\`status\`),
        INDEX \`procurement_contracts_quotation_idx\` (\`quotation_id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    columns: [
      ["contract_number", "`contract_number` VARCHAR(32) NOT NULL"],
      ["title", "`title` VARCHAR(255) NOT NULL"],
      ["vendor_id", "`vendor_id` VARCHAR(191) NOT NULL"],
      ["quotation_id", "`quotation_id` VARCHAR(191) NULL"],
      ["purchase_order_id", "`purchase_order_id` VARCHAR(191) NULL"],
      ["rfq_number", "`rfq_number` VARCHAR(64) NULL"],
      ["value", "`value` DECIMAL(15,2) NOT NULL DEFAULT 0.00"],
      ["currency_code", "`currency_code` VARCHAR(8) NULL"],
      ["start_date", "`start_date` DATETIME(3) NULL"],
      ["end_date", "`end_date` DATETIME(3) NULL"],
      ["status", "`status` VARCHAR(24) NOT NULL DEFAULT 'DRAFT'"],
      ["payment_terms", "`payment_terms` TEXT NULL"],
      ["scope", "`scope` TEXT NULL"],
      ["created_by_id", "`created_by_id` VARCHAR(191) NOT NULL"],
      ["activated_at", "`activated_at` DATETIME(3) NULL"],
      ["created_at", `\`created_at\` ${TS}`],
      ["updated_at", `\`updated_at\` ${TS}`],
    ],
    indexes: [
      ["procurement_contracts_contract_number_key", "UNIQUE INDEX `procurement_contracts_contract_number_key` (`contract_number`)"],
      ["procurement_contracts_vendor_idx", "INDEX `procurement_contracts_vendor_idx` (`vendor_id`)"],
      ["procurement_contracts_status_idx", "INDEX `procurement_contracts_status_idx` (`status`)"],
      ["procurement_contracts_quotation_idx", "INDEX `procurement_contracts_quotation_idx` (`quotation_id`)"],
    ],
  },
  {
    name: "procurement_plans",
    create: `
      CREATE TABLE IF NOT EXISTS \`procurement_plans\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`plan_number\` VARCHAR(32) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`department\` VARCHAR(191) NULL,
        \`fiscal_year\` VARCHAR(16) NOT NULL,
        \`version\` INT NOT NULL DEFAULT 1,
        \`status\` VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
        \`budget\` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        \`currency_code\` VARCHAR(8) NULL,
        \`notes\` TEXT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`submitted_at\` DATETIME(3) NULL,
        \`approved_by_id\` VARCHAR(191) NULL,
        \`approved_at\` DATETIME(3) NULL,
        \`rejection_reason\` TEXT NULL,
        \`created_at\` ${TS},
        \`updated_at\` ${TS},
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`procurement_plans_plan_number_key\` (\`plan_number\`),
        INDEX \`procurement_plans_fiscal_year_idx\` (\`fiscal_year\`),
        INDEX \`procurement_plans_status_idx\` (\`status\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    columns: [
      ["plan_number", "`plan_number` VARCHAR(32) NOT NULL"],
      ["name", "`name` VARCHAR(255) NOT NULL"],
      ["department", "`department` VARCHAR(191) NULL"],
      ["fiscal_year", "`fiscal_year` VARCHAR(16) NOT NULL"],
      ["version", "`version` INT NOT NULL DEFAULT 1"],
      ["status", "`status` VARCHAR(24) NOT NULL DEFAULT 'DRAFT'"],
      ["budget", "`budget` DECIMAL(15,2) NOT NULL DEFAULT 0.00"],
      ["currency_code", "`currency_code` VARCHAR(8) NULL"],
      ["notes", "`notes` TEXT NULL"],
      ["created_by_id", "`created_by_id` VARCHAR(191) NOT NULL"],
      ["submitted_at", "`submitted_at` DATETIME(3) NULL"],
      ["approved_by_id", "`approved_by_id` VARCHAR(191) NULL"],
      ["approved_at", "`approved_at` DATETIME(3) NULL"],
      ["rejection_reason", "`rejection_reason` TEXT NULL"],
      ["created_at", `\`created_at\` ${TS}`],
      ["updated_at", `\`updated_at\` ${TS}`],
    ],
    indexes: [
      ["procurement_plans_plan_number_key", "UNIQUE INDEX `procurement_plans_plan_number_key` (`plan_number`)"],
      ["procurement_plans_fiscal_year_idx", "INDEX `procurement_plans_fiscal_year_idx` (`fiscal_year`)"],
      ["procurement_plans_status_idx", "INDEX `procurement_plans_status_idx` (`status`)"],
    ],
  },
  {
    name: "procurement_plan_items",
    create: `
      CREATE TABLE IF NOT EXISTS \`procurement_plan_items\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`plan_id\` VARCHAR(191) NOT NULL,
        \`description\` VARCHAR(255) NOT NULL,
        \`category\` VARCHAR(64) NULL,
        \`quarter\` VARCHAR(8) NULL,
        \`method\` VARCHAR(64) NULL,
        \`estimated_value\` DECIMAL(15,2) NOT NULL DEFAULT 0.00,
        \`department\` VARCHAR(191) NULL,
        \`status\` VARCHAR(24) NOT NULL DEFAULT 'PLANNED',
        \`created_at\` ${TS},
        \`updated_at\` ${TS},
        PRIMARY KEY (\`id\`),
        INDEX \`procurement_plan_items_plan_idx\` (\`plan_id\`),
        CONSTRAINT \`procurement_plan_items_plan_fk\`
          FOREIGN KEY (\`plan_id\`) REFERENCES \`procurement_plans\`(\`id\`)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    columns: [
      ["plan_id", "`plan_id` VARCHAR(191) NOT NULL"],
      ["description", "`description` VARCHAR(255) NOT NULL"],
      ["category", "`category` VARCHAR(64) NULL"],
      ["quarter", "`quarter` VARCHAR(8) NULL"],
      ["method", "`method` VARCHAR(64) NULL"],
      ["estimated_value", "`estimated_value` DECIMAL(15,2) NOT NULL DEFAULT 0.00"],
      ["department", "`department` VARCHAR(191) NULL"],
      ["status", "`status` VARCHAR(24) NOT NULL DEFAULT 'PLANNED'"],
      ["created_at", `\`created_at\` ${TS}`],
      ["updated_at", `\`updated_at\` ${TS}`],
    ],
    indexes: [["procurement_plan_items_plan_idx", "INDEX `procurement_plan_items_plan_idx` (`plan_id`)"]],
  },
];

async function main() {
  for (const t of TABLES) {
    if (await tableExists(t.name)) {
      console.log(`[skip] ${t.name} exists`);
    } else {
      await prisma.$executeRawUnsafe(t.create);
      console.log(`[ok] created ${t.name}`);
    }
    for (const [column, ddl] of t.columns) {
      if (await columnExists(t.name, column)) continue;
      await prisma.$executeRawUnsafe(`ALTER TABLE \`${t.name}\` ADD COLUMN ${ddl}`);
      console.log(`[ok] added ${t.name}.${column}`);
    }
    for (const [index, ddl] of t.indexes) {
      if (await indexExists(t.name, index)) continue;
      await prisma.$executeRawUnsafe(`ALTER TABLE \`${t.name}\` ADD ${ddl}`);
      console.log(`[ok] added index ${t.name}.${index}`);
    }
  }
  console.log("\nProcurement registers migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
