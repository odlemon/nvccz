/**
 * Investment Operations v2.0 — schema extensions (waves 1–4).
 * Idempotent. Run: npm run db:migrate:investment-ops-v2
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

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function seedInstrumentTypes() {
  const types = [
    ["EQUITY", "Listed Equity"],
    ["ETF", "Exchange Traded Fund"],
    ["CASH", "Cash"],
    ["BOND", "Bond"],
    ["FUND", "Fund"],
    ["OPTION", "Option"],
    ["FUTURE", "Future"],
    ["CFD", "CFD"],
    ["FX_FORWARD", "FX Forward"],
    ["COMMODITY", "Commodity"],
    ["CERTIFICATE", "Certificate"],
  ];
  for (const [code, name] of types) {
    const existing = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM investment_instrument_types WHERE type_code = ?`,
      code
    );
    if (Number(existing[0]?.c ?? 0) > 0) {
      console.log(`[skip] investment_instrument_types ${code}`);
      continue;
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO investment_instrument_types (id, type_code, display_name, is_active, created_at, updated_at)
       VALUES (?, ?, ?, true, NOW(3), NOW(3))`,
      randomUUID(),
      code,
      name
    );
    console.log(`[ok] investment_instrument_types ${code}`);
  }
}

async function backfillInstrumentsFromSecurities() {
  const securities = await prisma.$queryRawUnsafe<
    Array<{ id: string; symbol: string; exchange_code: string; name: string; listing_currency_code: string; isin: string | null }>
  >(`SELECT id, symbol, exchange_code, name, listing_currency_code, isin FROM listed_equity_securities`);
  for (const s of securities) {
    const existing = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM investment_instruments WHERE listed_equity_security_id = ?`,
      s.id
    );
    if (Number(existing[0]?.c ?? 0) > 0) continue;
    const instrumentCode = `${s.symbol}.${s.exchange_code}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO investment_instruments (
        id, instrument_code, short_name, full_name, ticker, isin, exchange_code, instrument_type_code,
        listing_currency_code, status, listed_equity_security_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'EQUITY', ?, 'APPROVED', ?, NOW(3), NOW(3))`,
      randomUUID(),
      instrumentCode,
      s.symbol,
      s.name,
      s.symbol,
      s.isin,
      s.exchange_code,
      s.listing_currency_code,
      s.id
    );
    console.log(`[ok] backfill instrument ${instrumentCode}`);
  }
}

async function main() {
  if (!(await tableExists("investment_instrument_types"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_instrument_types (
        id VARCHAR(191) NOT NULL,
        type_code VARCHAR(32) NOT NULL,
        display_name VARCHAR(128) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY investment_instrument_types_code_key (type_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_instrument_types");
  } else console.log("[skip] investment_instrument_types");

  if (!(await tableExists("investment_instruments"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_instruments (
        id VARCHAR(191) NOT NULL,
        instrument_code VARCHAR(64) NOT NULL,
        short_name VARCHAR(128) NOT NULL,
        full_name VARCHAR(512) NOT NULL,
        ticker VARCHAR(64) NULL,
        isin VARCHAR(32) NULL,
        bloomberg_code VARCHAR(64) NULL,
        reuters_code VARCHAR(64) NULL,
        internal_ref VARCHAR(64) NULL,
        exchange_code VARCHAR(16) NULL,
        market_code VARCHAR(32) NULL,
        country_code VARCHAR(8) NULL,
        issuer_name VARCHAR(255) NULL,
        instrument_type_code VARCHAR(32) NOT NULL DEFAULT 'EQUITY',
        sub_category VARCHAR(64) NULL,
        sector VARCHAR(128) NULL,
        industry VARCHAR(128) NULL,
        listing_currency_code VARCHAR(3) NOT NULL,
        pricing_source VARCHAR(64) NULL,
        valuation_method VARCHAR(32) DEFAULT 'MARK_TO_MARKET',
        stale_price_threshold_hours INT DEFAULT 24,
        decimal_precision INT DEFAULT 4,
        maturity_date DATE NULL,
        coupon_rate DECIMAL(10,6) NULL,
        coupon_frequency VARCHAR(16) NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
        compliance_restriction VARCHAR(16) NULL,
        created_by_id VARCHAR(191) NULL,
        approved_by_id VARCHAR(191) NULL,
        approved_at DATETIME(3) NULL,
        listed_equity_security_id VARCHAR(191) NULL,
        audit_version INT NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY investment_instruments_code_key (instrument_code),
        KEY investment_instruments_type_status_idx (instrument_type_code, status),
        KEY investment_instruments_security_idx (listed_equity_security_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_instruments");
  } else console.log("[skip] investment_instruments");

  if (!(await tableExists("investment_orders"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_orders (
        id VARCHAR(191) NOT NULL,
        order_ref VARCHAR(64) NOT NULL,
        fund_id VARCHAR(191) NOT NULL,
        instrument_id VARCHAR(191) NULL,
        security_id VARCHAR(191) NULL,
        side VARCHAR(8) NOT NULL,
        quantity DECIMAL(18,6) NOT NULL,
        order_type VARCHAR(24) NOT NULL DEFAULT 'MARKET',
        limit_price DECIMAL(18,6) NULL,
        execution_price DECIMAL(18,6) NULL,
        trade_currency VARCHAR(3) NOT NULL,
        settlement_currency VARCHAR(3) NULL,
        broker_profile_id VARCHAR(191) NULL,
        custodian_profile_id VARCHAR(191) NULL,
        value_date DATE NULL,
        trade_date DATE NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
        compliance_status VARCHAR(24) NULL,
        notes TEXT NULL,
        trade_id VARCHAR(191) NULL,
        created_by_id VARCHAR(191) NULL,
        submitted_at DATETIME(3) NULL,
        approved_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY investment_orders_ref_key (order_ref),
        KEY investment_orders_fund_status_idx (fund_id, status),
        KEY investment_orders_trade_idx (trade_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_orders");
  } else console.log("[skip] investment_orders");

  if (!(await tableExists("investment_order_approvals"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_order_approvals (
        id VARCHAR(191) NOT NULL,
        order_id VARCHAR(191) NOT NULL,
        approval_type VARCHAR(24) NOT NULL,
        status VARCHAR(16) NOT NULL,
        approver_id VARCHAR(191) NULL,
        reason TEXT NULL,
        old_status VARCHAR(24) NULL,
        new_status VARCHAR(24) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY investment_order_approvals_order_idx (order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_order_approvals");
  } else console.log("[skip] investment_order_approvals");

  if (!(await tableExists("investment_valuation_runs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_valuation_runs (
        id VARCHAR(191) NOT NULL,
        fund_id VARCHAR(191) NOT NULL,
        as_of DATETIME(3) NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'RUNNING',
        nav_base_currency DECIMAL(18,2) NULL,
        error_message TEXT NULL,
        started_by_id VARCHAR(191) NULL,
        completed_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY investment_valuation_runs_fund_asof_idx (fund_id, as_of)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_valuation_runs");
  } else console.log("[skip] investment_valuation_runs");

  if (!(await tableExists("investment_valuation_exceptions"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_valuation_exceptions (
        id VARCHAR(191) NOT NULL,
        valuation_run_id VARCHAR(191) NULL,
        fund_id VARCHAR(191) NOT NULL,
        instrument_id VARCHAR(191) NULL,
        security_id VARCHAR(191) NULL,
        exception_type VARCHAR(32) NOT NULL,
        message TEXT NOT NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        resolved_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY investment_valuation_exceptions_fund_idx (fund_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_valuation_exceptions");
  } else console.log("[skip] investment_valuation_exceptions");

  if (!(await tableExists("investment_accounting_events"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_accounting_events (
        id VARCHAR(191) NOT NULL,
        fund_id VARCHAR(191) NOT NULL,
        source_type VARCHAR(32) NOT NULL,
        source_id VARCHAR(191) NOT NULL,
        event_type VARCHAR(32) NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'NOT_POSTED',
        journal_entry_id VARCHAR(191) NULL,
        trade_ref VARCHAR(64) NULL,
        amount DECIMAL(18,2) NULL,
        currency_code VARCHAR(3) NULL,
        posted_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        KEY investment_accounting_events_fund_status_idx (fund_id, status),
        KEY investment_accounting_events_journal_idx (journal_entry_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_accounting_events");
  } else console.log("[skip] investment_accounting_events");

  if (!(await tableExists("investment_compliance_rules"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_compliance_rules (
        id VARCHAR(191) NOT NULL,
        fund_id VARCHAR(191) NULL,
        rule_code VARCHAR(64) NOT NULL,
        rule_name VARCHAR(255) NOT NULL,
        rule_type VARCHAR(32) NOT NULL,
        threshold_value DECIMAL(18,6) NULL,
        threshold_unit VARCHAR(16) NULL,
        instrument_type_code VARCHAR(32) NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        KEY investment_compliance_rules_fund_idx (fund_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_compliance_rules");
  } else console.log("[skip] investment_compliance_rules");

  if (!(await tableExists("investment_compliance_results"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_compliance_results (
        id VARCHAR(191) NOT NULL,
        order_id VARCHAR(191) NOT NULL,
        rule_id VARCHAR(191) NULL,
        outcome VARCHAR(24) NOT NULL,
        message TEXT NULL,
        override_reason TEXT NULL,
        override_by_id VARCHAR(191) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY investment_compliance_results_order_idx (order_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_compliance_results");
  } else console.log("[skip] investment_compliance_results");

  if (!(await tableExists("investment_broker_commissions"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_broker_commissions (
        id VARCHAR(191) NOT NULL,
        stakeholder_profile_id VARCHAR(191) NOT NULL,
        instrument_type_code VARCHAR(32) NULL,
        rate_bps DECIMAL(10,4) NOT NULL,
        flat_fee DECIMAL(18,2) NULL,
        currency_code VARCHAR(3) DEFAULT 'USD',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        KEY investment_broker_commissions_profile_idx (stakeholder_profile_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_broker_commissions");
  } else console.log("[skip] investment_broker_commissions");

  if (!(await tableExists("investment_markets"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_markets (
        id VARCHAR(191) NOT NULL,
        market_code VARCHAR(32) NOT NULL,
        market_name VARCHAR(128) NOT NULL,
        country_code VARCHAR(8) NULL,
        exchange_code VARCHAR(16) NULL,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY investment_markets_code_key (market_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_markets");
  } else console.log("[skip] investment_markets");

  if (!(await tableExists("investment_ops_settings"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_ops_settings (
        id VARCHAR(191) NOT NULL,
        setting_key VARCHAR(64) NOT NULL,
        setting_value JSON NOT NULL,
        updated_by_id VARCHAR(191) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY investment_ops_settings_key (setting_key)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_ops_settings");
  } else console.log("[skip] investment_ops_settings");

  if (!(await tableExists("investment_reconciliation_batches"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_reconciliation_batches (
        id VARCHAR(191) NOT NULL,
        fund_id VARCHAR(191) NOT NULL,
        recon_type VARCHAR(32) NOT NULL,
        as_of_date DATE NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'RUNNING',
        matched_count INT NOT NULL DEFAULT 0,
        unmatched_count INT NOT NULL DEFAULT 0,
        created_by_id VARCHAR(191) NULL,
        completed_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY investment_reconciliation_batches_fund_idx (fund_id, recon_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_reconciliation_batches");
  } else console.log("[skip] investment_reconciliation_batches");

  if (!(await tableExists("investment_reconciliation_items"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_reconciliation_items (
        id VARCHAR(191) NOT NULL,
        batch_id VARCHAR(191) NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'UNMATCHED',
        internal_ref VARCHAR(128) NULL,
        external_ref VARCHAR(128) NULL,
        internal_amount DECIMAL(18,2) NULL,
        external_amount DECIMAL(18,2) NULL,
        variance DECIMAL(18,2) NULL,
        message TEXT NULL,
        resolved_by_id VARCHAR(191) NULL,
        resolved_at DATETIME(3) NULL,
        resolution_reason TEXT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY investment_reconciliation_items_batch_idx (batch_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_reconciliation_items");
  } else console.log("[skip] investment_reconciliation_items");

  if (!(await tableExists("investment_documents"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_documents (
        id VARCHAR(191) NOT NULL,
        fund_id VARCHAR(191) NULL,
        document_type VARCHAR(32) NOT NULL,
        title VARCHAR(255) NOT NULL,
        file_ref TEXT NOT NULL,
        order_id VARCHAR(191) NULL,
        trade_id VARCHAR(191) NULL,
        version_no INT NOT NULL DEFAULT 1,
        approval_status VARCHAR(24) DEFAULT 'PENDING',
        uploaded_by_id VARCHAR(191) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id),
        KEY investment_documents_fund_type_idx (fund_id, document_type)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_documents");
  } else console.log("[skip] investment_documents");

  if (!(await tableExists("investment_report_runs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_report_runs (
        id VARCHAR(191) NOT NULL,
        fund_id VARCHAR(191) NULL,
        report_type VARCHAR(32) NOT NULL,
        format VARCHAR(8) NOT NULL DEFAULT 'PDF',
        status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        file_ref TEXT NULL,
        parameters_json JSON NULL,
        requested_by_id VARCHAR(191) NULL,
        completed_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_report_runs");
  } else console.log("[skip] investment_report_runs");

  if (!(await tableExists("investment_model_portfolios"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_model_portfolios (
        id VARCHAR(191) NOT NULL,
        name VARCHAR(255) NOT NULL,
        strategy_code VARCHAR(64) NULL,
        base_currency_code VARCHAR(3) DEFAULT 'USD',
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL,
        PRIMARY KEY (id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_model_portfolios");
  } else console.log("[skip] investment_model_portfolios");

  if (!(await tableExists("investment_model_portfolio_allocations"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_model_portfolio_allocations (
        id VARCHAR(191) NOT NULL,
        model_portfolio_id VARCHAR(191) NOT NULL,
        allocation_type VARCHAR(24) NOT NULL,
        allocation_key VARCHAR(64) NOT NULL,
        target_weight_pct DECIMAL(10,4) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY investment_model_allocations_model_idx (model_portfolio_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_model_portfolio_allocations");
  } else console.log("[skip] investment_model_portfolio_allocations");

  if (!(await tableExists("investment_simulation_runs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE investment_simulation_runs (
        id VARCHAR(191) NOT NULL,
        fund_id VARCHAR(191) NOT NULL,
        scenario_json JSON NOT NULL,
        result_json JSON NULL,
        status VARCHAR(16) NOT NULL DEFAULT 'COMPLETED',
        created_by_id VARCHAR(191) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY investment_simulation_runs_fund_idx (fund_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] investment_simulation_runs");
  } else console.log("[skip] investment_simulation_runs");

  await seedInstrumentTypes();
  if (await tableExists("listed_equity_securities")) {
    await backfillInstrumentsFromSecurities();
  }

  const defaultSettings = [
    ["four_eye_orders", JSON.stringify({ enabled: true })],
    ["default_valuation_method", JSON.stringify({ method: "WAC" })],
    ["stale_price_hours", JSON.stringify({ hours: 24 })],
  ];
  for (const [key, val] of defaultSettings) {
    const existing = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM investment_ops_settings WHERE setting_key = ?`,
      key
    );
    if (Number(existing[0]?.c ?? 0) > 0) continue;
    await prisma.$executeRawUnsafe(
      `INSERT INTO investment_ops_settings (id, setting_key, setting_value, created_at, updated_at)
       VALUES (?, ?, ?, NOW(3), NOW(3))`,
      randomUUID(),
      key,
      val
    );
    console.log(`[ok] investment_ops_settings ${key}`);
  }

  console.log("Investment Operations v2 migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
