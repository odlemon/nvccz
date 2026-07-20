/**
 * Stock Picker Cash (sp_cash_*) tables — idempotent.
 * Run: npm run db:migrate:stock-picker-cash
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
    "sp_cash_providers",
    `CREATE TABLE \`sp_cash_providers\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`tenant_id\` VARCHAR(191) NOT NULL,
      \`code\` VARCHAR(64) NOT NULL,
      \`display_name\` VARCHAR(255) NOT NULL,
      \`provider_type\` VARCHAR(64) NOT NULL,
      \`status\` VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
      \`version\` INT NOT NULL DEFAULT 1,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`sp_cash_providers_code_key\` (\`code\`),
      INDEX \`sp_cash_providers_tenant_idx\` (\`tenant_id\`),
      INDEX \`sp_cash_providers_status_idx\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_file_layouts",
    `CREATE TABLE \`sp_cash_file_layouts\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`provider_id\` VARCHAR(191) NOT NULL,
      \`layout_code\` VARCHAR(64) NOT NULL,
      \`version_no\` INT NOT NULL DEFAULT 1,
      \`sign_map_json\` JSON NOT NULL,
      \`date_map_json\` JSON NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
      \`effective_from\` DATE NOT NULL,
      \`effective_to\` DATE NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`sp_cash_file_layouts_provider_idx\` (\`provider_id\`),
      INDEX \`sp_cash_file_layouts_code_idx\` (\`layout_code\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_account_mappings",
    `CREATE TABLE \`sp_cash_account_mappings\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`provider_id\` VARCHAR(191) NOT NULL,
      \`layout_id\` VARCHAR(191) NULL,
      \`external_fingerprint\` VARCHAR(191) NOT NULL,
      \`currency\` VARCHAR(8) NOT NULL,
      \`cash_account_id\` VARCHAR(191) NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
      \`version\` INT NOT NULL DEFAULT 1,
      \`effective_from\` DATE NOT NULL,
      \`effective_to\` DATE NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`sp_cash_account_mappings_provider_idx\` (\`provider_id\`),
      INDEX \`sp_cash_account_mappings_fingerprint_idx\` (\`external_fingerprint\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_tolerance_policies",
    `CREATE TABLE \`sp_cash_tolerance_policies\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`code\` VARCHAR(64) NOT NULL,
      \`currency\` VARCHAR(8) NOT NULL,
      \`amount_tolerance\` DECIMAL(24,6) NOT NULL DEFAULT 0,
      \`date_tolerance_days\` INT NOT NULL DEFAULT 0,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
      \`version\` INT NOT NULL DEFAULT 1,
      \`effective_from\` DATE NOT NULL,
      \`effective_to\` DATE NULL,
      \`config_json\` JSON NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`sp_cash_tolerance_policies_code_key\` (\`code\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_match_weight_policies",
    `CREATE TABLE \`sp_cash_match_weight_policies\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`code\` VARCHAR(64) NOT NULL,
      \`amount_weight\` DECIMAL(8,4) NOT NULL,
      \`date_weight\` DECIMAL(8,4) NOT NULL,
      \`reference_weight\` DECIMAL(8,4) NOT NULL,
      \`counterparty_weight\` DECIMAL(8,4) NOT NULL,
      \`auto_match_threshold\` DECIMAL(8,4) NOT NULL,
      \`suggest_threshold\` DECIMAL(8,4) NOT NULL,
      \`weak_threshold\` DECIMAL(8,4) NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
      \`version\` INT NOT NULL DEFAULT 1,
      \`effective_from\` DATE NOT NULL,
      \`effective_to\` DATE NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`sp_cash_match_weight_policies_code_key\` (\`code\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_client_accounts",
    `CREATE TABLE \`sp_cash_client_accounts\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`tenant_id\` VARCHAR(191) NOT NULL,
      \`legal_entity_id\` VARCHAR(191) NOT NULL,
      \`client_or_vehicle_id\` VARCHAR(191) NOT NULL,
      \`mandate_id\` VARCHAR(191) NULL,
      \`portfolio_id\` VARCHAR(191) NOT NULL,
      \`owner_model\` VARCHAR(64) NOT NULL,
      \`money_class\` VARCHAR(64) NOT NULL,
      \`account_type\` VARCHAR(64) NOT NULL,
      \`provider_id\` VARCHAR(191) NOT NULL,
      \`external_identifier_encrypted\` TEXT NULL,
      \`external_fingerprint\` VARCHAR(191) NOT NULL,
      \`masked_identifier\` VARCHAR(64) NULL,
      \`currency\` VARCHAR(8) NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
      \`effective_from\` DATE NOT NULL,
      \`effective_to\` DATE NULL,
      \`calendar_id\` VARCHAR(191) NULL,
      \`timezone\` VARCHAR(64) NULL,
      \`tolerance_policy_id\` VARCHAR(191) NULL,
      \`gl_mapping_id\` VARCHAR(191) NULL,
      \`client_name\` VARCHAR(255) NULL,
      \`account_number_masked\` VARCHAR(64) NULL,
      \`reconciliation_health\` VARCHAR(32) NULL,
      \`version\` INT NOT NULL DEFAULT 1,
      \`created_by_id\` VARCHAR(191) NULL,
      \`approved_by_id\` VARCHAR(191) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`sp_cash_client_accounts_provider_fp_ccy_key\` (\`provider_id\`, \`external_fingerprint\`, \`currency\`),
      INDEX \`sp_cash_client_accounts_portfolio_idx\` (\`portfolio_id\`),
      INDEX \`sp_cash_client_accounts_status_idx\` (\`status\`),
      INDEX \`sp_cash_client_accounts_client_vehicle_idx\` (\`client_or_vehicle_id\`),
      INDEX \`sp_cash_client_accounts_tenant_idx\` (\`tenant_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_journals",
    `CREATE TABLE \`sp_cash_journals\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`source_system\` VARCHAR(64) NOT NULL,
      \`source_event_id\` VARCHAR(191) NULL,
      \`posting_purpose\` VARCHAR(64) NOT NULL,
      \`idempotency_key\` VARCHAR(200) NOT NULL,
      \`trade_date\` DATE NULL,
      \`settlement_date\` DATE NULL,
      \`value_date\` DATE NULL,
      \`posting_business_date\` DATE NULL,
      \`currency\` VARCHAR(8) NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
      \`maker_id\` VARCHAR(191) NULL,
      \`checker_id\` VARCHAR(191) NULL,
      \`reversal_of\` VARCHAR(191) NULL,
      \`configuration_version\` INT NULL,
      \`audit_hash\` VARCHAR(128) NULL,
      \`cash_account_id\` VARCHAR(191) NULL,
      \`portfolio_id\` VARCHAR(191) NULL,
      \`reject_reason\` TEXT NULL,
      \`version\` INT NOT NULL DEFAULT 1,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      \`posted_at\` DATETIME(3) NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`sp_cash_journals_idempotency_key\` (\`idempotency_key\`),
      INDEX \`sp_cash_journals_cash_account_idx\` (\`cash_account_id\`),
      INDEX \`sp_cash_journals_portfolio_idx\` (\`portfolio_id\`),
      INDEX \`sp_cash_journals_status_idx\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_journal_lines",
    `CREATE TABLE \`sp_cash_journal_lines\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`journal_id\` VARCHAR(191) NOT NULL,
      \`ledger_account_code\` VARCHAR(64) NOT NULL,
      \`cash_account_id\` VARCHAR(191) NULL,
      \`beneficial_owner_id\` VARCHAR(191) NULL,
      \`debit\` DECIMAL(24,6) NOT NULL DEFAULT 0,
      \`credit\` DECIMAL(24,6) NOT NULL DEFAULT 0,
      \`signed_cash_amount\` DECIMAL(24,6) NOT NULL DEFAULT 0,
      \`currency\` VARCHAR(8) NOT NULL,
      \`description\` VARCHAR(512) NULL,
      \`match_status\` VARCHAR(32) NULL,
      \`residual_amount\` DECIMAL(24,6) NULL,
      \`line_version\` INT NOT NULL DEFAULT 1,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`sp_cash_journal_lines_journal_idx\` (\`journal_id\`),
      INDEX \`sp_cash_journal_lines_cash_account_idx\` (\`cash_account_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_reservations",
    `CREATE TABLE \`sp_cash_reservations\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`idempotency_key\` VARCHAR(200) NOT NULL,
      \`source_event_id\` VARCHAR(191) NULL,
      \`portfolio_id\` VARCHAR(191) NOT NULL,
      \`cash_account_id\` VARCHAR(191) NOT NULL,
      \`currency\` VARCHAR(8) NOT NULL,
      \`original_amount\` DECIMAL(24,6) NOT NULL,
      \`consumed_amount\` DECIMAL(24,6) NOT NULL DEFAULT 0,
      \`released_amount\` DECIMAL(24,6) NOT NULL DEFAULT 0,
      \`remaining_amount\` DECIMAL(24,6) NOT NULL,
      \`required_date\` DATE NULL,
      \`expiry_date\` DATE NULL,
      \`purpose\` VARCHAR(128) NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
      \`maker_id\` VARCHAR(191) NULL,
      \`checker_id\` VARCHAR(191) NULL,
      \`version\` INT NOT NULL DEFAULT 1,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`sp_cash_reservations_idempotency_key\` (\`idempotency_key\`),
      INDEX \`sp_cash_reservations_portfolio_idx\` (\`portfolio_id\`),
      INDEX \`sp_cash_reservations_cash_account_idx\` (\`cash_account_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_expectations",
    `CREATE TABLE \`sp_cash_expectations\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`cash_account_id\` VARCHAR(191) NOT NULL,
      \`portfolio_id\` VARCHAR(191) NOT NULL,
      \`direction\` VARCHAR(16) NOT NULL,
      \`amount\` DECIMAL(24,6) NOT NULL,
      \`currency\` VARCHAR(8) NOT NULL,
      \`due_date\` DATE NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
      \`linked_reservation_id\` VARCHAR(191) NULL,
      \`linked_journal_id\` VARCHAR(191) NULL,
      \`source_event_id\` VARCHAR(191) NULL,
      \`version\` INT NOT NULL DEFAULT 1,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`sp_cash_expectations_cash_account_idx\` (\`cash_account_id\`),
      INDEX \`sp_cash_expectations_portfolio_idx\` (\`portfolio_id\`),
      INDEX \`sp_cash_expectations_status_idx\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_statement_imports",
    `CREATE TABLE \`sp_cash_statement_imports\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`provider_id\` VARCHAR(191) NOT NULL,
      \`cash_account_id\` VARCHAR(191) NOT NULL,
      \`currency\` VARCHAR(8) NOT NULL,
      \`file_name\` VARCHAR(512) NOT NULL,
      \`file_hash\` VARCHAR(128) NOT NULL,
      \`layout_id\` VARCHAR(191) NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      \`control_opening\` DECIMAL(24,6) NULL,
      \`control_closing\` DECIMAL(24,6) NULL,
      \`line_count\` INT NULL,
      \`maker\` VARCHAR(128) NULL,
      \`maker_id\` VARCHAR(191) NULL,
      \`checker_id\` VARCHAR(191) NULL,
      \`reject_reason\` TEXT NULL,
      \`version\` INT NOT NULL DEFAULT 1,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      \`committed_at\` DATETIME(3) NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`sp_cash_statement_imports_account_file_hash_key\` (\`cash_account_id\`, \`file_hash\`),
      INDEX \`sp_cash_statement_imports_provider_idx\` (\`provider_id\`),
      INDEX \`sp_cash_statement_imports_status_idx\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_external_statements",
    `CREATE TABLE \`sp_cash_external_statements\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`import_id\` VARCHAR(191) NOT NULL,
      \`provider_id\` VARCHAR(191) NOT NULL,
      \`cash_account_id\` VARCHAR(191) NOT NULL,
      \`period_from\` DATE NOT NULL,
      \`period_to\` DATE NOT NULL,
      \`currency\` VARCHAR(8) NOT NULL,
      \`opening_balance\` DECIMAL(24,6) NOT NULL,
      \`closing_balance\` DECIMAL(24,6) NOT NULL,
      \`file_hash\` VARCHAR(128) NOT NULL,
      \`parser_version\` VARCHAR(64) NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
      \`evidence_uri\` VARCHAR(1024) NULL,
      \`version\` INT NOT NULL DEFAULT 1,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`sp_cash_external_statements_file_hash_key\` (\`file_hash\`),
      INDEX \`sp_cash_external_statements_import_idx\` (\`import_id\`),
      INDEX \`sp_cash_external_statements_cash_account_idx\` (\`cash_account_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_external_statement_lines",
    `CREATE TABLE \`sp_cash_external_statement_lines\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`statement_id\` VARCHAR(191) NOT NULL,
      \`import_id\` VARCHAR(191) NOT NULL,
      \`raw_payload_json\` JSON NULL,
      \`value_date\` DATE NULL,
      \`trade_date\` DATE NULL,
      \`signed_cash_amount\` DECIMAL(24,6) NOT NULL,
      \`currency\` VARCHAR(8) NOT NULL,
      \`reference\` VARCHAR(255) NULL,
      \`counterparty\` VARCHAR(255) NULL,
      \`fingerprint\` VARCHAR(191) NOT NULL,
      \`match_status\` VARCHAR(32) NULL,
      \`residual_amount\` DECIMAL(24,6) NULL,
      \`line_version\` INT NOT NULL DEFAULT 1,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`sp_cash_ext_stmt_lines_stmt_fp_key\` (\`statement_id\`, \`fingerprint\`),
      INDEX \`sp_cash_external_statement_lines_import_idx\` (\`import_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_reconciliation_batches",
    `CREATE TABLE \`sp_cash_reconciliation_batches\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`cash_account_id\` VARCHAR(191) NOT NULL,
      \`currency\` VARCHAR(8) NOT NULL,
      \`period_from\` DATE NOT NULL,
      \`period_to\` DATE NOT NULL,
      \`recon_type\` VARCHAR(64) NOT NULL,
      \`opening_internal\` DECIMAL(24,6) NULL,
      \`closing_internal\` DECIMAL(24,6) NULL,
      \`opening_external\` DECIMAL(24,6) NULL,
      \`closing_external\` DECIMAL(24,6) NULL,
      \`adjusted_external\` DECIMAL(24,6) NULL,
      \`variance\` DECIMAL(24,6) NULL,
      \`tolerance_amount\` DECIMAL(24,6) NULL,
      \`config_version\` INT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
      \`maker_id\` VARCHAR(191) NULL,
      \`checker_id\` VARCHAR(191) NULL,
      \`auto_match_enabled\` TINYINT(1) NOT NULL DEFAULT 1,
      \`fund_id\` VARCHAR(191) NULL,
      \`version\` INT NOT NULL DEFAULT 1,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`sp_cash_recon_batches_cash_account_idx\` (\`cash_account_id\`),
      INDEX \`sp_cash_recon_batches_status_idx\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_match_links",
    `CREATE TABLE \`sp_cash_match_links\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`batch_id\` VARCHAR(191) NOT NULL,
      \`internal_line_id\` VARCHAR(191) NULL,
      \`external_line_id\` VARCHAR(191) NULL,
      \`broker_ref\` VARCHAR(191) NULL,
      \`custodian_ref\` VARCHAR(191) NULL,
      \`matched_amount\` DECIMAL(24,6) NOT NULL,
      \`topology\` VARCHAR(64) NULL,
      \`score_total\` DECIMAL(8,4) NULL,
      \`score_components_json\` JSON NULL,
      \`method\` VARCHAR(64) NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'PROPOSED',
      \`maker_id\` VARCHAR(191) NULL,
      \`checker_id\` VARCHAR(191) NULL,
      \`reversal_of\` VARCHAR(191) NULL,
      \`evidence_refs_json\` JSON NULL,
      \`version\` INT NOT NULL DEFAULT 1,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`sp_cash_match_links_batch_idx\` (\`batch_id\`),
      INDEX \`sp_cash_match_links_internal_line_idx\` (\`internal_line_id\`),
      INDEX \`sp_cash_match_links_external_line_idx\` (\`external_line_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_reconciliation_breaks",
    `CREATE TABLE \`sp_cash_reconciliation_breaks\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`batch_id\` VARCHAR(191) NOT NULL,
      \`break_code\` VARCHAR(64) NOT NULL,
      \`category\` VARCHAR(64) NOT NULL,
      \`value_date\` DATE NULL,
      \`details\` TEXT NULL,
      \`amount\` DECIMAL(24,6) NULL,
      \`currency\` VARCHAR(8) NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
      \`internal_line_id\` VARCHAR(191) NULL,
      \`external_line_id\` VARCHAR(191) NULL,
      \`exception_id\` VARCHAR(191) NULL,
      \`version\` INT NOT NULL DEFAULT 1,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`sp_cash_recon_breaks_batch_idx\` (\`batch_id\`),
      INDEX \`sp_cash_recon_breaks_status_idx\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_reconciliation_exceptions",
    `CREATE TABLE \`sp_cash_reconciliation_exceptions\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`batch_id\` VARCHAR(191) NULL,
      \`cash_account_id\` VARCHAR(191) NOT NULL,
      \`client_or_vehicle_id\` VARCHAR(191) NULL,
      \`category\` VARCHAR(64) NOT NULL,
      \`severity\` VARCHAR(32) NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
      \`amount_txn\` DECIMAL(24,6) NULL,
      \`currency_txn\` VARCHAR(8) NULL,
      \`amount_reporting\` DECIMAL(24,6) NULL,
      \`currency_reporting\` VARCHAR(8) NULL,
      \`assigned_to_id\` VARCHAR(191) NULL,
      \`approver_id\` VARCHAR(191) NULL,
      \`owner_role\` VARCHAR(64) NULL,
      \`sla_due_at\` DATETIME(3) NULL,
      \`resolution_json\` JSON NULL,
      \`age_days\` INT NULL,
      \`instrument_json\` JSON NULL,
      \`trade_date\` DATE NULL,
      \`settle_date\` DATE NULL,
      \`source\` VARCHAR(128) NULL,
      \`counterparty\` VARCHAR(255) NULL,
      \`version\` INT NOT NULL DEFAULT 1,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`sp_cash_recon_exceptions_batch_idx\` (\`batch_id\`),
      INDEX \`sp_cash_recon_exceptions_cash_account_idx\` (\`cash_account_id\`),
      INDEX \`sp_cash_recon_exceptions_status_idx\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_exception_timeline",
    `CREATE TABLE \`sp_cash_exception_timeline\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`exception_id\` VARCHAR(191) NOT NULL,
      \`event_type\` VARCHAR(64) NOT NULL,
      \`actor_id\` VARCHAR(191) NULL,
      \`notes\` TEXT NULL,
      \`payload_json\` JSON NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`sp_cash_exception_timeline_exception_idx\` (\`exception_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_period_closes",
    `CREATE TABLE \`sp_cash_period_closes\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`legal_entity_id\` VARCHAR(191) NOT NULL,
      \`period_code\` VARCHAR(64) NOT NULL,
      \`period_from\` DATE NOT NULL,
      \`period_to\` DATE NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'OPEN',
      \`close_version\` INT NOT NULL DEFAULT 1,
      \`control_totals_json\` JSON NULL,
      \`blockers_json\` JSON NULL,
      \`maker_id\` VARCHAR(191) NULL,
      \`checker_id\` VARCHAR(191) NULL,
      \`closed_at\` DATETIME(3) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`sp_cash_period_closes_entity_period_ver_key\` (\`legal_entity_id\`, \`period_code\`, \`close_version\`),
      INDEX \`sp_cash_period_closes_status_idx\` (\`status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_gl_exports",
    `CREATE TABLE \`sp_cash_gl_exports\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`period_close_id\` VARCHAR(191) NULL,
      \`legal_entity_id\` VARCHAR(191) NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      \`control_totals_json\` JSON NULL,
      \`external_posting_ref\` VARCHAR(191) NULL,
      \`attempt_count\` INT NOT NULL DEFAULT 0,
      \`idempotency_key\` VARCHAR(200) NOT NULL,
      \`last_error\` TEXT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`sp_cash_gl_exports_idempotency_key\` (\`idempotency_key\`),
      INDEX \`sp_cash_gl_exports_period_close_idx\` (\`period_close_id\`),
      INDEX \`sp_cash_gl_exports_legal_entity_idx\` (\`legal_entity_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_client_statement_runs",
    `CREATE TABLE \`sp_cash_client_statement_runs\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`client_or_vehicle_id\` VARCHAR(191) NOT NULL,
      \`cash_account_id\` VARCHAR(191) NOT NULL,
      \`period_from\` DATE NOT NULL,
      \`period_to\` DATE NOT NULL,
      \`statement_type\` VARCHAR(64) NOT NULL,
      \`currency\` VARCHAR(8) NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      \`created_by_id\` VARCHAR(191) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`sp_cash_client_stmt_runs_client_idx\` (\`client_or_vehicle_id\`),
      INDEX \`sp_cash_client_stmt_runs_cash_account_idx\` (\`cash_account_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_client_statements",
    `CREATE TABLE \`sp_cash_client_statements\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`run_id\` VARCHAR(191) NOT NULL,
      \`opening_cash\` DECIMAL(24,6) NOT NULL,
      \`closing_cash\` DECIMAL(24,6) NOT NULL,
      \`sections_json\` JSON NULL,
      \`checksum\` VARCHAR(128) NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
      \`approved_by_id\` VARCHAR(191) NULL,
      \`approved_at\` DATETIME(3) NULL,
      \`version\` INT NOT NULL DEFAULT 1,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`sp_cash_client_statements_run_idx\` (\`run_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_client_statement_deliveries",
    `CREATE TABLE \`sp_cash_client_statement_deliveries\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`statement_id\` VARCHAR(191) NOT NULL,
      \`channel\` VARCHAR(64) NOT NULL,
      \`status\` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
      \`delivered_at\` DATETIME(3) NULL,
      \`error_message\` TEXT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`sp_cash_client_stmt_deliveries_statement_idx\` (\`statement_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_broker_custodian_items",
    `CREATE TABLE \`sp_cash_broker_custodian_items\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`portfolio_id\` VARCHAR(191) NOT NULL,
      \`instrument_isin\` VARCHAR(32) NULL,
      \`instrument_name\` VARCHAR(255) NULL,
      \`symbol\` VARCHAR(64) NULL,
      \`quantity\` DECIMAL(24,6) NULL,
      \`price\` DECIMAL(24,6) NULL,
      \`trade_date\` DATE NULL,
      \`settle_date\` DATE NULL,
      \`internal_status\` VARCHAR(32) NULL,
      \`broker_status\` VARCHAR(32) NULL,
      \`custodian_status\` VARCHAR(32) NULL,
      \`overall_status\` VARCHAR(32) NULL,
      \`difference_amount\` DECIMAL(24,6) NULL,
      \`currency\` VARCHAR(8) NULL,
      \`assigned_to_id\` VARCHAR(191) NULL,
      \`comments\` TEXT NULL,
      \`version\` INT NOT NULL DEFAULT 1,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL,
      PRIMARY KEY (\`id\`),
      INDEX \`sp_cash_broker_custodian_items_portfolio_idx\` (\`portfolio_id\`),
      INDEX \`sp_cash_broker_custodian_items_overall_status_idx\` (\`overall_status\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_audit_events",
    `CREATE TABLE \`sp_cash_audit_events\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`actor_id\` VARCHAR(191) NULL,
      \`role_name\` VARCHAR(64) NULL,
      \`tenant_id\` VARCHAR(191) NULL,
      \`legal_entity_id\` VARCHAR(191) NULL,
      \`object_type\` VARCHAR(64) NOT NULL,
      \`object_id\` VARCHAR(191) NOT NULL,
      \`object_version\` INT NULL,
      \`event_type\` VARCHAR(64) NOT NULL,
      \`correlation_id\` VARCHAR(191) NULL,
      \`reason\` TEXT NULL,
      \`before_hash\` VARCHAR(128) NULL,
      \`after_hash\` VARCHAR(128) NULL,
      \`outcome\` VARCHAR(32) NULL,
      \`ip_address\` VARCHAR(64) NULL,
      \`payload_json\` JSON NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`sp_cash_audit_events_object_idx\` (\`object_type\`, \`object_id\`),
      INDEX \`sp_cash_audit_events_tenant_idx\` (\`tenant_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_idempotency_keys",
    `CREATE TABLE \`sp_cash_idempotency_keys\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`scope\` VARCHAR(512) NOT NULL,
      \`idempotency_key\` VARCHAR(200) NOT NULL,
      \`payload_hash\` VARCHAR(64) NOT NULL,
      \`status_code\` INT NOT NULL,
      \`response_json\` LONGTEXT NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`sp_cash_idempotency_scope_key\` (\`scope\`, \`idempotency_key\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  await createTable(
    "sp_cash_break_comments",
    `CREATE TABLE \`sp_cash_break_comments\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`break_id\` VARCHAR(191) NOT NULL,
      \`author_id\` VARCHAR(191) NOT NULL,
      \`body\` TEXT NOT NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      INDEX \`sp_cash_break_comments_break_idx\` (\`break_id\`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );

  console.log("[done] stock-picker-cash migration (27 tables)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
