/**
 * Tax Return Pack — schema + COA seed + adjustment rules.
 * Idempotent. Run: npm run db:migrate:tax-return-pack
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "crypto";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function seedCoaIfMissing(
  accountNo: string,
  accountName: string,
  accountType: string,
  financialStatement: string,
  notes: string
) {
  const existing = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM chart_of_accounts WHERE accountNo = ?`,
    accountNo
  );
  if (Number(existing[0]?.c ?? 0) > 0) {
    console.log(`[skip] chart_of_accounts ${accountNo}`);
    return;
  }
  const id = randomUUID();
  const naturalBalance = accountType === "Equity" || accountType === "Liability" ? "CREDIT" : "DEBIT";
  await prisma.$executeRawUnsafe(
    `INSERT INTO chart_of_accounts (id, accountNo, accountName, accountType, naturalBalance, financialStatement, notes, isActive, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, true, NOW(3), NOW(3))`,
    id,
    accountNo,
    accountName,
    accountType,
    naturalBalance,
    financialStatement,
    notes
  );
  console.log(`[ok] chart_of_accounts ${accountNo}`);
}

const ADJUSTMENT_RULE_SEEDS: Array<{
  ruleCode: string;
  matchType: string;
  matchValue: string;
  taxCategory: string;
  displayName: string;
}> = [
  { ruleCode: "ENTERTAINMENT", matchType: "NAME_CONTAINS", matchValue: "entertainment", taxCategory: "ADD_BACK", displayName: "Entertainment expense add-back" },
  { ruleCode: "PENALTIES", matchType: "NAME_CONTAINS", matchValue: "penalt", taxCategory: "ADD_BACK", displayName: "ZIMRA penalties / fines add-back" },
  { ruleCode: "FINES", matchType: "NAME_CONTAINS", matchValue: "fine", taxCategory: "ADD_BACK", displayName: "Fines add-back" },
  { ruleCode: "WEAR_TEAR", matchType: "NAME_CONTAINS", matchValue: "depreciation", taxCategory: "DEDUCT", displayName: "Wear and tear allowance" },
  { ruleCode: "WEAR_TEAR2", matchType: "NAME_CONTAINS", matchValue: "wear", taxCategory: "DEDUCT", displayName: "Wear and tear allowance" },
  { ruleCode: "CAP_ALLOWANCE", matchType: "NAME_CONTAINS", matchValue: "capital allowance", taxCategory: "DEDUCT", displayName: "Capital allowances" },
];

async function seedAdjustmentRules() {
  for (const rule of ADJUSTMENT_RULE_SEEDS) {
    const existing = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM tax_adjustment_rules WHERE rule_code = ?`,
      rule.ruleCode
    );
    if (Number(existing[0]?.c ?? 0) > 0) {
      console.log(`[skip] tax_adjustment_rules ${rule.ruleCode}`);
      continue;
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO tax_adjustment_rules (id, rule_code, match_type, match_value, tax_category, display_name, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, true, NOW(3), NOW(3))`,
      randomUUID(),
      rule.ruleCode,
      rule.matchType,
      rule.matchValue,
      rule.taxCategory,
      rule.displayName
    );
    console.log(`[ok] tax_adjustment_rules ${rule.ruleCode}`);
  }
}

async function main() {
  if (!(await tableExists("tax_return_packs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`tax_return_packs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`forecast_entity_id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NULL,
        \`tax_year\` INT NOT NULL,
        \`tax_period\` VARCHAR(16) NOT NULL DEFAULT 'ANNUAL',
        \`tax_regime\` VARCHAR(32) NOT NULL DEFAULT 'ZIMRA_CIT',
        \`base_currency\` VARCHAR(8) NOT NULL DEFAULT 'USD',
        \`status\` VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
        \`period_start\` DATE NOT NULL,
        \`period_end\` DATE NOT NULL,
        \`accounting_profit\` DECIMAL(15, 2) NULL,
        \`taxable_income\` DECIMAL(15, 2) NULL,
        \`cit_liability\` DECIMAL(15, 2) NULL,
        \`cgt_liability\` DECIMAL(15, 2) NULL,
        \`total_tax_liability\` DECIMAL(15, 2) NULL,
        \`cit_liability_usd\` DECIMAL(15, 2) NULL,
        \`cit_liability_zig\` DECIMAL(15, 2) NULL,
        \`weighted_etr\` DECIMAL(8, 4) NULL,
        \`closing_fx_rate\` DECIMAL(18, 6) NULL,
        \`liability_snapshot\` JSON NULL,
        \`failure_reason\` TEXT NULL,
        \`compiled_by_id\` VARCHAR(191) NULL,
        \`compiled_at\` DATETIME(3) NULL,
        \`submitted_by_id\` VARCHAR(191) NULL,
        \`approved_by_id\` VARCHAR(191) NULL,
        \`approved_at\` DATETIME(3) NULL,
        \`pack_pdf_sha256\` VARCHAR(64) NULL,
        \`pack_pdf_url\` VARCHAR(1024) NULL,
        \`pack_pdf_storage_path\` VARCHAR(512) NULL,
        \`journal_entry_id\` VARCHAR(191) NULL,
        \`portal_document_id\` VARCHAR(191) NULL,
        \`locked_at\` DATETIME(3) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`tax_return_packs_entity_year_period_regime_key\` (\`forecast_entity_id\`, \`tax_year\`, \`tax_period\`, \`tax_regime\`),
        INDEX \`tax_return_packs_entity_idx\` (\`forecast_entity_id\`),
        INDEX \`tax_return_packs_status_idx\` (\`status\`),
        INDEX \`tax_return_packs_fund_idx\` (\`fund_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] tax_return_packs");
  } else {
    console.log("[skip] tax_return_packs");
  }

  if (!(await tableExists("tax_return_pack_reconciliation_lines"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`tax_return_pack_reconciliation_lines\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`pack_id\` VARCHAR(191) NOT NULL,
        \`line_code\` VARCHAR(32) NOT NULL,
        \`line_label\` VARCHAR(255) NOT NULL,
        \`account_no\` VARCHAR(64) NULL,
        \`gl_balance\` DECIMAL(15, 2) NOT NULL DEFAULT 0,
        \`tax_adjustment\` DECIMAL(15, 2) NOT NULL DEFAULT 0,
        \`tax_category\` VARCHAR(16) NOT NULL DEFAULT 'BOOK',
        \`currency_code\` VARCHAR(8) NOT NULL DEFAULT 'USD',
        \`journal_line_refs\` JSON NULL,
        \`display_order\` INT NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`tax_return_pack_recon_pack_idx\` (\`pack_id\`),
        INDEX \`tax_return_pack_recon_pack_order_idx\` (\`pack_id\`, \`display_order\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] tax_return_pack_reconciliation_lines");
  } else {
    console.log("[skip] tax_return_pack_reconciliation_lines");
  }

  if (!(await tableExists("tax_return_pack_cgt_lines"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`tax_return_pack_cgt_lines\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`pack_id\` VARCHAR(191) NOT NULL,
        \`asset_ref\` VARCHAR(255) NOT NULL,
        \`source_type\` VARCHAR(32) NOT NULL,
        \`source_id\` VARCHAR(191) NULL,
        \`sale_price\` DECIMAL(15, 2) NOT NULL,
        \`cost_original\` DECIMAL(15, 2) NOT NULL,
        \`holding_years\` DECIMAL(8, 2) NOT NULL,
        \`cost_adjusted\` DECIMAL(15, 2) NOT NULL,
        \`capital_gain\` DECIMAL(15, 2) NOT NULL,
        \`cgt_rate\` DECIMAL(8, 4) NOT NULL,
        \`cgt_liability\` DECIMAL(15, 2) NOT NULL,
        \`currency_code\` VARCHAR(8) NOT NULL DEFAULT 'USD',
        \`acquired_at\` DATE NULL,
        \`disposed_at\` DATE NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`tax_return_pack_cgt_pack_idx\` (\`pack_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] tax_return_pack_cgt_lines");
  } else {
    console.log("[skip] tax_return_pack_cgt_lines");
  }

  if (!(await tableExists("tax_return_pack_ledger_snapshots"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`tax_return_pack_ledger_snapshots\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`pack_id\` VARCHAR(191) NOT NULL,
        \`journal_entry_id\` VARCHAR(191) NOT NULL,
        \`journal_line_id\` VARCHAR(191) NULL,
        \`account_no\` VARCHAR(64) NULL,
        \`account_name\` VARCHAR(255) NULL,
        \`transaction_date\` DATETIME(3) NOT NULL,
        \`amount\` DECIMAL(15, 2) NOT NULL,
        \`currency_code\` VARCHAR(8) NOT NULL DEFAULT 'USD',
        \`fx_rate_at_tx\` DECIMAL(18, 6) NULL,
        \`amount_usd\` DECIMAL(15, 2) NULL,
        \`amount_zig\` DECIMAL(15, 2) NULL,
        \`metadata\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`tax_return_pack_snapshots_pack_idx\` (\`pack_id\`),
        INDEX \`tax_return_pack_snapshots_pack_date_idx\` (\`pack_id\`, \`transaction_date\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] tax_return_pack_ledger_snapshots");
  } else {
    console.log("[skip] tax_return_pack_ledger_snapshots");
  }

  if (!(await tableExists("tax_return_pack_line_overrides"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`tax_return_pack_line_overrides\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`pack_id\` VARCHAR(191) NOT NULL,
        \`reconciliation_line_id\` VARCHAR(191) NOT NULL,
        \`prior_tax_category\` VARCHAR(16) NOT NULL,
        \`new_tax_category\` VARCHAR(16) NOT NULL,
        \`reason\` VARCHAR(512) NULL,
        \`overridden_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`tax_return_pack_overrides_pack_idx\` (\`pack_id\`),
        INDEX \`tax_return_pack_overrides_line_idx\` (\`reconciliation_line_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] tax_return_pack_line_overrides");
  } else {
    console.log("[skip] tax_return_pack_line_overrides");
  }

  if (!(await tableExists("tax_adjustment_rules"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`tax_adjustment_rules\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`rule_code\` VARCHAR(32) NOT NULL,
        \`match_type\` VARCHAR(16) NOT NULL DEFAULT 'NAME_CONTAINS',
        \`match_value\` VARCHAR(128) NOT NULL,
        \`tax_category\` VARCHAR(16) NOT NULL,
        \`display_name\` VARCHAR(255) NOT NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`tax_adjustment_rules_code_key\` (\`rule_code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] tax_adjustment_rules");
  } else {
    console.log("[skip] tax_adjustment_rules");
  }

  if (!(await tableExists("tax_return_pack_audit_events"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`tax_return_pack_audit_events\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`pack_id\` VARCHAR(191) NOT NULL,
        \`event_type\` VARCHAR(32) NOT NULL,
        \`actor_id\` VARCHAR(191) NOT NULL,
        \`details\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`tax_return_pack_audit_pack_idx\` (\`pack_id\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] tax_return_pack_audit_events");
  } else {
    console.log("[skip] tax_return_pack_audit_events");
  }

  await seedCoaIfMissing(
    "5500",
    "Corporate Tax Expense",
    "Expense",
    "Income Statement",
    "Tax return pack — corporate income tax expense accrual"
  );
  await seedCoaIfMissing(
    "2210",
    "Corporate Tax Liabilities — ZIMRA",
    "Liability",
    "Balance Sheet",
    "Tax return pack — ZIMRA corporate tax liability"
  );

  if (await tableExists("tax_adjustment_rules")) {
    await seedAdjustmentRules();
  }

  console.log("Tax return pack migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
