/**
 * LP Portal SRD tables — idempotent.
 * Run: npm run db:migrate:lp-portal-srd
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

async function createTable(name: string, ddl: string) {
  if (await tableExists(name)) {
    console.log(`[skip] ${name}`);
    return;
  }
  await prisma.$executeRawUnsafe(ddl);
  console.log(`[ok] ${name}`);
}

async function main() {
  const db = await prisma.$queryRawUnsafe<Array<{ d: string }>>(`SELECT DATABASE() AS d`);
  console.log(`[info] DATABASE()=${db[0]?.d}`);

  await createTable(
    "lp_portal_idempotency_keys",
    `CREATE TABLE \`lp_portal_idempotency_keys\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`client_id\` VARCHAR(191) NOT NULL,
      \`user_id\` VARCHAR(191) NULL,
      \`scope\` VARCHAR(512) NOT NULL,
      \`idempotency_key\` VARCHAR(200) NOT NULL,
      \`payload_hash\` VARCHAR(64) NOT NULL,
      \`status_code\` INT NOT NULL,
      \`response_json\` LONGTEXT NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`lp_portal_idempotency_scope_key\` (\`scope\`, \`idempotency_key\`),
      INDEX \`lp_portal_idempotency_client_idx\` (\`client_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_fund_portal_contexts",
    `CREATE TABLE \`lp_fund_portal_contexts\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`fund_id\` VARCHAR(191) NOT NULL,
      \`operating_model\` VARCHAR(32) NOT NULL DEFAULT 'PRIVATE_CAPITAL',
      \`currency_code\` VARCHAR(8) NOT NULL DEFAULT 'USD',
      \`public_reference\` VARCHAR(64) NULL,
      \`short_name\` VARCHAR(128) NULL,
      \`default_share_class\` VARCHAR(64) NULL,
      \`valuation_status\` VARCHAR(16) NOT NULL DEFAULT 'FINAL',
      \`as_of_date\` DATE NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`lp_fund_portal_contexts_fund_id_key\` (\`fund_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_capital_call_portal_states",
    `CREATE TABLE \`lp_capital_call_portal_states\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`capital_call_allocation_id\` VARCHAR(191) NOT NULL,
      \`client_id\` VARCHAR(191) NOT NULL,
      \`acknowledged_at\` DATETIME(3) NULL,
      \`acknowledged_by_id\` VARCHAR(191) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`lp_capital_call_portal_states_capital_call_allocation_id_key\` (\`capital_call_allocation_id\`),
      INDEX \`lp_cc_portal_state_client_idx\` (\`client_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_capital_call_payment_confirmations",
    `CREATE TABLE \`lp_capital_call_payment_confirmations\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`capital_call_allocation_id\` VARCHAR(191) NOT NULL,
      \`client_id\` VARCHAR(191) NOT NULL,
      \`uploaded_by_id\` VARCHAR(191) NULL,
      \`file_name\` VARCHAR(255) NOT NULL,
      \`mime_type\` VARCHAR(128) NOT NULL,
      \`storage_path\` VARCHAR(512) NOT NULL,
      \`sha256\` VARCHAR(64) NULL,
      \`amount_claimed\` DECIMAL(15,2) NULL,
      \`notes\` TEXT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`lp_cc_pay_confirm_alloc_idx\` (\`capital_call_allocation_id\`),
      INDEX \`lp_cc_pay_confirm_client_idx\` (\`client_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_dealing_rules",
    `CREATE TABLE \`lp_dealing_rules\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`fund_id\` VARCHAR(191) NOT NULL,
      \`min_balance_amount\` DECIMAL(15,2) NOT NULL DEFAULT 1000000,
      \`min_balance_units\` DECIMAL(18,6) NOT NULL DEFAULT 100000,
      \`notice_period_days\` INT NOT NULL DEFAULT 30,
      \`dealing_suspended\` BOOLEAN NOT NULL DEFAULT false,
      \`subscription_fee_bps\` DECIMAL(10,4) NOT NULL DEFAULT 0,
      \`redemption_fee_bps\` DECIMAL(10,4) NOT NULL DEFAULT 0,
      \`next_dealing_date\` DATE NULL,
      \`rules_json\` JSON NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`lp_dealing_rules_fund_id_key\` (\`fund_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_holding_positions",
    `CREATE TABLE \`lp_holding_positions\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`client_id\` VARCHAR(191) NOT NULL,
      \`fund_id\` VARCHAR(191) NOT NULL,
      \`share_class\` VARCHAR(64) NULL,
      \`units\` DECIMAL(18,6) NOT NULL DEFAULT 0,
      \`nav_per_unit\` DECIMAL(18,8) NOT NULL DEFAULT 0,
      \`account_value\` DECIMAL(15,2) NOT NULL DEFAULT 0,
      \`currency_code\` VARCHAR(8) NOT NULL DEFAULT 'USD',
      \`account_ref\` VARCHAR(64) NULL,
      \`as_of_date\` DATE NOT NULL,
      \`valuation_status\` VARCHAR(16) NOT NULL DEFAULT 'FINAL',
      \`is_active\` BOOLEAN NOT NULL DEFAULT true,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`lp_holding_positions_client_fund_class_key\` (\`client_id\`, \`fund_id\`, \`share_class\`),
      INDEX \`lp_holding_positions_client_idx\` (\`client_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_bank_accounts",
    `CREATE TABLE \`lp_bank_accounts\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`client_id\` VARCHAR(191) NOT NULL,
      \`fund_id\` VARCHAR(191) NULL,
      \`label\` VARCHAR(128) NOT NULL,
      \`bank_name\` VARCHAR(128) NOT NULL,
      \`account_name\` VARCHAR(128) NOT NULL,
      \`account_number_masked\` VARCHAR(32) NOT NULL,
      \`currency_code\` VARCHAR(8) NOT NULL DEFAULT 'USD',
      \`is_default\` BOOLEAN NOT NULL DEFAULT false,
      \`status\` VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`lp_bank_accounts_client_idx\` (\`client_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_dealing_requests",
    `CREATE TABLE \`lp_dealing_requests\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`client_id\` VARCHAR(191) NOT NULL,
      \`fund_id\` VARCHAR(191) NOT NULL,
      \`request_type\` VARCHAR(16) NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED',
      \`amount\` DECIMAL(15,2) NULL,
      \`units\` DECIMAL(18,6) NULL,
      \`redemption_mode\` VARCHAR(16) NULL,
      \`currency_code\` VARCHAR(8) NOT NULL DEFAULT 'USD',
      \`requested_dealing_date\` DATE NULL,
      \`estimate_snapshot_id\` VARCHAR(191) NULL,
      \`estimate_json\` JSON NULL,
      \`payload_hash\` VARCHAR(64) NULL,
      \`bank_account_id\` VARCHAR(191) NULL,
      \`submitted_by_id\` VARCHAR(191) NULL,
      \`notes\` TEXT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`lp_dealing_requests_client_fund_idx\` (\`client_id\`, \`fund_id\`),
      INDEX \`lp_dealing_requests_status_idx\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_compliance_statuses",
    `CREATE TABLE \`lp_compliance_statuses\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`client_id\` VARCHAR(191) NOT NULL,
      \`kyc_status\` VARCHAR(32) NOT NULL DEFAULT 'CLEAR',
      \`accredited\` BOOLEAN NOT NULL DEFAULT true,
      \`on_hold\` BOOLEAN NOT NULL DEFAULT false,
      \`hold_reason\` VARCHAR(255) NULL,
      \`details_json\` JSON NULL,
      \`updated_at\` DATETIME(3) NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`lp_compliance_statuses_client_id_key\` (\`client_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_document_access_audits",
    `CREATE TABLE \`lp_document_access_audits\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`document_id\` VARCHAR(191) NOT NULL,
      \`client_id\` VARCHAR(191) NOT NULL,
      \`user_id\` VARCHAR(191) NULL,
      \`action\` VARCHAR(16) NOT NULL,
      \`ip_address\` VARCHAR(64) NULL,
      \`user_agent\` VARCHAR(512) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`lp_doc_access_audit_doc_idx\` (\`document_id\`),
      INDEX \`lp_doc_access_audit_client_idx\` (\`client_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_notices",
    `CREATE TABLE \`lp_notices\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`title\` VARCHAR(512) NOT NULL,
      \`body\` TEXT NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'PUBLISHED',
      \`target_type\` VARCHAR(32) NOT NULL DEFAULT 'ALL',
      \`fund_id\` VARCHAR(191) NULL,
      \`client_id\` VARCHAR(191) NULL,
      \`user_id\` VARCHAR(191) NULL,
      \`share_class\` VARCHAR(64) NULL,
      \`published_at\` DATETIME(3) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`lp_notices_status_pub_idx\` (\`status\`, \`published_at\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_notice_receipts",
    `CREATE TABLE \`lp_notice_receipts\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`notice_id\` VARCHAR(191) NOT NULL,
      \`client_id\` VARCHAR(191) NOT NULL,
      \`user_id\` VARCHAR(191) NULL,
      \`opened_at\` DATETIME(3) NULL,
      \`acknowledged_at\` DATETIME(3) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`lp_notice_receipts_unique\` (\`notice_id\`, \`client_id\`, \`user_id\`),
      INDEX \`lp_notice_receipts_client_idx\` (\`client_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_service_requests",
    `CREATE TABLE \`lp_service_requests\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`reference\` VARCHAR(32) NOT NULL,
      \`client_id\` VARCHAR(191) NOT NULL,
      \`fund_id\` VARCHAR(191) NULL,
      \`request_type\` VARCHAR(64) NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
      \`subject\` VARCHAR(512) NOT NULL,
      \`body\` TEXT NOT NULL,
      \`created_by_id\` VARCHAR(191) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`lp_service_requests_reference_key\` (\`reference\`),
      INDEX \`lp_service_requests_client_idx\` (\`client_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_service_request_messages",
    `CREATE TABLE \`lp_service_request_messages\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`request_id\` VARCHAR(191) NOT NULL,
      \`author_type\` VARCHAR(16) NOT NULL,
      \`author_id\` VARCHAR(191) NULL,
      \`body\` TEXT NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`lp_service_request_messages_req_idx\` (\`request_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_message_threads",
    `CREATE TABLE \`lp_message_threads\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`client_id\` VARCHAR(191) NOT NULL,
      \`fund_id\` VARCHAR(191) NULL,
      \`subject\` VARCHAR(512) NOT NULL,
      \`related_type\` VARCHAR(32) NULL,
      \`related_id\` VARCHAR(191) NULL,
      \`status\` VARCHAR(16) NOT NULL DEFAULT 'OPEN',
      \`last_message_at\` DATETIME(3) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`lp_message_threads_client_idx\` (\`client_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_messages",
    `CREATE TABLE \`lp_messages\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`thread_id\` VARCHAR(191) NOT NULL,
      \`author_type\` VARCHAR(16) NOT NULL,
      \`author_id\` VARCHAR(191) NULL,
      \`body\` TEXT NOT NULL,
      \`read_at\` DATETIME(3) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`lp_messages_thread_idx\` (\`thread_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_notification_prefs",
    `CREATE TABLE \`lp_notification_prefs\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`client_id\` VARCHAR(191) NOT NULL,
      \`user_id\` VARCHAR(191) NOT NULL,
      \`email_capital_calls\` BOOLEAN NOT NULL DEFAULT true,
      \`email_distributions\` BOOLEAN NOT NULL DEFAULT true,
      \`email_documents\` BOOLEAN NOT NULL DEFAULT true,
      \`email_messages\` BOOLEAN NOT NULL DEFAULT true,
      \`email_notices\` BOOLEAN NOT NULL DEFAULT true,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`lp_notification_prefs_user_client_key\` (\`client_id\`, \`user_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "lp_portal_jobs",
    `CREATE TABLE \`lp_portal_jobs\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`client_id\` VARCHAR(191) NOT NULL,
      \`job_type\` VARCHAR(64) NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'QUEUED',
      \`request_json\` JSON NULL,
      \`result_json\` JSON NULL,
      \`download_path\` VARCHAR(512) NULL,
      \`error_message\` TEXT NULL,
      \`created_by_id\` VARCHAR(191) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      \`completed_at\` DATETIME(3) NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`lp_portal_jobs_client_status_idx\` (\`client_id\`, \`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  // Widen lp_role column for SIGNATORY
  try {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`lp_user_relations\` MODIFY COLUMN \`lp_role\` VARCHAR(16) NOT NULL DEFAULT 'VIEWER'`
    );
    console.log("[ok] lp_user_relations.lp_role width ensured");
  } catch (e: any) {
    console.log("[skip] lp_user_relations.lp_role:", e?.message || e);
  }

  console.log("[done] lp-portal-srd migration");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
