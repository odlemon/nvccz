/**
 * Accounting sweep: schema additions. Idempotent, raw SQL (no Prisma migrate). Every step is labelled; the running list
 * lives in nvccz-new/design-refs/accounting-sweep/MIGRATION_LOG.md.
 *
 * Run: npx ts-node --transpile-only -r dotenv/config scripts/run-accounting-sweep-migration.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(table: string) {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  return Number(rows[0]?.c ?? 0) > 0;
}
async function createTable(table: string, ddl: string) {
  if (await tableExists(table)) return console.log(`[skip] table ${table}`);
  await prisma.$executeRawUnsafe(ddl);
  console.log(`[ok]   table ${table}`);
}

async function main() {
  // A1 — scheduled accounting jobs: one row per job per time slot. The unique (job_key, slot) is the lease: a second
  // server (or a second tick) inserting the same slot fails and does not run the job again.
  await createTable(
    "accounting_job_runs",
    `CREATE TABLE \`accounting_job_runs\` (
      \`id\` VARCHAR(40) NOT NULL,
      \`job_key\` VARCHAR(64) NOT NULL,
      \`slot\` VARCHAR(40) NOT NULL,
      \`trigger\` VARCHAR(16) NOT NULL DEFAULT 'schedule',
      \`triggered_by_id\` VARCHAR(191) NULL,
      \`status\` VARCHAR(16) NOT NULL DEFAULT 'running',
      \`started_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`finished_at\` DATETIME(3) NULL,
      \`summary\` JSON NULL,
      \`error\` TEXT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`accounting_job_runs_job_slot_uq\` (\`job_key\`, \`slot\`),
      KEY \`accounting_job_runs_job_started_idx\` (\`job_key\`, \`started_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  // A2 — per-job switch (on by default; the environment can also turn a job off).
  await createTable(
    "accounting_job_settings",
    `CREATE TABLE \`accounting_job_settings\` (
      \`job_key\` VARCHAR(64) NOT NULL,
      \`enabled\` TINYINT(1) NOT NULL DEFAULT 1,
      \`updated_by_id\` VARCHAR(191) NULL,
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`job_key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  // A4 — the bank statement imported into a reconciliation session (bank_statements / bank_statement_items hold its
  // lines and their matches to cashbook entries). One statement per session; replaced if re-imported while in draft.
  await createTable(
    "cashbook_reconciliation_statements",
    `CREATE TABLE \`cashbook_reconciliation_statements\` (
      \`session_id\` VARCHAR(191) NOT NULL,
      \`bank_statement_id\` VARCHAR(191) NOT NULL,
      \`file_name\` VARCHAR(255) NULL,
      \`imported_by_id\` VARCHAR(191) NULL,
      \`imported_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`last_auto_match_at\` DATETIME(3) NULL,
      \`last_auto_match_by_id\` VARCHAR(191) NULL,
      PRIMARY KEY (\`session_id\`),
      UNIQUE KEY \`cashbook_reconciliation_statements_stmt_uq\` (\`bank_statement_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  // A10 — supplier payment runs (SRD ACC-AP-11): approved bills gathered into one batch, approved by someone other than
  // its preparer, paid from one bank account with one bank file, and settled bill by bill.
  await createTable(
    "payment_runs",
    `CREATE TABLE \`payment_runs\` (
      \`id\` VARCHAR(40) NOT NULL,
      \`reference\` VARCHAR(40) NOT NULL,
      \`bank_id\` VARCHAR(191) NOT NULL,
      \`currency_code\` VARCHAR(10) NOT NULL,
      \`payment_date\` DATE NOT NULL,
      \`status\` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
      \`total\` DECIMAL(18,2) NOT NULL DEFAULT 0,
      \`notes\` TEXT NULL,
      \`prepared_by_id\` VARCHAR(191) NOT NULL,
      \`submitted_at\` DATETIME(3) NULL,
      \`approved_by_id\` VARCHAR(191) NULL,
      \`approved_at\` DATETIME(3) NULL,
      \`settled_by_id\` VARCHAR(191) NULL,
      \`settled_at\` DATETIME(3) NULL,
      \`bank_reference\` VARCHAR(100) NULL,
      \`proof_path\` VARCHAR(500) NULL,
      \`cancel_reason\` TEXT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`payment_runs_reference_uq\` (\`reference\`),
      KEY \`payment_runs_status_idx\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  await createTable(
    "payment_run_lines",
    `CREATE TABLE \`payment_run_lines\` (
      \`id\` VARCHAR(40) NOT NULL,
      \`run_id\` VARCHAR(40) NOT NULL,
      \`invoice_id\` VARCHAR(191) NOT NULL,
      \`vendor_id\` VARCHAR(191) NOT NULL,
      \`amount\` DECIMAL(18,2) NOT NULL,
      \`status\` VARCHAR(16) NOT NULL DEFAULT 'INCLUDED',
      \`error\` TEXT NULL,
      \`journal_entry_id\` VARCHAR(191) NULL,
      PRIMARY KEY (\`id\`),
      KEY \`payment_run_lines_run_idx\` (\`run_id\`),
      KEY \`payment_run_lines_invoice_idx\` (\`invoice_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  // A11 — employee expense claims (UIR 13, finding EX-05): the claim and its itemised lines (receipt, category, the
  // expense account finance assigns), and a small key/value store for accounting settings (the claims policy).
  await createTable(
    "expense_claims",
    `CREATE TABLE \`expense_claims\` (
      \`id\` VARCHAR(40) NOT NULL,
      \`reference\` VARCHAR(40) NOT NULL,
      \`claimant_id\` VARCHAR(191) NOT NULL,
      \`title\` VARCHAR(200) NOT NULL,
      \`purpose\` TEXT NULL,
      \`trip_from\` DATE NULL,
      \`trip_to\` DATE NULL,
      \`project_id\` VARCHAR(191) NULL,
      \`currency_code\` VARCHAR(10) NOT NULL DEFAULT 'USD',
      \`status\` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
      \`total\` DECIMAL(18,2) NOT NULL DEFAULT 0,
      \`exceptions\` JSON NULL,
      \`submitted_at\` DATETIME(3) NULL,
      \`manager_id\` VARCHAR(191) NULL,
      \`manager_at\` DATETIME(3) NULL,
      \`reviewer_id\` VARCHAR(191) NULL,
      \`reviewer_at\` DATETIME(3) NULL,
      \`approver_id\` VARCHAR(191) NULL,
      \`approver_at\` DATETIME(3) NULL,
      \`exception_note\` TEXT NULL,
      \`return_reason\` TEXT NULL,
      \`journal_entry_id\` VARCHAR(191) NULL,
      \`reimbursed_at\` DATETIME(3) NULL,
      \`reimbursed_by_id\` VARCHAR(191) NULL,
      \`reimbursement_journal_id\` VARCHAR(191) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`expense_claims_reference_uq\` (\`reference\`),
      KEY \`expense_claims_claimant_idx\` (\`claimant_id\`),
      KEY \`expense_claims_status_idx\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  await createTable(
    "expense_claim_lines",
    `CREATE TABLE \`expense_claim_lines\` (
      \`id\` VARCHAR(40) NOT NULL,
      \`claim_id\` VARCHAR(40) NOT NULL,
      \`line_date\` DATE NOT NULL,
      \`category_id\` VARCHAR(191) NULL,
      \`description\` VARCHAR(500) NOT NULL,
      \`amount\` DECIMAL(18,2) NOT NULL,
      \`vat_amount\` DECIMAL(18,2) NOT NULL DEFAULT 0,
      \`account_id\` VARCHAR(191) NULL,
      \`receipt_path\` VARCHAR(500) NULL,
      \`receipt_name\` VARCHAR(255) NULL,
      PRIMARY KEY (\`id\`),
      KEY \`expense_claim_lines_claim_idx\` (\`claim_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  await createTable(
    "accounting_settings",
    `CREATE TABLE \`accounting_settings\` (
      \`setting_key\` VARCHAR(100) NOT NULL,
      \`value\` JSON NOT NULL,
      \`updated_by_id\` VARCHAR(191) NULL,
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`setting_key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  // the account staff claims are owed on until reimbursed
  if (!(await prisma.chartOfAccounts.findUnique({ where: { accountNo: "2260" } }))) {
    await prisma.chartOfAccounts.create({ data: { accountNo: "2260", accountName: "Staff Claims Payable", accountType: "Current Liability", financialStatement: "Balance Sheet", notes: "Approved employee expense claims until reimbursed", isActive: true } });
    console.log("[ok]   account 2260 Staff Claims Payable");
  } else console.log("[skip] account 2260");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
