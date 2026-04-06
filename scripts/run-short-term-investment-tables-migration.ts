/**
 * Short-term investment tracking tables + company_profile.fiscal_timezone (MySQL). Idempotent.
 * Run: npm run db:migrate:short-term-investments
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    indexName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  if (!(await columnExists("company_profile", "fiscal_timezone"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`company_profile\`
      ADD COLUMN \`fiscal_timezone\` VARCHAR(64) NULL
    `);
    console.log("[ok] company_profile.fiscal_timezone added");
  } else {
    console.log("[skip] company_profile.fiscal_timezone exists");
  }

  if (!(await tableExists("short_term_investment_settings"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`short_term_investment_settings\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`posting_mode\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
        \`last_accrual_watermark\` DATETIME(3) NULL,
        \`fiscal_timezone\` VARCHAR(64) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`)
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created short_term_investment_settings");
  } else {
    console.log("[skip] short_term_investment_settings exists");
  }

  await prisma.$executeRawUnsafe(`
    INSERT INTO \`short_term_investment_settings\` (\`id\`, \`posting_mode\`, \`created_at\`, \`updated_at\`)
    SELECT 'default', 'DRAFT', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
    FROM DUAL
    WHERE NOT EXISTS (SELECT 1 FROM \`short_term_investment_settings\` WHERE \`id\` = 'default')
  `);

  if (!(await tableExists("short_term_investment_instruments"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`short_term_investment_instruments\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`category\` VARCHAR(128) NULL,
        \`broker\` VARCHAR(255) NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
        \`principal\` DECIMAL(18, 2) NOT NULL,
        \`currency_id\` VARCHAR(191) NOT NULL,
        \`functional_currency_id\` VARCHAR(191) NULL,
        \`compounding_method\` VARCHAR(32) NOT NULL,
        \`day_count_convention\` VARCHAR(32) NOT NULL DEFAULT 'ACTUAL_365',
        \`day_count_locked\` BOOLEAN NOT NULL DEFAULT false,
        \`settlement_bank_id\` VARCHAR(191) NOT NULL,
        \`principal_gl_account_id\` VARCHAR(191) NOT NULL,
        \`accrued_interest_gl_account_id\` VARCHAR(191) NOT NULL,
        \`interest_income_gl_account_id\` VARCHAR(191) NOT NULL,
        \`negative_yield_expense_gl_account_id\` VARCHAR(191) NOT NULL,
        \`unrealized_fx_gl_account_id\` VARCHAR(191) NULL,
        \`realized_fx_gl_account_id\` VARCHAR(191) NULL,
        \`start_date\` DATE NOT NULL,
        \`maturity_date\` DATE NULL,
        \`capital_erosion\` BOOLEAN NOT NULL DEFAULT false,
        \`liquidation_journal_entry_id\` VARCHAR(191) NULL,
        \`liquidation_date\` DATE NULL,
        \`liquidation_cash_received\` DECIMAL(18, 2) NULL,
        \`carrying_functional_at_settlement\` DECIMAL(18, 6) NULL,
        \`voided_at\` DATETIME(3) NULL,
        \`voided_by_id\` VARCHAR(191) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`sti_inst_liquidation_je_id_key\` (\`liquidation_journal_entry_id\`),
        INDEX \`short_term_investment_instruments_status_idx\` (\`status\`),
        INDEX \`short_term_investment_instruments_maturity_date_idx\` (\`maturity_date\`),
        INDEX \`short_term_investment_instruments_currency_id_idx\` (\`currency_id\`),
        INDEX \`short_term_investment_instruments_settlement_bank_id_idx\` (\`settlement_bank_id\`),
        INDEX \`short_term_investment_instruments_created_by_id_idx\` (\`created_by_id\`),
        CONSTRAINT \`sti_inst_currency_id_fk\`
          FOREIGN KEY (\`currency_id\`) REFERENCES \`currencies\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`sti_inst_functional_currency_id_fk\`
          FOREIGN KEY (\`functional_currency_id\`) REFERENCES \`currencies\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`sti_inst_settlement_bank_id_fk\`
          FOREIGN KEY (\`settlement_bank_id\`) REFERENCES \`banks\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`sti_inst_principal_gl_id_fk\`
          FOREIGN KEY (\`principal_gl_account_id\`) REFERENCES \`chart_of_accounts\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`sti_inst_accrued_gl_id_fk\`
          FOREIGN KEY (\`accrued_interest_gl_account_id\`) REFERENCES \`chart_of_accounts\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`sti_inst_interest_income_gl_id_fk\`
          FOREIGN KEY (\`interest_income_gl_account_id\`) REFERENCES \`chart_of_accounts\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`sti_inst_neg_yield_gl_id_fk\`
          FOREIGN KEY (\`negative_yield_expense_gl_account_id\`) REFERENCES \`chart_of_accounts\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`sti_inst_unrealized_fx_gl_id_fk\`
          FOREIGN KEY (\`unrealized_fx_gl_account_id\`) REFERENCES \`chart_of_accounts\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`sti_inst_realized_fx_gl_id_fk\`
          FOREIGN KEY (\`realized_fx_gl_account_id\`) REFERENCES \`chart_of_accounts\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`sti_inst_liquidation_je_id_fk\`
          FOREIGN KEY (\`liquidation_journal_entry_id\`) REFERENCES \`journal_entries\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`sti_inst_voided_by_id_fk\`
          FOREIGN KEY (\`voided_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`sti_inst_created_by_id_fk\`
          FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created short_term_investment_instruments");
  } else {
    console.log("[skip] short_term_investment_instruments exists");
  }

  if (!(await tableExists("short_term_investment_apy_rates"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`short_term_investment_apy_rates\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`instrument_id\` VARCHAR(191) NOT NULL,
        \`effective_from\` DATE NOT NULL,
        \`effective_to\` DATE NULL,
        \`apy\` DECIMAL(20, 12) NOT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`short_term_investment_apy_rates_instrument_id_effective_from_idx\` (\`instrument_id\`, \`effective_from\`),
        INDEX \`short_term_investment_apy_rates_created_by_id_idx\` (\`created_by_id\`),
        CONSTRAINT \`short_term_investment_apy_rates_instrument_id_fkey\`
          FOREIGN KEY (\`instrument_id\`) REFERENCES \`short_term_investment_instruments\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`short_term_investment_apy_rates_created_by_id_fkey\`
          FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created short_term_investment_apy_rates");
  } else {
    console.log("[skip] short_term_investment_apy_rates exists");
  }

  if (!(await tableExists("short_term_investment_accruals"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`short_term_investment_accruals\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`instrument_id\` VARCHAR(191) NOT NULL,
        \`accrual_date\` DATE NOT NULL,
        \`amount_instrument_ccy\` DECIMAL(18, 6) NOT NULL,
        \`running_accrued_balance\` DECIMAL(18, 6) NOT NULL,
        \`apy_rate_id\` VARCHAR(191) NOT NULL,
        \`journal_entry_id\` VARCHAR(191) NULL,
        \`reversal_journal_entry_id\` VARCHAR(191) NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'PENDING_POST',
        \`reporting_amount_functional\` DECIMAL(18, 6) NULL,
        \`functional_currency_id\` VARCHAR(191) NULL,
        \`fx_rate_used\` DECIMAL(24, 12) NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`short_term_investment_accruals_instrument_id_accrual_date_key\` (\`instrument_id\`, \`accrual_date\`),
        UNIQUE INDEX \`short_term_investment_accruals_journal_entry_id_key\` (\`journal_entry_id\`),
        UNIQUE INDEX \`short_term_investment_accruals_reversal_journal_entry_id_key\` (\`reversal_journal_entry_id\`),
        INDEX \`short_term_investment_accruals_instrument_id_accrual_date_idx\` (\`instrument_id\`, \`accrual_date\`),
        INDEX \`short_term_investment_accruals_apy_rate_id_idx\` (\`apy_rate_id\`),
        INDEX \`short_term_investment_accruals_functional_currency_id_idx\` (\`functional_currency_id\`),
        CONSTRAINT \`short_term_investment_accruals_instrument_id_fkey\`
          FOREIGN KEY (\`instrument_id\`) REFERENCES \`short_term_investment_instruments\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`short_term_investment_accruals_apy_rate_id_fkey\`
          FOREIGN KEY (\`apy_rate_id\`) REFERENCES \`short_term_investment_apy_rates\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`short_term_investment_accruals_journal_entry_id_fkey\`
          FOREIGN KEY (\`journal_entry_id\`) REFERENCES \`journal_entries\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`short_term_investment_accruals_reversal_journal_entry_id_fkey\`
          FOREIGN KEY (\`reversal_journal_entry_id\`) REFERENCES \`journal_entries\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`short_term_investment_accruals_functional_currency_id_fkey\`
          FOREIGN KEY (\`functional_currency_id\`) REFERENCES \`currencies\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created short_term_investment_accruals");
  } else {
    console.log("[skip] short_term_investment_accruals exists");
  }

  if (!(await tableExists("short_term_investment_fx_revaluations"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`short_term_investment_fx_revaluations\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`instrument_id\` VARCHAR(191) NOT NULL,
        \`year_month\` VARCHAR(7) NOT NULL,
        \`journal_entry_id\` VARCHAR(191) NOT NULL,
        \`prior_carrying_functional\` DECIMAL(18, 6) NOT NULL,
        \`revised_carrying_functional\` DECIMAL(18, 6) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`sti_fx_journal_entry_id_key\` (\`journal_entry_id\`),
        UNIQUE INDEX \`sti_fx_inst_year_month_key\` (\`instrument_id\`, \`year_month\`),
        CONSTRAINT \`sti_fx_instrument_id_fk\`
          FOREIGN KEY (\`instrument_id\`) REFERENCES \`short_term_investment_instruments\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`sti_fx_journal_entry_id_fk\`
          FOREIGN KEY (\`journal_entry_id\`) REFERENCES \`journal_entries\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created short_term_investment_fx_revaluations");
  } else {
    console.log("[skip] short_term_investment_fx_revaluations exists");
  }

  // Idempotent: add carrying_functional_at_settlement if table was created by an older script revision.
  if (
    (await tableExists("short_term_investment_instruments")) &&
    !(await columnExists("short_term_investment_instruments", "carrying_functional_at_settlement"))
  ) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`short_term_investment_instruments\`
      ADD COLUMN \`carrying_functional_at_settlement\` DECIMAL(18, 6) NULL
    `);
    console.log("[ok] instruments.carrying_functional_at_settlement added");
  }

  if (
    (await tableExists("short_term_investment_instruments")) &&
    !(await indexExists("short_term_investment_instruments", "short_term_investment_instruments_maturity_date_idx"))
  ) {
    await prisma.$executeRawUnsafe(`
      CREATE INDEX \`short_term_investment_instruments_maturity_date_idx\`
      ON \`short_term_investment_instruments\` (\`maturity_date\`)
    `);
    console.log("[ok] maturity_date index ensured");
  }

  console.log("\nShort-term investment tables migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
