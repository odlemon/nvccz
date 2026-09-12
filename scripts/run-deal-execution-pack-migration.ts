/**
 * Deal Execution Pack — schema.
 * Idempotent. Run: npm run db:migrate:deal-execution-pack
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
  const naturalBalance = accountType === "Equity" ? "CREDIT" : "DEBIT";
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

async function main() {
  if (!(await tableExists("deal_execution_packs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`deal_execution_packs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL,
        \`portfolio_company_id\` VARCHAR(191) NOT NULL,
        \`application_id\` VARCHAR(191) NULL,
        \`transaction_type\` VARCHAR(32) NOT NULL DEFAULT 'EQUITY_ROUND',
        \`status\` VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
        \`base_currency\` VARCHAR(8) NOT NULL DEFAULT 'USD',
        \`investment_amount\` DECIMAL(15, 2) NULL,
        \`pre_money_valuation\` DECIMAL(15, 2) NULL,
        \`metadata\` JSON NULL,
        \`icp_pct\` DECIMAL(8, 4) NULL,
        \`executed_by_id\` VARCHAR(191) NULL,
        \`executed_at\` DATETIME(3) NULL,
        \`locked_at\` DATETIME(3) NULL,
        \`closing_summary_sha256\` VARCHAR(64) NULL,
        \`closing_summary_url\` VARCHAR(1024) NULL,
        \`journal_entry_id\` VARCHAR(191) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`deal_execution_packs_fund_pc_app_key\` (\`fund_id\`, \`portfolio_company_id\`, \`application_id\`),
        INDEX \`deal_execution_packs_fund_idx\` (\`fund_id\`),
        INDEX \`deal_execution_packs_pc_idx\` (\`portfolio_company_id\`),
        INDEX \`deal_execution_packs_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] deal_execution_packs");
  } else {
    console.log("[skip] deal_execution_packs");
  }

  if (!(await tableExists("deal_execution_pack_document_slots"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`deal_execution_pack_document_slots\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`pack_id\` VARCHAR(191) NOT NULL,
        \`slot_code\` VARCHAR(32) NOT NULL,
        \`display_name\` VARCHAR(128) NOT NULL,
        \`is_mandatory\` BOOLEAN NOT NULL DEFAULT true,
        \`display_order\` INT NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`deal_execution_pack_slots_pack_code_key\` (\`pack_id\`, \`slot_code\`),
        INDEX \`deal_execution_pack_slots_pack_idx\` (\`pack_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] deal_execution_pack_document_slots");
  } else {
    console.log("[skip] deal_execution_pack_document_slots");
  }

  if (!(await tableExists("deal_execution_pack_documents"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`deal_execution_pack_documents\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`slot_id\` VARCHAR(191) NOT NULL,
        \`version\` INT NOT NULL DEFAULT 1,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
        \`file_name\` VARCHAR(255) NOT NULL,
        \`file_url\` VARCHAR(1024) NOT NULL,
        \`storage_path\` VARCHAR(512) NULL,
        \`sha256\` VARCHAR(64) NOT NULL,
        \`file_size_bytes\` INT NULL,
        \`uploaded_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`deal_execution_pack_docs_slot_idx\` (\`slot_id\`),
        INDEX \`deal_execution_pack_docs_slot_version_idx\` (\`slot_id\`, \`version\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] deal_execution_pack_documents");
  } else {
    console.log("[skip] deal_execution_pack_documents");
  }

  if (!(await tableExists("deal_execution_pack_cps"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`deal_execution_pack_cps\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`pack_id\` VARCHAR(191) NOT NULL,
        \`description\` VARCHAR(512) NOT NULL,
        \`weight\` INT NOT NULL DEFAULT 10,
        \`priority\` VARCHAR(16) NOT NULL DEFAULT 'MEDIUM',
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        \`verification_owner_id\` VARCHAR(191) NULL,
        \`document_id\` VARCHAR(191) NULL,
        \`satisfied_at\` DATETIME(3) NULL,
        \`satisfied_by_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`deal_execution_pack_cps_pack_idx\` (\`pack_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] deal_execution_pack_cps");
  } else {
    console.log("[skip] deal_execution_pack_cps");
  }

  if (!(await tableExists("deal_execution_pack_signatures"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`deal_execution_pack_signatures\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`pack_id\` VARCHAR(191) NOT NULL,
        \`role_code\` VARCHAR(32) NOT NULL,
        \`signatory_user_id\` VARCHAR(191) NULL,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        \`signed_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`deal_execution_pack_sigs_pack_role_key\` (\`pack_id\`, \`role_code\`),
        INDEX \`deal_execution_pack_sigs_pack_idx\` (\`pack_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] deal_execution_pack_signatures");
  } else {
    console.log("[skip] deal_execution_pack_signatures");
  }

  if (!(await tableExists("deal_execution_pack_audit_events"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`deal_execution_pack_audit_events\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`pack_id\` VARCHAR(191) NOT NULL,
        \`event_type\` VARCHAR(32) NOT NULL,
        \`actor_id\` VARCHAR(191) NOT NULL,
        \`details\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`deal_execution_pack_audit_pack_idx\` (\`pack_id\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] deal_execution_pack_audit_events");
  } else {
    console.log("[skip] deal_execution_pack_audit_events");
  }

  await seedCoaIfMissing(
    "1502",
    "Investment Asset — Portfolio",
    "Asset",
    "Balance Sheet",
    "Deal execution pack — portfolio investment asset"
  );
  await seedCoaIfMissing(
    "1000",
    "Cash — Bank Operating",
    "Asset",
    "Balance Sheet",
    "Deal execution pack — cash disbursement"
  );

  console.log("Deal execution pack migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
