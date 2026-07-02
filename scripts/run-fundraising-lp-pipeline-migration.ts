/**
 * Fundraising LP Pipeline — schema + COA seed (1125, 3010).
 * Idempotent. Run: npm run db:migrate:fundraising-lp-pipeline
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
  if (!(await tableExists("fundraising_campaigns"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_campaigns\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`target_capital\` DECIMAL(18, 2) NOT NULL,
        \`primary_currency\` VARCHAR(8) NOT NULL DEFAULT 'USD',
        \`start_date\` DATE NOT NULL,
        \`close_date\` DATE NOT NULL,
        \`region_tags\` JSON NULL,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_campaigns_fund_idx\` (\`fund_id\`),
        INDEX \`fundraising_campaigns_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_campaigns");
  } else {
    console.log("[skip] fundraising_campaigns");
  }

  if (!(await tableExists("fundraising_pipeline_stages"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_pipeline_stages\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`campaign_id\` VARCHAR(191) NOT NULL,
        \`stage_code\` VARCHAR(32) NOT NULL,
        \`stage_name\` VARCHAR(128) NOT NULL,
        \`sort_order\` INT NOT NULL,
        \`win_probability_pct\` DECIMAL(5, 2) NOT NULL,
        \`gate_rules\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fundraising_pipeline_stages_campaign_code_key\` (\`campaign_id\`, \`stage_code\`),
        INDEX \`fundraising_pipeline_stages_campaign_sort_idx\` (\`campaign_id\`, \`sort_order\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_pipeline_stages");
  } else {
    console.log("[skip] fundraising_pipeline_stages");
  }

  if (!(await tableExists("fundraising_stage_checklist_templates"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_stage_checklist_templates\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`stage_id\` VARCHAR(191) NOT NULL,
        \`item_key\` VARCHAR(64) NOT NULL,
        \`label\` VARCHAR(255) NOT NULL,
        \`sort_order\` INT NOT NULL DEFAULT 0,
        \`is_required\` BOOLEAN NOT NULL DEFAULT true,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fundraising_stage_checklist_templates_stage_key\` (\`stage_id\`, \`item_key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_stage_checklist_templates");
  } else {
    console.log("[skip] fundraising_stage_checklist_templates");
  }

  if (!(await tableExists("fundraising_pipeline_deals"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_pipeline_deals\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`campaign_id\` VARCHAR(191) NOT NULL,
        \`stage_id\` VARCHAR(191) NOT NULL,
        \`prospect_name\` VARCHAR(255) NOT NULL,
        \`prospect_email\` VARCHAR(255) NULL,
        \`prospect_phone\` VARCHAR(64) NULL,
        \`prospect_country\` VARCHAR(64) NULL,
        \`prospect_type\` VARCHAR(24) NOT NULL DEFAULT 'institutional',
        \`proposed_amount\` DECIMAL(18, 2) NOT NULL,
        \`currency_code\` VARCHAR(8) NOT NULL DEFAULT 'USD',
        \`fx_rate_at_creation\` DECIMAL(18, 6) NULL,
        \`priority\` VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
        \`client_id\` VARCHAR(191) NULL,
        \`closed_at\` DATETIME(3) NULL,
        \`journal_entry_id\` VARCHAR(191) NULL,
        \`notes\` TEXT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`fundraising_pipeline_deals_campaign_idx\` (\`campaign_id\`),
        INDEX \`fundraising_pipeline_deals_stage_idx\` (\`stage_id\`),
        INDEX \`fundraising_pipeline_deals_client_idx\` (\`client_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_pipeline_deals");
  } else {
    console.log("[skip] fundraising_pipeline_deals");
  }

  if (!(await tableExists("fundraising_deal_checklist_items"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_deal_checklist_items\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`deal_id\` VARCHAR(191) NOT NULL,
        \`item_key\` VARCHAR(64) NOT NULL,
        \`label\` VARCHAR(255) NOT NULL,
        \`is_required\` BOOLEAN NOT NULL DEFAULT true,
        \`is_complete\` BOOLEAN NOT NULL DEFAULT false,
        \`completed_at\` DATETIME(3) NULL,
        \`completed_by_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fundraising_deal_checklist_items_deal_key\` (\`deal_id\`, \`item_key\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_deal_checklist_items");
  } else {
    console.log("[skip] fundraising_deal_checklist_items");
  }

  if (!(await tableExists("fundraising_deal_agreements"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_deal_agreements\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`deal_id\` VARCHAR(191) NOT NULL,
        \`file_url\` VARCHAR(512) NULL,
        \`file_name\` VARCHAR(255) NULL,
        \`mime_type\` VARCHAR(128) NULL,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
        \`signed_at\` DATETIME(3) NULL,
        \`sha256\` VARCHAR(64) NULL,
        \`uploaded_by_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fundraising_deal_agreements_deal_key\` (\`deal_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_deal_agreements");
  } else {
    console.log("[skip] fundraising_deal_agreements");
  }

  if (!(await tableExists("pipeline_interactions"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`pipeline_interactions\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`deal_id\` VARCHAR(191) NOT NULL,
        \`interaction_type\` VARCHAR(32) NOT NULL,
        \`subject\` VARCHAR(255) NULL,
        \`body\` TEXT NULL,
        \`occurred_at\` DATETIME(3) NOT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`mailer_batch_id\` VARCHAR(64) NULL,
        \`metadata\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`pipeline_interactions_deal_occurred_idx\` (\`deal_id\`, \`occurred_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] pipeline_interactions");
  } else {
    console.log("[skip] pipeline_interactions");
  }

  if (!(await tableExists("fundraising_campaign_gl_mappings"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`fundraising_campaign_gl_mappings\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`campaign_id\` VARCHAR(191) NOT NULL,
        \`receivable_account_code\` VARCHAR(16) NOT NULL DEFAULT '1125',
        \`committed_capital_account_code\` VARCHAR(16) NOT NULL DEFAULT '3010',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`fundraising_campaign_gl_mappings_campaign_key\` (\`campaign_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] fundraising_campaign_gl_mappings");
  } else {
    console.log("[skip] fundraising_campaign_gl_mappings");
  }

  await ensureCoaAccount({
    accountNo: "1125",
    accountName: "Accounts Receivable — LP Commitments",
    accountType: "Asset",
    financialStatement: "Balance Sheet",
    notes: "Fundraising LP pipeline — Dr on WON commitment",
    naturalBalance: "DEBIT",
  });

  await ensureCoaAccount({
    accountNo: "3010",
    accountName: "Partners Capital — Committed Capital",
    accountType: "Equity",
    financialStatement: "Balance Sheet",
    notes: "Fundraising LP pipeline — Cr on WON commitment",
    naturalBalance: "CREDIT",
  });

  console.log("Fundraising LP pipeline migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
