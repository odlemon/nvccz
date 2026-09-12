/**
 * Investment Operations SRD schema hardening.
 *
 * Additive, idempotent and restart-safe. This migration deliberately extends
 * the existing investment_* and listed_equity_* domains.
 *
 * Run: npm run db:migrate:investment-ops-schema-hardening
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const MIGRATION = 'investment_ops_schema_hardening_v1';
const LOCK = 'nvccz:investment-ops-schema-hardening:v1';
const BATCH_SIZE = 500;

type CountRow = { c: bigint | number };

async function exists(sql: string, ...params: unknown[]): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<CountRow[]>(sql, ...params);
  return Number(rows[0]?.c ?? 0) > 0;
}

async function tableExists(table: string): Promise<boolean> {
  return exists(
    `SELECT COUNT(*) c FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table,
  );
}

async function columnExists(table: string, column: string): Promise<boolean> {
  return exists(
    `SELECT COUNT(*) c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column,
  );
}

async function indexExists(table: string, index: string): Promise<boolean> {
  return exists(
    `SELECT COUNT(*) c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    table,
    index,
  );
}

async function constraintExists(table: string, constraint: string): Promise<boolean> {
  return exists(
    `SELECT COUNT(*) c FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    table,
    constraint,
  );
}

async function addColumn(table: string, column: string, definition: string): Promise<void> {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN ${definition}`);
  console.log(`[ok] ${table}.${column}`);
}

async function addIndex(table: string, index: string, definition: string): Promise<void> {
  if (await indexExists(table, index)) {
    console.log(`[skip] ${table}.${index}`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD ${definition}`);
  console.log(`[ok] ${table}.${index}`);
}

async function addForeignKey(table: string, constraint: string, definition: string): Promise<void> {
  if (await constraintExists(table, constraint)) {
    console.log(`[skip] ${table}.${constraint}`);
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraint}\` ${definition}`,
  );
  console.log(`[ok] ${table}.${constraint}`);
}

async function createTable(name: string, body: string): Promise<void> {
  if (await tableExists(name)) {
    console.log(`[skip] ${name}`);
    return;
  }
  await prisma.$executeRawUnsafe(
    `CREATE TABLE \`${name}\` (${body})
     ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  );
  console.log(`[ok] ${name}`);
}

async function phaseDone(phase: string): Promise<boolean> {
  return exists(
    `SELECT COUNT(*) c FROM investment_ops_migration_phases
     WHERE migration_name = ? AND phase_name = ? AND completed_at IS NOT NULL`,
    MIGRATION,
    phase,
  );
}

async function completePhase(phase: string): Promise<void> {
  await prisma.$executeRawUnsafe(
    `INSERT INTO investment_ops_migration_phases
       (migration_name, phase_name, completed_at)
     VALUES (?, ?, NOW(3))
     ON DUPLICATE KEY UPDATE completed_at = VALUES(completed_at)`,
    MIGRATION,
    phase,
  );
}

async function runPhase(phase: string, work: () => Promise<void>): Promise<void> {
  if (await phaseDone(phase)) {
    console.log(`[skip phase] ${phase}`);
    return;
  }
  console.log(`[phase] ${phase}`);
  await work();
  await completePhase(phase);
}

async function preflight(): Promise<void> {
  const dbRows = await prisma.$queryRawUnsafe<Array<{ db: string | null; version: string }>>(
    'SELECT DATABASE() db, VERSION() version',
  );
  const target = dbRows[0];
  if (!target?.db) throw new Error('DATABASE_URL must select a source schema');

  const requiredTables = [
    'funds',
    'users',
    'investment_orders',
    'investment_order_approvals',
    'investment_valuation_runs',
    'investment_accounting_events',
    'investment_compliance_rules',
    'investment_compliance_results',
    'investment_reconciliation_batches',
    'investment_reconciliation_items',
    'investment_documents',
    'investment_model_portfolios',
    'listed_equity_price_ticks',
  ];
  const missing = [];
  for (const table of requiredTables) if (!(await tableExists(table))) missing.push(table);
  if (missing.length) {
    throw new Error(
      `Source schema ${target.db} is missing prerequisite tables: ${missing.join(', ')}. ` +
        'Run the existing listed-equity and Investment Ops migrations first.',
    );
  }
  for (const [table, column] of [
    ['investment_orders', 'order_ref'],
    ['investment_orders', 'fund_id'],
    ['listed_equity_price_ticks', 'priced_at'],
    ['investment_documents', 'file_ref'],
  ]) {
    if (!(await columnExists(table, column))) {
      throw new Error(`Source schema preflight failed: missing ${table}.${column}`);
    }
  }
  console.log(`[preflight] schema=${target.db} server=${target.version}`);
}

async function createFoundationTables(): Promise<void> {
  await createTable(
    'investment_ops_migration_phases',
    `migration_name VARCHAR(128) NOT NULL,
     phase_name VARCHAR(128) NOT NULL,
     completed_at DATETIME(3) NULL,
     PRIMARY KEY (migration_name, phase_name)`,
  );
}

async function extendExistingTables(): Promise<void> {
  await addColumn('listed_equity_price_ticks', 'source_code', '`source_code` VARCHAR(32) NULL');
  await addColumn(
    'listed_equity_price_ticks',
    'source_observed_at',
    '`source_observed_at` DATETIME(3) NULL',
  );
  await addColumn(
    'listed_equity_price_ticks',
    'source_checksum',
    '`source_checksum` VARCHAR(64) NULL',
  );
  await addColumn('listed_equity_price_ticks', 'approval_reason', '`approval_reason` TEXT NULL');
  await addColumn(
    'listed_equity_price_ticks',
    'idempotency_key',
    '`idempotency_key` VARCHAR(191) NULL',
  );
  await addColumn('listed_equity_price_ticks', 'version', '`version` INT NOT NULL DEFAULT 1');
  await addIndex(
    'listed_equity_price_ticks',
    'listed_equity_price_ticks_idempotency_key',
    'UNIQUE KEY `listed_equity_price_ticks_idempotency_key` (`idempotency_key`)',
  );
  await addIndex(
    'listed_equity_price_ticks',
    'listed_equity_price_ticks_source_priced_idx',
    'KEY `listed_equity_price_ticks_source_priced_idx` (`source_code`, `priced_at`)',
  );

  for (const [column, definition] of [
    ['idempotency_key', '`idempotency_key` VARCHAR(191) NULL'],
    ['portfolio_config_id', '`portfolio_config_id` VARCHAR(191) NULL'],
    ['folder_id', '`folder_id` VARCHAR(191) NULL'],
    ['version', '`version` INT NOT NULL DEFAULT 1'],
    ['current_revision_no', '`current_revision_no` INT NOT NULL DEFAULT 1'],
  ]) {
    await addColumn('investment_orders', column, definition);
  }
  await addIndex(
    'investment_orders',
    'investment_orders_idempotency_key',
    'UNIQUE KEY `investment_orders_idempotency_key` (`idempotency_key`)',
  );
  await addIndex(
    'investment_orders',
    'investment_orders_portfolio_status_idx',
    'KEY `investment_orders_portfolio_status_idx` (`portfolio_config_id`, `status`)',
  );
  await addIndex(
    'investment_orders',
    'investment_orders_folder_created_idx',
    'KEY `investment_orders_folder_created_idx` (`folder_id`, `created_at`)',
  );

  for (const [column, definition] of [
    ['approval_sequence', '`approval_sequence` INT NOT NULL DEFAULT 1'],
    ['revision_no', '`revision_no` INT NOT NULL DEFAULT 1'],
    ['idempotency_key', '`idempotency_key` VARCHAR(191) NULL'],
    ['decided_at', '`decided_at` DATETIME(3) NULL'],
  ]) {
    await addColumn('investment_order_approvals', column, definition);
  }
  await addIndex(
    'investment_order_approvals',
    'investment_order_approvals_idempotency_key',
    'UNIQUE KEY `investment_order_approvals_idempotency_key` (`idempotency_key`)',
  );
  // Legacy approvals can share the default sequence. Backfill resolves this before this exact key is added.

  for (const table of ['investment_valuation_runs', 'investment_accounting_events']) {
    await addColumn(table, 'idempotency_key', '`idempotency_key` VARCHAR(191) NULL');
    await addColumn(table, 'version', '`version` INT NOT NULL DEFAULT 1');
    await addIndex(
      table,
      `${table}_idempotency_key`,
      `UNIQUE KEY \`${table}_idempotency_key\` (\`idempotency_key\`)`,
    );
  }
  await addColumn('investment_compliance_rules', 'version', '`version` INT NOT NULL DEFAULT 1');
  await addColumn(
    'investment_compliance_results',
    'compliance_run_id',
    '`compliance_run_id` VARCHAR(191) NULL',
  );
  await addIndex(
    'investment_compliance_results',
    'investment_compliance_results_run_outcome_idx',
    'KEY `investment_compliance_results_run_outcome_idx` (`compliance_run_id`, `outcome`)',
  );

  await addColumn(
    'investment_reconciliation_batches',
    'source_id',
    '`source_id` VARCHAR(191) NULL',
  );
  await addColumn(
    'investment_reconciliation_batches',
    'idempotency_key',
    '`idempotency_key` VARCHAR(191) NULL',
  );
  await addColumn(
    'investment_reconciliation_batches',
    'version',
    '`version` INT NOT NULL DEFAULT 1',
  );
  await addIndex(
    'investment_reconciliation_batches',
    'investment_reconciliation_batches_idempotency_key',
    'UNIQUE KEY `investment_reconciliation_batches_idempotency_key` (`idempotency_key`)',
  );
  await addIndex(
    'investment_reconciliation_batches',
    'investment_reconciliation_batches_source_date_idx',
    'KEY `investment_reconciliation_batches_source_date_idx` (`source_id`, `as_of_date`)',
  );

  for (const [column, definition] of [
    ['current_version_no', '`current_version_no` INT NOT NULL DEFAULT 1'],
    ['checksum_sha256', '`checksum_sha256` VARCHAR(64) NULL'],
    ['encryption_key_ref', '`encryption_key_ref` VARCHAR(512) NULL'],
    ['classification', "`classification` VARCHAR(24) NOT NULL DEFAULT 'CONFIDENTIAL'"],
    ['retention_until', '`retention_until` DATE NULL'],
    ['is_deleted', '`is_deleted` BOOLEAN NOT NULL DEFAULT false'],
  ]) {
    await addColumn('investment_documents', column, definition);
  }
  await addIndex(
    'investment_documents',
    'investment_documents_order_type_idx',
    'KEY `investment_documents_order_type_idx` (`order_id`, `document_type`)',
  );
  await addColumn(
    'investment_model_portfolios',
    'current_version_no',
    '`current_version_no` INT NOT NULL DEFAULT 1',
  );
}

async function createPortfolioAndTradingTables(): Promise<void> {
  await createTable(
    'investment_portfolio_access_capabilities',
    `id VARCHAR(191) NOT NULL, fund_id VARCHAR(191) NOT NULL, user_id VARCHAR(191) NOT NULL,
     capability_code VARCHAR(64) NOT NULL, scope_json JSON NULL, granted_by_id VARCHAR(191) NULL,
     expires_at DATETIME(3) NULL, revoked_at DATETIME(3) NULL, version INT NOT NULL DEFAULT 1,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL,
     PRIMARY KEY (id),
     UNIQUE KEY investment_portfolio_access_capability_key (fund_id, user_id, capability_code),
     KEY investment_portfolio_access_user_active_idx (user_id, revoked_at, expires_at)`,
  );
  await createTable(
    'investment_portfolio_folders',
    `id VARCHAR(191) NOT NULL, fund_id VARCHAR(191) NOT NULL, parent_id VARCHAR(191) NULL,
     name VARCHAR(191) NOT NULL, path VARCHAR(500) NOT NULL, sort_order INT NOT NULL DEFAULT 0,
     version INT NOT NULL DEFAULT 1, is_archived BOOLEAN NOT NULL DEFAULT false,
     created_by_id VARCHAR(191) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     updated_at DATETIME(3) NOT NULL, PRIMARY KEY (id),
     UNIQUE KEY investment_portfolio_folders_fund_path_key (fund_id, path),
     KEY investment_portfolio_folders_parent_sort_idx (parent_id, sort_order),
     CONSTRAINT investment_portfolio_folders_parent_fk FOREIGN KEY (parent_id)
       REFERENCES investment_portfolio_folders (id) ON DELETE SET NULL ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_portfolio_configs',
    `id VARCHAR(191) NOT NULL, fund_id VARCHAR(191) NOT NULL, base_currency_code VARCHAR(3) NOT NULL,
     valuation_policy_json JSON NULL, settlement_policy_json JSON NULL, approval_policy_json JSON NULL,
     version INT NOT NULL DEFAULT 1, is_active BOOLEAN NOT NULL DEFAULT true,
     created_by_id VARCHAR(191) NULL, updated_by_id VARCHAR(191) NULL,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL,
     PRIMARY KEY (id), UNIQUE KEY investment_portfolio_configs_fund_key (fund_id),
     CONSTRAINT investment_portfolio_configs_fund_fk FOREIGN KEY (fund_id)
       REFERENCES funds (id) ON DELETE RESTRICT ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_portfolio_assignments',
    `id VARCHAR(191) NOT NULL, portfolio_config_id VARCHAR(191) NOT NULL, folder_id VARCHAR(191) NULL,
     user_id VARCHAR(191) NOT NULL, assignment_role VARCHAR(32) NOT NULL,
     effective_from DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), effective_to DATETIME(3) NULL,
     version INT NOT NULL DEFAULT 1, created_by_id VARCHAR(191) NULL,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL,
     PRIMARY KEY (id),
     UNIQUE KEY investment_portfolio_assignments_role_key (portfolio_config_id, user_id, assignment_role),
     KEY investment_portfolio_assignments_user_active_idx (user_id, effective_to),
     CONSTRAINT investment_portfolio_assignments_config_fk FOREIGN KEY (portfolio_config_id)
       REFERENCES investment_portfolio_configs (id) ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT investment_portfolio_assignments_folder_fk FOREIGN KEY (folder_id)
       REFERENCES investment_portfolio_folders (id) ON DELETE SET NULL ON UPDATE CASCADE,
     CONSTRAINT investment_portfolio_assignments_user_fk FOREIGN KEY (user_id)
       REFERENCES users (id) ON DELETE RESTRICT ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_portfolio_limits',
    `id VARCHAR(191) NOT NULL, portfolio_config_id VARCHAR(191) NOT NULL, compliance_rule_id VARCHAR(191) NULL,
     limit_code VARCHAR(64) NOT NULL, dimension_type VARCHAR(32) NOT NULL, dimension_value VARCHAR(191) NULL,
     warning_value DECIMAL(20,8) NULL, hard_value DECIMAL(20,8) NULL, unit VARCHAR(24) NOT NULL,
     effective_from DATE NOT NULL, effective_to DATE NULL, version INT NOT NULL DEFAULT 1,
     is_active BOOLEAN NOT NULL DEFAULT true, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     updated_at DATETIME(3) NOT NULL, PRIMARY KEY (id),
     UNIQUE KEY investment_portfolio_limits_effective_key (portfolio_config_id, limit_code, effective_from),
     KEY investment_portfolio_limits_active_idx (portfolio_config_id, is_active, effective_to),
     CONSTRAINT investment_portfolio_limits_config_fk FOREIGN KEY (portfolio_config_id)
       REFERENCES investment_portfolio_configs (id) ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT investment_portfolio_limits_rule_fk FOREIGN KEY (compliance_rule_id)
       REFERENCES investment_compliance_rules (id) ON DELETE SET NULL ON UPDATE CASCADE,
     CONSTRAINT investment_portfolio_limits_values_chk CHECK
       ((warning_value IS NULL OR warning_value >= 0) AND (hard_value IS NULL OR hard_value >= 0))`,
  );
  await createTable(
    'investment_fx_rate_snapshots',
    `id VARCHAR(191) NOT NULL, base_currency_code VARCHAR(3) NOT NULL, quote_currency_code VARCHAR(3) NOT NULL,
     rate DECIMAL(20,10) NOT NULL, rate_type VARCHAR(24) NOT NULL, source_code VARCHAR(64) NOT NULL,
     source_reference VARCHAR(512) NULL, source_observed_at DATETIME(3) NOT NULL,
     source_checksum VARCHAR(64) NULL, approval_status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
     approved_by_id VARCHAR(191) NULL, approved_at DATETIME(3) NULL, approval_reason TEXT NULL,
     idempotency_key VARCHAR(191) NOT NULL, version INT NOT NULL DEFAULT 1,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id),
     UNIQUE KEY investment_fx_rate_snapshots_idempotency_key (idempotency_key),
     KEY investment_fx_snapshots_pair_time_idx (base_currency_code, quote_currency_code, source_observed_at),
     KEY investment_fx_snapshots_approval_idx (approval_status, source_observed_at),
     CONSTRAINT investment_fx_rate_snapshots_rate_chk CHECK (rate > 0)`,
  );
  await createTable(
    'investment_order_previews',
    `id VARCHAR(191) NOT NULL, order_id VARCHAR(191) NOT NULL, revision_no INT NOT NULL,
     idempotency_key VARCHAR(191) NOT NULL, input_json JSON NOT NULL, estimated_json JSON NOT NULL,
     compliance_json JSON NULL, price_snapshot_id VARCHAR(191) NULL, fx_snapshot_id VARCHAR(191) NULL,
     expires_at DATETIME(3) NOT NULL, created_by_id VARCHAR(191) NULL,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id),
     UNIQUE KEY investment_order_previews_idempotency_key (idempotency_key),
     UNIQUE KEY investment_order_previews_revision_key (order_id, revision_no),
     KEY investment_order_previews_expiry_idx (order_id, expires_at),
     CONSTRAINT investment_order_previews_order_fk FOREIGN KEY (order_id)
       REFERENCES investment_orders (id) ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT investment_order_previews_fx_fk FOREIGN KEY (fx_snapshot_id)
       REFERENCES investment_fx_rate_snapshots (id) ON DELETE SET NULL ON UPDATE CASCADE,
     CONSTRAINT investment_order_previews_revision_chk CHECK (revision_no > 0)`,
  );
  await createTable(
    'investment_order_revisions',
    `id VARCHAR(191) NOT NULL, order_id VARCHAR(191) NOT NULL, revision_no INT NOT NULL,
     snapshot_json JSON NOT NULL, change_reason TEXT NULL, content_hash VARCHAR(64) NOT NULL,
     created_by_id VARCHAR(191) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     PRIMARY KEY (id), UNIQUE KEY investment_order_revisions_number_key (order_id, revision_no),
     KEY investment_order_revisions_created_idx (order_id, created_at),
     CONSTRAINT investment_order_revisions_order_fk FOREIGN KEY (order_id)
       REFERENCES investment_orders (id) ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT investment_order_revisions_number_chk CHECK (revision_no > 0)`,
  );
  await createTable(
    'investment_order_status_events',
    `id VARCHAR(191) NOT NULL, order_id VARCHAR(191) NOT NULL, sequence_no INT NOT NULL,
     from_status VARCHAR(24) NULL, to_status VARCHAR(24) NOT NULL, reason_code VARCHAR(64) NULL,
     reason TEXT NULL, actor_id VARCHAR(191) NULL, idempotency_key VARCHAR(191) NULL,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id),
     UNIQUE KEY investment_order_status_events_idempotency_key (idempotency_key),
     UNIQUE KEY investment_order_status_events_sequence_key (order_id, sequence_no),
     KEY investment_order_status_events_created_idx (order_id, created_at),
     CONSTRAINT investment_order_status_events_order_fk FOREIGN KEY (order_id)
       REFERENCES investment_orders (id) ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT investment_order_status_events_sequence_chk CHECK (sequence_no > 0)`,
  );
  await createTable(
    'investment_order_routes',
    `id VARCHAR(191) NOT NULL, order_id VARCHAR(191) NOT NULL, route_sequence INT NOT NULL,
     venue_code VARCHAR(32) NOT NULL, broker_profile_id VARCHAR(191) NULL,
     status VARCHAR(24) NOT NULL DEFAULT 'PENDING', external_order_ref VARCHAR(191) NULL,
     request_payload JSON NULL, response_payload JSON NULL, idempotency_key VARCHAR(191) NOT NULL,
     routed_at DATETIME(3) NULL, acknowledged_at DATETIME(3) NULL,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL,
     PRIMARY KEY (id), UNIQUE KEY investment_order_routes_idempotency_key (idempotency_key),
     UNIQUE KEY investment_order_routes_sequence_key (order_id, route_sequence),
     KEY investment_order_routes_status_idx (status, routed_at),
     CONSTRAINT investment_order_routes_order_fk FOREIGN KEY (order_id)
       REFERENCES investment_orders (id) ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_order_executions',
    `id VARCHAR(191) NOT NULL, order_id VARCHAR(191) NOT NULL, route_id VARCHAR(191) NULL,
     execution_ref VARCHAR(191) NOT NULL, quantity DECIMAL(20,8) NOT NULL, price DECIMAL(20,8) NOT NULL,
     gross_amount DECIMAL(20,8) NOT NULL, fee_amount DECIMAL(20,8) NOT NULL DEFAULT 0,
     tax_amount DECIMAL(20,8) NOT NULL DEFAULT 0, currency_code VARCHAR(3) NOT NULL,
     executed_at DATETIME(3) NOT NULL, settlement_date DATE NULL, idempotency_key VARCHAR(191) NOT NULL,
     raw_payload JSON NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id),
     UNIQUE KEY investment_order_executions_idempotency_key (idempotency_key),
     UNIQUE KEY investment_order_executions_ref_key (order_id, execution_ref),
     KEY investment_order_executions_order_time_idx (order_id, executed_at),
     CONSTRAINT investment_order_executions_order_fk FOREIGN KEY (order_id)
       REFERENCES investment_orders (id) ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT investment_order_executions_route_fk FOREIGN KEY (route_id)
       REFERENCES investment_order_routes (id) ON DELETE SET NULL ON UPDATE CASCADE,
     CONSTRAINT investment_order_executions_values_chk CHECK
       (quantity > 0 AND price >= 0 AND fee_amount >= 0 AND tax_amount >= 0)`,
  );
  await createTable(
    'investment_blotters',
    `id VARCHAR(191) NOT NULL, fund_id VARCHAR(191) NOT NULL, blotter_date DATE NOT NULL,
     blotter_type VARCHAR(24) NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
     version INT NOT NULL DEFAULT 1, closed_by_id VARCHAR(191) NULL, closed_at DATETIME(3) NULL,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL,
     PRIMARY KEY (id), UNIQUE KEY investment_blotters_fund_date_type_key (fund_id, blotter_date, blotter_type),
     KEY investment_blotters_status_date_idx (status, blotter_date)`,
  );
  await createTable(
    'investment_blotter_items',
    `id VARCHAR(191) NOT NULL, blotter_id VARCHAR(191) NOT NULL, order_id VARCHAR(191) NOT NULL,
     line_no INT NOT NULL, snapshot_json JSON NOT NULL,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id),
     UNIQUE KEY investment_blotter_items_line_key (blotter_id, line_no),
     UNIQUE KEY investment_blotter_items_order_key (blotter_id, order_id),
     CONSTRAINT investment_blotter_items_blotter_fk FOREIGN KEY (blotter_id)
       REFERENCES investment_blotters (id) ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT investment_blotter_items_order_fk FOREIGN KEY (order_id)
       REFERENCES investment_orders (id) ON DELETE RESTRICT ON UPDATE CASCADE`,
  );
  await addForeignKey(
    'investment_orders',
    'investment_orders_portfolio_config_fk',
    'FOREIGN KEY (`portfolio_config_id`) REFERENCES `investment_portfolio_configs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  );
  await addForeignKey(
    'investment_orders',
    'investment_orders_folder_fk',
    'FOREIGN KEY (`folder_id`) REFERENCES `investment_portfolio_folders` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  );
}

async function createLedgerAndControlTables(): Promise<void> {
  await createTable(
    'investment_transactions',
    `id VARCHAR(191) NOT NULL, transaction_ref VARCHAR(64) NOT NULL, fund_id VARCHAR(191) NOT NULL,
     order_id VARCHAR(191) NULL, execution_id VARCHAR(191) NULL, instrument_id VARCHAR(191) NULL,
     transaction_type VARCHAR(32) NOT NULL, trade_date DATE NOT NULL, settlement_date DATE NULL,
     quantity DECIMAL(20,8) NULL, unit_price DECIMAL(20,8) NULL, gross_amount DECIMAL(20,8) NOT NULL,
     net_amount DECIMAL(20,8) NOT NULL, currency_code VARCHAR(3) NOT NULL,
     status VARCHAR(24) NOT NULL DEFAULT 'PENDING', idempotency_key VARCHAR(191) NOT NULL,
     version INT NOT NULL DEFAULT 1, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     updated_at DATETIME(3) NOT NULL, PRIMARY KEY (id),
     UNIQUE KEY investment_transactions_ref_key (transaction_ref),
     UNIQUE KEY investment_transactions_idempotency_key (idempotency_key),
     KEY investment_transactions_fund_date_idx (fund_id, trade_date, status),
     KEY investment_transactions_instrument_date_idx (instrument_id, trade_date),
     CONSTRAINT investment_transactions_order_fk FOREIGN KEY (order_id)
       REFERENCES investment_orders (id) ON DELETE SET NULL ON UPDATE CASCADE,
     CONSTRAINT investment_transactions_execution_fk FOREIGN KEY (execution_id)
       REFERENCES investment_order_executions (id) ON DELETE SET NULL ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_cash_accounts',
    `id VARCHAR(191) NOT NULL, portfolio_config_id VARCHAR(191) NOT NULL, account_code VARCHAR(64) NOT NULL,
     currency_code VARCHAR(3) NOT NULL, bank_id VARCHAR(191) NULL, status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
     version INT NOT NULL DEFAULT 1, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     updated_at DATETIME(3) NOT NULL, PRIMARY KEY (id),
     UNIQUE KEY investment_cash_accounts_code_currency_key (portfolio_config_id, account_code, currency_code),
     KEY investment_cash_accounts_bank_status_idx (bank_id, status),
     CONSTRAINT investment_cash_accounts_config_fk FOREIGN KEY (portfolio_config_id)
       REFERENCES investment_portfolio_configs (id) ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_cash_ledger_entries',
    `id VARCHAR(191) NOT NULL, cash_account_id VARCHAR(191) NOT NULL, transaction_id VARCHAR(191) NULL,
     entry_type VARCHAR(24) NOT NULL, amount DECIMAL(20,8) NOT NULL, currency_code VARCHAR(3) NOT NULL,
     effective_at DATETIME(3) NOT NULL, value_date DATE NULL, status VARCHAR(16) NOT NULL DEFAULT 'POSTED',
     idempotency_key VARCHAR(191) NOT NULL, running_balance DECIMAL(20,8) NULL,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id),
     UNIQUE KEY investment_cash_ledger_entries_idempotency_key (idempotency_key),
     KEY investment_cash_ledger_account_time_idx (cash_account_id, effective_at, id),
     KEY investment_cash_ledger_transaction_idx (transaction_id),
     CONSTRAINT investment_cash_ledger_account_fk FOREIGN KEY (cash_account_id)
       REFERENCES investment_cash_accounts (id) ON DELETE RESTRICT ON UPDATE CASCADE,
     CONSTRAINT investment_cash_ledger_transaction_fk FOREIGN KEY (transaction_id)
       REFERENCES investment_transactions (id) ON DELETE SET NULL ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_valuation_input_snapshots',
    `id VARCHAR(191) NOT NULL, valuation_run_id VARCHAR(191) NOT NULL, input_type VARCHAR(32) NOT NULL,
     instrument_id VARCHAR(191) NULL, price_tick_id VARCHAR(191) NULL, fx_snapshot_id VARCHAR(191) NULL,
     source_code VARCHAR(64) NULL, source_observed_at DATETIME(3) NULL, value_json JSON NOT NULL,
     content_hash VARCHAR(64) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     PRIMARY KEY (id),
     UNIQUE KEY investment_valuation_inputs_run_type_instrument_key (valuation_run_id, input_type, instrument_id),
     KEY investment_valuation_inputs_price_tick_idx (price_tick_id),
     CONSTRAINT investment_valuation_inputs_run_fk FOREIGN KEY (valuation_run_id)
       REFERENCES investment_valuation_runs (id) ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT investment_valuation_inputs_fx_fk FOREIGN KEY (fx_snapshot_id)
       REFERENCES investment_fx_rate_snapshots (id) ON DELETE SET NULL ON UPDATE CASCADE,
     CONSTRAINT investment_valuation_inputs_tick_fk FOREIGN KEY (price_tick_id)
       REFERENCES listed_equity_price_ticks (id) ON DELETE SET NULL ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_valuation_item_snapshots',
    `id VARCHAR(191) NOT NULL, valuation_run_id VARCHAR(191) NOT NULL, fund_id VARCHAR(191) NOT NULL,
     instrument_id VARCHAR(191) NULL, security_id VARCHAR(191) NULL, quantity DECIMAL(20,8) NOT NULL,
     price DECIMAL(20,8) NOT NULL, market_value DECIMAL(20,8) NOT NULL,
     base_market_value DECIMAL(20,8) NOT NULL, cost_value DECIMAL(20,8) NULL,
     unrealized_pnl DECIMAL(20,8) NULL, currency_code VARCHAR(3) NOT NULL,
     method_code VARCHAR(32) NOT NULL, input_fingerprint VARCHAR(64) NOT NULL,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id),
     UNIQUE KEY investment_valuation_items_run_instrument_security_key
       (valuation_run_id, instrument_id, security_id),
     KEY investment_valuation_items_fund_instrument_idx (fund_id, instrument_id),
     CONSTRAINT investment_valuation_items_run_fk FOREIGN KEY (valuation_run_id)
       REFERENCES investment_valuation_runs (id) ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_compliance_runs',
    `id VARCHAR(191) NOT NULL, fund_id VARCHAR(191) NOT NULL, order_id VARCHAR(191) NULL,
     run_type VARCHAR(24) NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'RUNNING',
     rule_set_version INT NOT NULL, input_snapshot JSON NOT NULL, idempotency_key VARCHAR(191) NOT NULL,
     started_by_id VARCHAR(191) NULL, completed_at DATETIME(3) NULL,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id),
     UNIQUE KEY investment_compliance_runs_idempotency_key (idempotency_key),
     KEY investment_compliance_runs_fund_created_idx (fund_id, created_at),
     KEY investment_compliance_runs_order_status_idx (order_id, status),
     CONSTRAINT investment_compliance_runs_order_fk FOREIGN KEY (order_id)
       REFERENCES investment_orders (id) ON DELETE SET NULL ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_compliance_overrides',
    `id VARCHAR(191) NOT NULL, compliance_result_id VARCHAR(191) NOT NULL,
     status VARCHAR(16) NOT NULL DEFAULT 'PENDING', reason_code VARCHAR(64) NOT NULL, reason TEXT NOT NULL,
     requested_by_id VARCHAR(191) NULL, decided_by_id VARCHAR(191) NULL, decided_at DATETIME(3) NULL,
     expires_at DATETIME(3) NULL, document_id VARCHAR(191) NULL, version INT NOT NULL DEFAULT 1,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL,
     PRIMARY KEY (id), KEY investment_compliance_overrides_result_status_idx (compliance_result_id, status),
     CONSTRAINT investment_compliance_overrides_result_fk FOREIGN KEY (compliance_result_id)
       REFERENCES investment_compliance_results (id) ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_reconciliation_sources',
    `id VARCHAR(191) NOT NULL, fund_id VARCHAR(191) NULL, source_code VARCHAR(64) NOT NULL,
     source_type VARCHAR(32) NOT NULL, display_name VARCHAR(191) NOT NULL, config_json JSON NULL,
     credential_ref VARCHAR(512) NULL, is_active BOOLEAN NOT NULL DEFAULT true, version INT NOT NULL DEFAULT 1,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL,
     PRIMARY KEY (id), UNIQUE KEY investment_reconciliation_sources_fund_code_key (fund_id, source_code),
     KEY investment_reconciliation_sources_type_active_idx (source_type, is_active)`,
  );
  await createTable(
    'investment_reconciliation_item_history',
    `id VARCHAR(191) NOT NULL, item_id VARCHAR(191) NOT NULL, sequence_no INT NOT NULL,
     from_status VARCHAR(24) NULL, to_status VARCHAR(24) NOT NULL, snapshot_json JSON NOT NULL,
     actor_id VARCHAR(191) NULL, reason TEXT NULL,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id),
     UNIQUE KEY investment_reconciliation_item_history_sequence_key (item_id, sequence_no),
     KEY investment_reconciliation_item_history_created_idx (item_id, created_at),
     CONSTRAINT investment_reconciliation_item_history_item_fk FOREIGN KEY (item_id)
       REFERENCES investment_reconciliation_items (id) ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_reconciliation_resolutions',
    `id VARCHAR(191) NOT NULL, item_id VARCHAR(191) NOT NULL, resolution_type VARCHAR(32) NOT NULL,
     status VARCHAR(24) NOT NULL DEFAULT 'PROPOSED', reason TEXT NOT NULL, adjustment_json JSON NULL,
     document_id VARCHAR(191) NULL, proposed_by_id VARCHAR(191) NULL, approved_by_id VARCHAR(191) NULL,
     approved_at DATETIME(3) NULL, version INT NOT NULL DEFAULT 1,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL,
     PRIMARY KEY (id), KEY investment_reconciliation_resolutions_item_status_idx (item_id, status),
     CONSTRAINT investment_reconciliation_resolutions_item_fk FOREIGN KEY (item_id)
       REFERENCES investment_reconciliation_items (id) ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await addForeignKey(
    'investment_compliance_results',
    'investment_compliance_results_run_fk',
    'FOREIGN KEY (`compliance_run_id`) REFERENCES `investment_compliance_runs` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  );
  await addForeignKey(
    'investment_reconciliation_batches',
    'investment_reconciliation_batches_source_fk',
    'FOREIGN KEY (`source_id`) REFERENCES `investment_reconciliation_sources` (`id`) ON DELETE SET NULL ON UPDATE CASCADE',
  );
}

async function createWorkflowAndPlatformTables(): Promise<void> {
  await createTable(
    'investment_accounting_journal_workflows',
    `id VARCHAR(191) NOT NULL, accounting_event_id VARCHAR(191) NOT NULL, journal_entry_id VARCHAR(191) NULL,
     workflow_status VARCHAR(24) NOT NULL DEFAULT 'DRAFT', sequence_no INT NOT NULL,
     action VARCHAR(32) NOT NULL, actor_id VARCHAR(191) NULL, reason TEXT NULL,
     idempotency_key VARCHAR(191) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     PRIMARY KEY (id), UNIQUE KEY investment_accounting_workflows_idempotency_key (idempotency_key),
     UNIQUE KEY investment_accounting_workflows_sequence_key (accounting_event_id, sequence_no),
     KEY investment_accounting_workflows_status_idx (workflow_status, created_at),
     CONSTRAINT investment_accounting_workflows_event_fk FOREIGN KEY (accounting_event_id)
       REFERENCES investment_accounting_events (id) ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_accounting_reversals',
    `id VARCHAR(191) NOT NULL, accounting_event_id VARCHAR(191) NOT NULL,
     original_journal_entry_id VARCHAR(191) NOT NULL, reversal_journal_entry_id VARCHAR(191) NULL,
     status VARCHAR(24) NOT NULL DEFAULT 'REQUESTED', reason TEXT NOT NULL,
     requested_by_id VARCHAR(191) NULL, approved_by_id VARCHAR(191) NULL, approved_at DATETIME(3) NULL,
     idempotency_key VARCHAR(191) NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     updated_at DATETIME(3) NOT NULL, PRIMARY KEY (id),
     UNIQUE KEY investment_accounting_reversals_idempotency_key (idempotency_key),
     KEY investment_accounting_reversals_original_idx (original_journal_entry_id, status),
     CONSTRAINT investment_accounting_reversals_event_fk FOREIGN KEY (accounting_event_id)
       REFERENCES investment_accounting_events (id) ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_accounting_export_links',
    `id VARCHAR(191) NOT NULL, accounting_event_id VARCHAR(191) NOT NULL,
     export_system VARCHAR(64) NOT NULL, export_batch_ref VARCHAR(191) NOT NULL,
     external_ref VARCHAR(191) NULL, status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
     payload_hash VARCHAR(64) NULL, exported_at DATETIME(3) NULL, idempotency_key VARCHAR(191) NOT NULL,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL,
     PRIMARY KEY (id), UNIQUE KEY investment_accounting_export_links_idempotency_key (idempotency_key),
     UNIQUE KEY investment_accounting_export_links_batch_event_key
       (export_system, export_batch_ref, accounting_event_id),
     KEY investment_accounting_export_links_status_idx (status, created_at),
     CONSTRAINT investment_accounting_export_links_event_fk FOREIGN KEY (accounting_event_id)
       REFERENCES investment_accounting_events (id) ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_document_versions',
    `id VARCHAR(191) NOT NULL, document_id VARCHAR(191) NOT NULL, version_no INT NOT NULL,
     storage_provider VARCHAR(32) NOT NULL, storage_key VARCHAR(700) NOT NULL,
     file_name VARCHAR(255) NOT NULL, mime_type VARCHAR(128) NOT NULL, byte_size BIGINT NOT NULL,
     checksum_sha256 VARCHAR(64) NOT NULL, encryption_key_ref VARCHAR(512) NULL,
     malware_status VARCHAR(24) NOT NULL DEFAULT 'PENDING', uploaded_by_id VARCHAR(191) NULL,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id),
     UNIQUE KEY investment_document_versions_number_key (document_id, version_no),
     UNIQUE KEY investment_document_versions_storage_key (storage_provider, storage_key),
     KEY investment_document_versions_checksum_idx (checksum_sha256),
     CONSTRAINT investment_document_versions_document_fk FOREIGN KEY (document_id)
       REFERENCES investment_documents (id) ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT investment_document_versions_size_chk CHECK (byte_size >= 0)`,
  );
  await createTable(
    'investment_document_acls',
    `id VARCHAR(191) NOT NULL, document_id VARCHAR(191) NOT NULL, principal_type VARCHAR(16) NOT NULL,
     principal_id VARCHAR(191) NOT NULL, permission VARCHAR(24) NOT NULL, granted_by_id VARCHAR(191) NULL,
     expires_at DATETIME(3) NULL, revoked_at DATETIME(3) NULL,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id),
     UNIQUE KEY investment_document_acls_principal_permission_key
       (document_id, principal_type, principal_id, permission),
     KEY investment_document_acls_principal_active_idx (principal_type, principal_id, revoked_at),
     CONSTRAINT investment_document_acls_document_fk FOREIGN KEY (document_id)
       REFERENCES investment_documents (id) ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_document_links',
    `id VARCHAR(191) NOT NULL, document_id VARCHAR(191) NOT NULL, entity_type VARCHAR(64) NOT NULL,
     entity_id VARCHAR(191) NOT NULL, link_type VARCHAR(24) NOT NULL DEFAULT 'ATTACHMENT',
     created_by_id VARCHAR(191) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     PRIMARY KEY (id), UNIQUE KEY investment_document_links_entity_key
       (document_id, entity_type, entity_id, link_type),
     KEY investment_document_links_lookup_idx (entity_type, entity_id),
     CONSTRAINT investment_document_links_document_fk FOREIGN KEY (document_id)
       REFERENCES investment_documents (id) ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_jobs',
    `id VARCHAR(191) NOT NULL, job_type VARCHAR(64) NOT NULL, aggregate_type VARCHAR(64) NULL,
     aggregate_id VARCHAR(191) NULL, payload_json JSON NOT NULL, status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
     priority INT NOT NULL DEFAULT 100, idempotency_key VARCHAR(191) NOT NULL,
     available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), locked_by VARCHAR(191) NULL,
     locked_at DATETIME(3) NULL, lease_expires_at DATETIME(3) NULL, max_attempts INT NOT NULL DEFAULT 5,
     attempt_count INT NOT NULL DEFAULT 0, last_error TEXT NULL, completed_at DATETIME(3) NULL,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL,
     PRIMARY KEY (id), UNIQUE KEY investment_jobs_idempotency_key (idempotency_key),
     KEY investment_jobs_dequeue_idx (status, available_at, priority),
     KEY investment_jobs_lease_idx (lease_expires_at, status),
     KEY investment_jobs_aggregate_idx (aggregate_type, aggregate_id),
     CONSTRAINT investment_jobs_attempts_chk CHECK
       (max_attempts > 0 AND attempt_count >= 0 AND attempt_count <= max_attempts)`,
  );
  await createTable(
    'investment_job_attempts',
    `id VARCHAR(191) NOT NULL, job_id VARCHAR(191) NOT NULL, attempt_no INT NOT NULL,
     worker_id VARCHAR(191) NOT NULL, status VARCHAR(24) NOT NULL, started_at DATETIME(3) NOT NULL,
     completed_at DATETIME(3) NULL, error_code VARCHAR(64) NULL, error_message TEXT NULL,
     result_json JSON NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id),
     UNIQUE KEY investment_job_attempts_number_key (job_id, attempt_no),
     KEY investment_job_attempts_status_idx (status, started_at),
     CONSTRAINT investment_job_attempts_job_fk FOREIGN KEY (job_id)
       REFERENCES investment_jobs (id) ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT investment_job_attempts_number_chk CHECK (attempt_no > 0)`,
  );
  await createTable(
    'investment_outbox_events',
    `id VARCHAR(191) NOT NULL, aggregate_type VARCHAR(64) NOT NULL, aggregate_id VARCHAR(191) NOT NULL,
     aggregate_version INT NOT NULL, event_type VARCHAR(128) NOT NULL, payload_json JSON NOT NULL,
     headers_json JSON NULL, idempotency_key VARCHAR(191) NOT NULL,
     status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
     available_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), attempt_count INT NOT NULL DEFAULT 0,
     published_at DATETIME(3) NULL, last_error TEXT NULL,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id),
     UNIQUE KEY investment_outbox_events_idempotency_key (idempotency_key),
     UNIQUE KEY investment_outbox_events_aggregate_version_key
       (aggregate_type, aggregate_id, aggregate_version, event_type),
     KEY investment_outbox_events_publish_idx (status, available_at, created_at),
     CONSTRAINT investment_outbox_events_version_chk CHECK
       (aggregate_version > 0 AND attempt_count >= 0)`,
  );
  await createTable(
    'investment_audit_events',
    `id VARCHAR(191) NOT NULL, aggregate_type VARCHAR(64) NOT NULL, aggregate_id VARCHAR(191) NOT NULL,
     sequence_no INT NOT NULL, event_type VARCHAR(128) NOT NULL, actor_id VARCHAR(191) NULL,
     correlation_id VARCHAR(191) NULL, request_id VARCHAR(191) NULL, before_json JSON NULL,
     after_json JSON NULL, metadata_json JSON NULL, previous_hash VARCHAR(64) NULL,
     event_hash VARCHAR(64) NOT NULL, occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id),
     UNIQUE KEY investment_audit_events_sequence_key (aggregate_type, aggregate_id, sequence_no),
     UNIQUE KEY investment_audit_events_hash_key (event_hash),
     KEY investment_audit_events_actor_time_idx (actor_id, occurred_at),
     KEY investment_audit_events_correlation_idx (correlation_id),
     CONSTRAINT investment_audit_events_sequence_chk CHECK (sequence_no > 0)`,
  );
  await createTable(
    'investment_saved_views',
    `id VARCHAR(191) NOT NULL, user_id VARCHAR(191) NOT NULL, view_type VARCHAR(64) NOT NULL,
     name VARCHAR(191) NOT NULL, filter_json JSON NOT NULL, column_json JSON NULL, sort_json JSON NULL,
     is_default BOOLEAN NOT NULL DEFAULT false, version INT NOT NULL DEFAULT 1,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL,
     PRIMARY KEY (id), UNIQUE KEY investment_saved_views_user_type_name_key (user_id, view_type, name),
     KEY investment_saved_views_default_idx (user_id, view_type, is_default),
     CONSTRAINT investment_saved_views_user_fk FOREIGN KEY (user_id)
       REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE`,
  );
}

async function createModelAndRebalanceTables(): Promise<void> {
  await createTable(
    'investment_model_portfolio_versions',
    `id VARCHAR(191) NOT NULL, model_portfolio_id VARCHAR(191) NOT NULL, version_no INT NOT NULL,
     status VARCHAR(24) NOT NULL DEFAULT 'DRAFT', effective_from DATE NULL, change_reason TEXT NULL,
     content_hash VARCHAR(64) NOT NULL, created_by_id VARCHAR(191) NULL, approved_by_id VARCHAR(191) NULL,
     approved_at DATETIME(3) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     PRIMARY KEY (id), UNIQUE KEY investment_model_portfolio_versions_number_key
       (model_portfolio_id, version_no),
     UNIQUE KEY investment_model_portfolio_versions_hash_key (model_portfolio_id, content_hash),
     KEY investment_model_portfolio_versions_status_idx (status, effective_from),
     CONSTRAINT investment_model_portfolio_versions_model_fk FOREIGN KEY (model_portfolio_id)
       REFERENCES investment_model_portfolios (id) ON DELETE CASCADE ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_model_portfolio_version_allocations',
    `id VARCHAR(191) NOT NULL, model_portfolio_version_id VARCHAR(191) NOT NULL,
     allocation_type VARCHAR(24) NOT NULL, allocation_key VARCHAR(64) NOT NULL,
     target_weight_pct DECIMAL(10,4) NOT NULL, min_weight_pct DECIMAL(10,4) NULL,
     max_weight_pct DECIMAL(10,4) NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
     PRIMARY KEY (id), UNIQUE KEY investment_model_version_allocations_key
       (model_portfolio_version_id, allocation_type, allocation_key),
     CONSTRAINT investment_model_version_allocations_version_fk FOREIGN KEY (model_portfolio_version_id)
       REFERENCES investment_model_portfolio_versions (id) ON DELETE CASCADE ON UPDATE CASCADE,
     CONSTRAINT investment_model_version_allocations_weights_chk CHECK
       (target_weight_pct >= 0 AND target_weight_pct <= 100
        AND (min_weight_pct IS NULL OR min_weight_pct >= 0)
        AND (max_weight_pct IS NULL OR max_weight_pct <= 100))`,
  );
  await createTable(
    'investment_rebalance_runs',
    `id VARCHAR(191) NOT NULL, fund_id VARCHAR(191) NOT NULL, model_portfolio_id VARCHAR(191) NOT NULL,
     model_portfolio_version_id VARCHAR(191) NULL, as_of DATETIME(3) NOT NULL,
     status VARCHAR(24) NOT NULL DEFAULT 'DRAFT', input_snapshot_json JSON NOT NULL,
     summary_json JSON NULL, idempotency_key VARCHAR(191) NOT NULL, version INT NOT NULL DEFAULT 1,
     created_by_id VARCHAR(191) NULL, approved_by_id VARCHAR(191) NULL, approved_at DATETIME(3) NULL,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL,
     PRIMARY KEY (id), UNIQUE KEY investment_rebalance_runs_idempotency_key (idempotency_key),
     KEY investment_rebalance_runs_fund_asof_idx (fund_id, as_of),
     KEY investment_rebalance_runs_model_status_idx (model_portfolio_id, status),
     CONSTRAINT investment_rebalance_runs_model_fk FOREIGN KEY (model_portfolio_id)
       REFERENCES investment_model_portfolios (id) ON DELETE RESTRICT ON UPDATE CASCADE,
     CONSTRAINT investment_rebalance_runs_version_fk FOREIGN KEY (model_portfolio_version_id)
       REFERENCES investment_model_portfolio_versions (id) ON DELETE SET NULL ON UPDATE CASCADE`,
  );
  await createTable(
    'investment_rebalance_items',
    `id VARCHAR(191) NOT NULL, rebalance_run_id VARCHAR(191) NOT NULL, instrument_id VARCHAR(191) NULL,
     allocation_key VARCHAR(64) NOT NULL, current_weight_pct DECIMAL(10,4) NOT NULL,
     target_weight_pct DECIMAL(10,4) NOT NULL, delta_weight_pct DECIMAL(10,4) NOT NULL,
     proposed_quantity DECIMAL(20,8) NULL, proposed_amount DECIMAL(20,8) NULL,
     action VARCHAR(16) NOT NULL, generated_order_id VARCHAR(191) NULL, rationale_json JSON NULL,
     created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), PRIMARY KEY (id),
     UNIQUE KEY investment_rebalance_items_allocation_key (rebalance_run_id, allocation_key),
     KEY investment_rebalance_items_order_idx (generated_order_id),
     CONSTRAINT investment_rebalance_items_run_fk FOREIGN KEY (rebalance_run_id)
       REFERENCES investment_rebalance_runs (id) ON DELETE CASCADE ON UPDATE CASCADE`,
  );
}

async function backfillDeterministically(): Promise<void> {
  const backfills: Array<{ table: string; prefix: string }> = [
    { table: 'listed_equity_price_ticks', prefix: 'legacy:price:' },
    { table: 'investment_orders', prefix: 'legacy:order:' },
    { table: 'investment_order_approvals', prefix: 'legacy:approval:' },
    { table: 'investment_valuation_runs', prefix: 'legacy:valuation:' },
    { table: 'investment_accounting_events', prefix: 'legacy:accounting:' },
    { table: 'investment_reconciliation_batches', prefix: 'legacy:reconciliation:' },
  ];
  for (const { table, prefix } of backfills) {
    let changed = 0;
    do {
      changed = await prisma.$executeRawUnsafe(
        `UPDATE \`${table}\`
         SET idempotency_key = CONCAT(?, id)
         WHERE idempotency_key IS NULL
         ORDER BY id
         LIMIT ${BATCH_SIZE}`,
        prefix,
      );
      if (changed) console.log(`[backfill] ${table}: ${changed}`);
    } while (changed === BATCH_SIZE);
  }

  // Deterministic, bounded assignment avoids collisions in the exact approval sequence key.
  if (
    !(await indexExists('investment_order_approvals', 'investment_order_approvals_sequence_key'))
  ) {
    let cursor = '';
    for (;;) {
      const approvals = await prisma.$queryRawUnsafe<
        Array<{ id: string; orderId: string; revisionNo: number; createdAt: Date }>
      >(
        `SELECT id, order_id orderId, revision_no revisionNo, created_at createdAt
         FROM investment_order_approvals
         WHERE id > ?
         ORDER BY id
         LIMIT ${BATCH_SIZE}`,
        cursor,
      );
      if (!approvals.length) break;
      for (const approval of approvals) {
        const rankRows = await prisma.$queryRawUnsafe<CountRow[]>(
          `SELECT COUNT(*) c
           FROM investment_order_approvals
           WHERE order_id = ? AND revision_no = ?
             AND (created_at < ? OR (created_at = ? AND id <= ?))`,
          approval.orderId,
          approval.revisionNo,
          approval.createdAt,
          approval.createdAt,
          approval.id,
        );
        await prisma.$executeRawUnsafe(
          'UPDATE investment_order_approvals SET approval_sequence = ? WHERE id = ?',
          Number(rankRows[0]?.c ?? 1),
          approval.id,
        );
      }
      cursor = approvals[approvals.length - 1].id;
      console.log(`[backfill] investment_order_approvals sequences: ${approvals.length}`);
    }
    await addIndex(
      'investment_order_approvals',
      'investment_order_approvals_sequence_key',
      'UNIQUE KEY `investment_order_approvals_sequence_key` (`order_id`, `approval_sequence`, `revision_no`)',
    );
  }

  // Preserve the current document payload as version 1 without inventing unavailable metadata.
  let inserted = 0;
  do {
    inserted = await prisma.$executeRawUnsafe(`
      INSERT INTO investment_document_versions
        (id, document_id, version_no, storage_provider, storage_key, file_name, mime_type,
         byte_size, checksum_sha256, encryption_key_ref, malware_status, uploaded_by_id, created_at)
      SELECT SHA2(CONCAT('investment-document-version:', d.id), 256), d.id, 1, 'LEGACY',
             LEFT(d.file_ref, 700),
             LEFT(COALESCE(NULLIF(d.title, ''), d.id), 255), 'application/octet-stream',
             0, COALESCE(d.checksum_sha256, SHA2(CONCAT('legacy:', d.id, ':', d.file_ref), 256)),
             d.encryption_key_ref, 'UNKNOWN', d.uploaded_by_id, d.created_at
      FROM investment_documents d
      LEFT JOIN investment_document_versions v
        ON v.document_id = d.id AND v.version_no = 1
      WHERE v.id IS NULL
      ORDER BY d.id
      LIMIT ${BATCH_SIZE}
    `);
    if (inserted) console.log(`[backfill] investment_document_versions: ${inserted}`);
  } while (inserted === BATCH_SIZE);
}

async function main(): Promise<void> {
  const lockRows = await prisma.$queryRawUnsafe<Array<{ acquired: bigint | number | null }>>(
    'SELECT GET_LOCK(?, 10) acquired',
    LOCK,
  );
  if (Number(lockRows[0]?.acquired ?? 0) !== 1) {
    throw new Error(`Could not acquire advisory lock ${LOCK}`);
  }
  try {
    await preflight();
    await createFoundationTables();
    await runPhase('01_extend_existing', extendExistingTables);
    await runPhase('02_portfolio_and_trading', createPortfolioAndTradingTables);
    await runPhase('03_ledger_and_controls', createLedgerAndControlTables);
    await runPhase('04_workflow_and_platform', createWorkflowAndPlatformTables);
    await runPhase('05_model_and_rebalance', createModelAndRebalanceTables);
    await runPhase('06_bounded_backfills', backfillDeterministically);
    console.log('Investment Operations schema hardening migration complete.');
  } finally {
    await prisma.$queryRawUnsafe('SELECT RELEASE_LOCK(?) released', LOCK);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
