/**
 * Cap Table Management — schema + COA seed (3000, 3050, 1010).
 * Idempotent. Run: npm run db:migrate:cap-table-management
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

async function accountExists(accountNo: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM chart_of_accounts WHERE accountNo = ?`,
    accountNo
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function ensureCoaAccount(args: {
  accountNo: string;
  accountName: string;
  accountType: string;
  financialStatement: string;
  notes: string;
  naturalBalance?: string;
}) {
  if (await accountExists(args.accountNo)) {
    console.log(`[skip] chart_of_accounts ${args.accountNo}`);
    return;
  }
  const id = randomUUID();
  const nb = args.naturalBalance ?? (args.accountType === "Equity" ? "CREDIT" : "DEBIT");
  await prisma.$executeRawUnsafe(
    `INSERT INTO chart_of_accounts (id, accountNo, accountName, accountType, naturalBalance, financialStatement, notes, isActive, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, true, NOW(3), NOW(3))`,
    id,
    args.accountNo,
    args.accountName,
    args.accountType,
    nb,
    args.financialStatement,
    args.notes
  );
  console.log(`[ok] chart_of_accounts ${args.accountNo}`);
}

async function main() {
  if (!(await tableExists("cap_table_registries"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`cap_table_registries\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`portfolio_company_id\` VARCHAR(191) NOT NULL,
        \`base_currency_code\` VARCHAR(8) NOT NULL DEFAULT 'USD',
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`cap_table_registries_company_key\` (\`portfolio_company_id\`),
        INDEX \`cap_table_registries_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] cap_table_registries");
  } else {
    console.log("[skip] cap_table_registries");
  }

  if (!(await tableExists("cap_table_gl_mappings"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`cap_table_gl_mappings\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`registry_id\` VARCHAR(191) NOT NULL,
        \`cash_account_code\` VARCHAR(16) NOT NULL DEFAULT '1010',
        \`share_capital_account_code\` VARCHAR(16) NOT NULL DEFAULT '3000',
        \`share_premium_account_code\` VARCHAR(16) NOT NULL DEFAULT '3050',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`cap_table_gl_mappings_registry_key\` (\`registry_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] cap_table_gl_mappings");
  } else {
    console.log("[skip] cap_table_gl_mappings");
  }

  if (!(await tableExists("cap_table_share_classes"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`cap_table_share_classes\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`registry_id\` VARCHAR(191) NOT NULL,
        \`class_code\` VARCHAR(32) NOT NULL,
        \`class_name\` VARCHAR(128) NOT NULL,
        \`class_type\` VARCHAR(24) NOT NULL DEFAULT 'COMMON',
        \`par_value\` DECIMAL(18, 6) NOT NULL DEFAULT 0,
        \`voting_multiplier\` DECIMAL(8, 4) NOT NULL DEFAULT 1,
        \`seniority_index\` INT NOT NULL DEFAULT 99,
        \`liquidation_multiplier\` DECIMAL(8, 4) NOT NULL DEFAULT 1,
        \`is_participating\` BOOLEAN NOT NULL DEFAULT false,
        \`authorized_shares\` DECIMAL(20, 4) NOT NULL DEFAULT 0,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`cap_table_share_classes_registry_code_key\` (\`registry_id\`, \`class_code\`),
        INDEX \`cap_table_share_classes_registry_idx\` (\`registry_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] cap_table_share_classes");
  } else {
    console.log("[skip] cap_table_share_classes");
  }

  if (!(await tableExists("cap_table_stakeholders"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`cap_table_stakeholders\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`registry_id\` VARCHAR(191) NOT NULL,
        \`display_name\` VARCHAR(256) NOT NULL,
        \`stakeholder_type\` VARCHAR(24) NOT NULL DEFAULT 'INVESTOR',
        \`client_id\` VARCHAR(191) NULL,
        \`email\` VARCHAR(256) NULL,
        \`external_ref\` VARCHAR(128) NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`cap_table_stakeholders_registry_idx\` (\`registry_id\`),
        INDEX \`cap_table_stakeholders_client_idx\` (\`client_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] cap_table_stakeholders");
  } else {
    console.log("[skip] cap_table_stakeholders");
  }

  if (!(await tableExists("cap_table_convertible_instruments"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`cap_table_convertible_instruments\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`registry_id\` VARCHAR(191) NOT NULL,
        \`holder_stakeholder_id\` VARCHAR(191) NOT NULL,
        \`principal\` DECIMAL(18, 2) NOT NULL,
        \`annual_interest_rate\` DECIMAL(8, 6) NOT NULL DEFAULT 0,
        \`valuation_cap\` DECIMAL(18, 2) NULL,
        \`discount_rate\` DECIMAL(8, 6) NULL,
        \`issue_date\` DATE NOT NULL,
        \`maturity_date\` DATE NULL,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'OUTSTANDING',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`cap_table_convertibles_registry_idx\` (\`registry_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] cap_table_convertible_instruments");
  } else {
    console.log("[skip] cap_table_convertible_instruments");
  }

  if (!(await tableExists("cap_table_transactions"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`cap_table_transactions\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`registry_id\` VARCHAR(191) NOT NULL,
        \`transaction_type\` VARCHAR(24) NOT NULL,
        \`status\` VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
        \`share_class_id\` VARCHAR(191) NULL,
        \`quantity\` DECIMAL(20, 4) NOT NULL DEFAULT 0,
        \`price_per_share\` DECIMAL(18, 6) NULL,
        \`issuance_date\` DATE NULL,
        \`board_resolution_url\` TEXT NULL,
        \`from_stakeholder_id\` VARCHAR(191) NULL,
        \`to_stakeholder_id\` VARCHAR(191) NULL,
        \`deal_execution_pack_id\` VARCHAR(191) NULL,
        \`journal_entry_id\` VARCHAR(191) NULL,
        \`certificate_sha256\` VARCHAR(64) NULL,
        \`certificate_storage_path\` TEXT NULL,
        \`notes\` TEXT NULL,
        \`created_by_id\` VARCHAR(191) NULL,
        \`approved_by_id\` VARCHAR(191) NULL,
        \`executed_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`cap_table_transactions_registry_idx\` (\`registry_id\`),
        INDEX \`cap_table_transactions_status_idx\` (\`registry_id\`, \`status\`),
        INDEX \`cap_table_transactions_deal_pack_idx\` (\`deal_execution_pack_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] cap_table_transactions");
  } else {
    console.log("[skip] cap_table_transactions");
  }

  if (!(await tableExists("cap_table_transaction_lines"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`cap_table_transaction_lines\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`transaction_id\` VARCHAR(191) NOT NULL,
        \`stakeholder_id\` VARCHAR(191) NOT NULL,
        \`share_class_id\` VARCHAR(191) NOT NULL,
        \`quantity_delta\` DECIMAL(20, 4) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`cap_table_tx_lines_transaction_idx\` (\`transaction_id\`),
        INDEX \`cap_table_tx_lines_holder_class_idx\` (\`stakeholder_id\`, \`share_class_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] cap_table_transaction_lines");
  } else {
    console.log("[skip] cap_table_transaction_lines");
  }

  if (!(await tableExists("cap_table_option_grants"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`cap_table_option_grants\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`registry_id\` VARCHAR(191) NOT NULL,
        \`stakeholder_id\` VARCHAR(191) NOT NULL,
        \`share_class_id\` VARCHAR(191) NOT NULL,
        \`granted_shares\` DECIMAL(20, 4) NOT NULL,
        \`vested_shares\` DECIMAL(20, 4) NOT NULL DEFAULT 0,
        \`exercised_shares\` DECIMAL(20, 4) NOT NULL DEFAULT 0,
        \`cancelled_shares\` DECIMAL(20, 4) NOT NULL DEFAULT 0,
        \`grant_date\` DATE NOT NULL,
        \`vesting_start_date\` DATE NULL,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`cap_table_option_grants_registry_idx\` (\`registry_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] cap_table_option_grants");
  } else {
    console.log("[skip] cap_table_option_grants");
  }

  await ensureCoaAccount({
    accountNo: "3000",
    accountName: "Share Capital",
    accountType: "Equity",
    financialStatement: "Balance Sheet",
    notes: "Cap table issuance — par value",
    naturalBalance: "CREDIT",
  });

  await ensureCoaAccount({
    accountNo: "3050",
    accountName: "Share Premium — Capital in Excess of Par",
    accountType: "Equity",
    financialStatement: "Balance Sheet",
    notes: "Cap table issuance — premium over par",
    naturalBalance: "CREDIT",
  });

  await ensureCoaAccount({
    accountNo: "1010",
    accountName: "Bank Account - USD Operating",
    accountType: "Current Asset",
    financialStatement: "Balance Sheet",
    notes: "Default cash debit for cap table stock issuances",
    naturalBalance: "DEBIT",
  });

  console.log("Cap table management migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
