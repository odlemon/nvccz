/**
 * LP Fees & Distributions — schema additions (MySQL). Idempotent.
 *
 * Adds:
 *   - Fund fee policy columns (management_fee_rate/base/frequency/start_date, carry_rate, hurdle_rate/type, catch_up_rate, waterfall_type)
 *   - management_fee_periods, management_fee_allocations, management_fee_allocation_payments
 *   - distributions, distribution_allocations, distribution_allocation_payments
 *   - Promotes portfolio_company_dividends to a full Prisma-managed table (ensures it exists with the same shape created by scripts/sql/add_portfolio_company_dividends.sql)
 *   - Chart of accounts: ensures 1220 (Management Fee Receivable), 2400 (Distributions Payable to LPs), 4010, 4020, 4100 are present.
 *
 * Run:  npm run db:migrate:lp-fees-distributions
 * Then: npx prisma generate
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

async function fkExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = ?`,
    name
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

async function addColumnIfMissing(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column} exists`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ${ddl}`);
  console.log(`[ok]   ${table}.${column}`);
}

async function ensureCoaRow(row: {
  accountNo: string;
  accountName: string;
  accountType: string;
  financialStatement: string;
  naturalBalance: "DEBIT" | "CREDIT";
  notes?: string;
}) {
  const existing = await prisma.chartOfAccounts.findUnique({
    where: { accountNo: row.accountNo },
  });
  if (existing) {
    console.log(`[skip] COA ${row.accountNo} ${existing.accountName}`);
    return;
  }
  await prisma.chartOfAccounts.create({
    data: {
      accountNo: row.accountNo,
      accountName: row.accountName,
      accountType: row.accountType,
      financialStatement: row.financialStatement,
      naturalBalance: row.naturalBalance,
      isActive: true,
      ...(row.notes ? { notes: row.notes } : {}),
    },
  });
  console.log(`[ok]   COA ${row.accountNo} ${row.accountName}`);
}

async function main() {
  // ───────────────────────── 1. Fund fee policy columns ─────────────────────────
  const funds = "funds";
  await addColumnIfMissing(funds, "management_fee_rate", "ADD COLUMN `management_fee_rate` DECIMAL(7,4) NULL");
  await addColumnIfMissing(funds, "management_fee_base", "ADD COLUMN `management_fee_base` VARCHAR(32) NULL");
  await addColumnIfMissing(funds, "management_fee_frequency", "ADD COLUMN `management_fee_frequency` VARCHAR(16) NULL");
  await addColumnIfMissing(funds, "management_fee_start_date", "ADD COLUMN `management_fee_start_date` DATE NULL");
  await addColumnIfMissing(funds, "carry_rate", "ADD COLUMN `carry_rate` DECIMAL(7,4) NULL");
  await addColumnIfMissing(funds, "hurdle_rate", "ADD COLUMN `hurdle_rate` DECIMAL(7,4) NULL");
  await addColumnIfMissing(funds, "hurdle_type", "ADD COLUMN `hurdle_type` VARCHAR(16) NULL");
  await addColumnIfMissing(funds, "catch_up_rate", "ADD COLUMN `catch_up_rate` DECIMAL(7,4) NULL");
  await addColumnIfMissing(funds, "waterfall_type", "ADD COLUMN `waterfall_type` VARCHAR(32) NULL");

  // ───────────────────────── 2. management_fee_periods ─────────────────────────
  const mfp = "management_fee_periods";
  if (!(await tableExists(mfp))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${mfp}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL,
        \`currency_id\` VARCHAR(191) NOT NULL,
        \`period_start\` DATE NOT NULL,
        \`period_end\` DATE NOT NULL,
        \`fee_base\` VARCHAR(32) NOT NULL,
        \`fee_base_amount\` DECIMAL(15,2) NOT NULL,
        \`rate\` DECIMAL(7,4) NOT NULL,
        \`total_fee\` DECIMAL(15,2) NOT NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'ACCRUED',
        \`invoices_sent_at\` DATETIME(3) NULL,
        \`journal_entry_id\` VARCHAR(191) NULL,
        \`notes\` TEXT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`management_fee_periods_journal_entry_id_key\` (\`journal_entry_id\`),
        INDEX \`management_fee_periods_fund_idx\` (\`fund_id\`),
        INDEX \`management_fee_periods_fund_period_idx\` (\`fund_id\`, \`period_end\`),
        CONSTRAINT \`management_fee_periods_fund_id_fkey\` FOREIGN KEY (\`fund_id\`) REFERENCES \`funds\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`management_fee_periods_currency_id_fkey\` FOREIGN KEY (\`currency_id\`) REFERENCES \`currencies\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`management_fee_periods_journal_entry_id_fkey\` FOREIGN KEY (\`journal_entry_id\`) REFERENCES \`journal_entries\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`management_fee_periods_created_by_id_fkey\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log(`[ok]   created ${mfp}`);
  } else {
    console.log(`[skip] ${mfp} exists`);
  }

  // ───────────────────────── 3. management_fee_allocations ─────────────────────────
  const mfa = "management_fee_allocations";
  if (!(await tableExists(mfa))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${mfa}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`management_fee_period_id\` VARCHAR(191) NOT NULL,
        \`client_id\` VARCHAR(191) NOT NULL,
        \`investment_commitment_id\` VARCHAR(191) NOT NULL,
        \`lp_legal_name_snapshot\` VARCHAR(512) NOT NULL,
        \`commitment_snapshot\` DECIMAL(15,2) NOT NULL,
        \`share_of_fee\` DECIMAL(15,2) NOT NULL,
        \`amount_paid\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`management_fee_allocations_period_idx\` (\`management_fee_period_id\`),
        INDEX \`management_fee_allocations_client_idx\` (\`client_id\`),
        INDEX \`management_fee_allocations_commitment_idx\` (\`investment_commitment_id\`),
        CONSTRAINT \`management_fee_allocations_period_id_fkey\` FOREIGN KEY (\`management_fee_period_id\`) REFERENCES \`${mfp}\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`management_fee_allocations_client_id_fkey\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`management_fee_allocations_commitment_id_fkey\` FOREIGN KEY (\`investment_commitment_id\`) REFERENCES \`investment_commitments\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log(`[ok]   created ${mfa}`);
  } else {
    console.log(`[skip] ${mfa} exists`);
  }

  // ───────────────────────── 4. management_fee_allocation_payments ─────────────────────────
  const mfap = "management_fee_allocation_payments";
  if (!(await tableExists(mfap))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${mfap}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`management_fee_allocation_id\` VARCHAR(191) NOT NULL,
        \`amount\` DECIMAL(15,2) NOT NULL,
        \`recorded_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`management_fee_allocation_payments_alloc_idx\` (\`management_fee_allocation_id\`),
        CONSTRAINT \`management_fee_allocation_payments_alloc_fkey\` FOREIGN KEY (\`management_fee_allocation_id\`) REFERENCES \`${mfa}\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log(`[ok]   created ${mfap}`);
  } else {
    console.log(`[skip] ${mfap} exists`);
  }

  // ───────────────────────── 5. portfolio_company_dividends (promote) ─────────────────────────
  const pcd = "portfolio_company_dividends";
  if (!(await tableExists(pcd))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${pcd}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`portfolioCompanyId\` VARCHAR(191) NOT NULL,
        \`amount\` DECIMAL(15,2) NOT NULL,
        \`dividendDate\` DATE NOT NULL,
        \`approvedById\` VARCHAR(191) NOT NULL,
        \`journalEntryId\` VARCHAR(191) NULL,
        \`notes\` TEXT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`portfolio_company_dividends_company_idx\` (\`portfolioCompanyId\`, \`dividendDate\` DESC),
        CONSTRAINT \`portfolio_company_dividends_company_fkey\` FOREIGN KEY (\`portfolioCompanyId\`) REFERENCES \`portfolio_companies\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`portfolio_company_dividends_approved_by_fkey\` FOREIGN KEY (\`approvedById\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`portfolio_company_dividends_journal_entry_fkey\` FOREIGN KEY (\`journalEntryId\`) REFERENCES \`journal_entries\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log(`[ok]   created ${pcd}`);
  } else {
    console.log(`[skip] ${pcd} exists`);
    // Pre-existing legacy table from add_portfolio_company_dividends.sql may have FKs already.
    // Only add FKs if missing (legacy script always adds them, but be safe).
    if (!(await fkExists("portfolio_company_dividends_company_fkey")) && !(await fkExists("fk_pcdividends_company"))) {
      try {
        await prisma.$executeRawUnsafe(`
          ALTER TABLE \`${pcd}\`
          ADD CONSTRAINT \`portfolio_company_dividends_company_fkey\` FOREIGN KEY (\`portfolioCompanyId\`) REFERENCES \`portfolio_companies\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
        `);
        console.log(`[ok]   FK portfolio_company_dividends_company_fkey`);
      } catch (e: any) {
        console.log(`[skip] FK company already present (${e?.message ?? "unknown"})`);
      }
    }
  }

  // ───────────────────────── 6. distributions ─────────────────────────
  const dist = "distributions";
  if (!(await tableExists(dist))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${dist}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL,
        \`currency_id\` VARCHAR(191) NOT NULL,
        \`distribution_date\` DATE NOT NULL,
        \`source\` VARCHAR(32) NOT NULL,
        \`source_company_id\` VARCHAR(191) NULL,
        \`source_dividend_id\` VARCHAR(191) NULL,
        \`gross_amount\` DECIMAL(15,2) NOT NULL,
        \`carry_amount\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`net_to_lps\` DECIMAL(15,2) NOT NULL,
        \`hurdle_applied_amount\` DECIMAL(15,2) NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'DECLARED',
        \`notices_sent_at\` DATETIME(3) NULL,
        \`journal_entry_id\` VARCHAR(191) NULL,
        \`notes\` TEXT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`distributions_journal_entry_id_key\` (\`journal_entry_id\`),
        INDEX \`distributions_fund_idx\` (\`fund_id\`),
        INDEX \`distributions_fund_date_idx\` (\`fund_id\`, \`distribution_date\`),
        CONSTRAINT \`distributions_fund_id_fkey\` FOREIGN KEY (\`fund_id\`) REFERENCES \`funds\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`distributions_currency_id_fkey\` FOREIGN KEY (\`currency_id\`) REFERENCES \`currencies\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`distributions_source_company_fkey\` FOREIGN KEY (\`source_company_id\`) REFERENCES \`portfolio_companies\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`distributions_source_dividend_fkey\` FOREIGN KEY (\`source_dividend_id\`) REFERENCES \`portfolio_company_dividends\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`distributions_journal_entry_id_fkey\` FOREIGN KEY (\`journal_entry_id\`) REFERENCES \`journal_entries\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`distributions_created_by_id_fkey\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log(`[ok]   created ${dist}`);
  } else {
    console.log(`[skip] ${dist} exists`);
  }

  // ───────────────────────── 7. distribution_allocations ─────────────────────────
  const da = "distribution_allocations";
  if (!(await tableExists(da))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${da}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`distribution_id\` VARCHAR(191) NOT NULL,
        \`client_id\` VARCHAR(191) NOT NULL,
        \`investment_commitment_id\` VARCHAR(191) NOT NULL,
        \`lp_legal_name_snapshot\` VARCHAR(512) NOT NULL,
        \`commitment_snapshot\` DECIMAL(15,2) NOT NULL,
        \`paid_in_snapshot\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`share_amount\` DECIMAL(15,2) NOT NULL,
        \`amount_paid\` DECIMAL(15,2) NOT NULL DEFAULT 0,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`distribution_allocations_distribution_idx\` (\`distribution_id\`),
        INDEX \`distribution_allocations_client_idx\` (\`client_id\`),
        INDEX \`distribution_allocations_commitment_idx\` (\`investment_commitment_id\`),
        CONSTRAINT \`distribution_allocations_distribution_id_fkey\` FOREIGN KEY (\`distribution_id\`) REFERENCES \`${dist}\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`distribution_allocations_client_id_fkey\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`distribution_allocations_commitment_id_fkey\` FOREIGN KEY (\`investment_commitment_id\`) REFERENCES \`investment_commitments\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log(`[ok]   created ${da}`);
  } else {
    console.log(`[skip] ${da} exists`);
  }

  // ───────────────────────── 8. distribution_allocation_payments ─────────────────────────
  const dap = "distribution_allocation_payments";
  if (!(await tableExists(dap))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${dap}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`distribution_allocation_id\` VARCHAR(191) NOT NULL,
        \`amount\` DECIMAL(15,2) NOT NULL,
        \`recorded_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`distribution_allocation_payments_alloc_idx\` (\`distribution_allocation_id\`),
        CONSTRAINT \`distribution_allocation_payments_alloc_fkey\` FOREIGN KEY (\`distribution_allocation_id\`) REFERENCES \`${da}\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log(`[ok]   created ${dap}`);
  } else {
    console.log(`[skip] ${dap} exists`);
  }

  // ───────────────────────── 9. Chart of accounts ─────────────────────────
  await ensureCoaRow({
    accountNo: "1220",
    accountName: "Management Fee Receivable",
    accountType: "Current Asset",
    financialStatement: "Balance Sheet",
    naturalBalance: "DEBIT",
    notes: "LP management fee accrual: Dr on accrue (see ManagementFeeService); cleared on receipt",
  });
  await ensureCoaRow({
    accountNo: "2400",
    accountName: "Distributions Payable to LPs",
    accountType: "Current Liability",
    financialStatement: "Balance Sheet",
    naturalBalance: "CREDIT",
    notes: "LP distributions: Cr on declaration (see DistributionService); cleared on payout",
  });
  await ensureCoaRow({
    accountNo: "4010",
    accountName: "Management Fee Revenue",
    accountType: "Revenue",
    financialStatement: "Income Statement",
    naturalBalance: "CREDIT",
    notes: "LP management fee accrual: Cr on accrue (see ManagementFeeService)",
  });
  await ensureCoaRow({
    accountNo: "4020",
    accountName: "Performance Fee Revenue",
    accountType: "Revenue",
    financialStatement: "Income Statement",
    naturalBalance: "CREDIT",
    notes: "GP carried interest: Cr on distribution declaration when carry > 0 (see DistributionService)",
  });
  await ensureCoaRow({
    accountNo: "4100",
    accountName: "Dividend Income",
    accountType: "Revenue",
    financialStatement: "Income Statement",
    naturalBalance: "CREDIT",
    notes: "Investee dividend receipts: Cr on dividend record (see PortfolioCompanyAccountingService.recordDividend)",
  });

  // Silence unused-helper warnings under @ts-nocheck pattern
  void indexExists;
  void fkExists;

  console.log("\nLP fees & distributions migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
