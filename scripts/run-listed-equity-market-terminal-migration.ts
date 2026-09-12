/**
 * Listed equity market terminal (Stock Price Collector) — greenfield tables.
 * Idempotent. Run: npm run db:migrate:listed-equity-market-terminal
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

async function main() {
  if (!(await tableExists("listed_equity_securities"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`listed_equity_securities\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`symbol\` VARCHAR(64) NOT NULL,
        \`isin\` VARCHAR(32) NULL,
        \`exchange_code\` VARCHAR(16) NOT NULL,
        \`name\` VARCHAR(512) NOT NULL,
        \`listing_currency_code\` VARCHAR(3) NOT NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`listed_equity_securities_symbol_exchange_key\` (\`symbol\`, \`exchange_code\`),
        KEY \`listed_equity_securities_exchange_active_idx\` (\`exchange_code\`, \`is_active\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] listed_equity_securities");
  } else {
    console.log("[skip] listed_equity_securities");
  }

  if (!(await tableExists("listed_equity_security_vendor_symbols"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`listed_equity_security_vendor_symbols\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`security_id\` VARCHAR(191) NOT NULL,
        \`provider_code\` VARCHAR(64) NOT NULL,
        \`vendor_symbol\` VARCHAR(128) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`listed_equity_vendor_symbol_provider_key\` (\`provider_code\`, \`vendor_symbol\`),
        KEY \`listed_equity_vendor_symbol_security_idx\` (\`security_id\`),
        CONSTRAINT \`listed_equity_vendor_symbol_security_fk\` FOREIGN KEY (\`security_id\`) REFERENCES \`listed_equity_securities\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] listed_equity_security_vendor_symbols");
  } else {
    console.log("[skip] listed_equity_security_vendor_symbols");
  }

  if (!(await tableExists("listed_equity_market_data_source_configs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`listed_equity_market_data_source_configs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`source_code\` VARCHAR(32) NOT NULL,
        \`display_name\` VARCHAR(128) NOT NULL,
        \`source_url\` TEXT NULL,
        \`is_enabled\` BOOLEAN NOT NULL DEFAULT true,
        \`cron_windows\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`listed_equity_market_data_source_configs_source_code_key\` (\`source_code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] listed_equity_market_data_source_configs");
  } else {
    console.log("[skip] listed_equity_market_data_source_configs");
  }

  if (!(await tableExists("listed_equity_market_data_ingest_batches"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`listed_equity_market_data_ingest_batches\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`source_type\` VARCHAR(16) NOT NULL,
        \`source_code\` VARCHAR(32) NOT NULL,
        \`as_of_date\` DATE NOT NULL,
        \`raw_payload_ref\` TEXT NULL,
        \`sha256_checksum\` VARCHAR(64) NOT NULL,
        \`record_count\` INT NOT NULL DEFAULT 0,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'COMPLETED',
        \`source_status\` VARCHAR(16) NOT NULL DEFAULT 'OK',
        \`error_message\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`listed_equity_ingest_batch_source_date_idx\` (\`source_code\`, \`as_of_date\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] listed_equity_market_data_ingest_batches");
  } else {
    console.log("[skip] listed_equity_market_data_ingest_batches");
  }

  if (!(await tableExists("listed_equity_price_ticks"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`listed_equity_price_ticks\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`security_id\` VARCHAR(191) NOT NULL,
        \`batch_id\` VARCHAR(191) NULL,
        \`price_type\` VARCHAR(16) NOT NULL,
        \`price\` DECIMAL(18,6) NOT NULL,
        \`previous_close\` DECIMAL(18,6) NULL,
        \`deviation_pct\` DECIMAL(10,6) NULL,
        \`validation_status\` VARCHAR(16) NOT NULL DEFAULT 'APPROVED',
        \`tick_frequency\` VARCHAR(16) NULL,
        \`fx_rate_used\` DECIMAL(18,8) NULL,
        \`fx_rate_source\` VARCHAR(32) NULL,
        \`source_status\` VARCHAR(16) NOT NULL DEFAULT 'OK',
        \`priced_at\` DATETIME(3) NOT NULL,
        \`reviewed_by_id\` VARCHAR(191) NULL,
        \`reviewed_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`listed_equity_price_ticks_security_priced_idx\` (\`security_id\`, \`priced_at\`),
        KEY \`listed_equity_price_ticks_validation_idx\` (\`validation_status\`, \`priced_at\`),
        CONSTRAINT \`listed_equity_price_ticks_security_fk\` FOREIGN KEY (\`security_id\`) REFERENCES \`listed_equity_securities\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`listed_equity_price_ticks_batch_fk\` FOREIGN KEY (\`batch_id\`) REFERENCES \`listed_equity_market_data_ingest_batches\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`listed_equity_price_ticks_reviewer_fk\` FOREIGN KEY (\`reviewed_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] listed_equity_price_ticks");
  } else {
    console.log("[skip] listed_equity_price_ticks");
  }

  if (!(await tableExists("listed_equity_watchlist_entries"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`listed_equity_watchlist_entries\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`user_id\` VARCHAR(191) NOT NULL,
        \`security_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`listed_equity_watchlist_user_security_key\` (\`user_id\`, \`security_id\`),
        CONSTRAINT \`listed_equity_watchlist_user_fk\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`listed_equity_watchlist_security_fk\` FOREIGN KEY (\`security_id\`) REFERENCES \`listed_equity_securities\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] listed_equity_watchlist_entries");
  } else {
    console.log("[skip] listed_equity_watchlist_entries");
  }

  if (!(await tableExists("listed_equity_stakeholder_profiles"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`listed_equity_stakeholder_profiles\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`profile_type\` VARCHAR(16) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`contact_email\` VARCHAR(255) NULL,
        \`delivery_mode\` VARCHAR(16) NOT NULL DEFAULT 'EMAIL',
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] listed_equity_stakeholder_profiles");
  } else {
    console.log("[skip] listed_equity_stakeholder_profiles");
  }

  if (!(await tableExists("listed_equity_fund_configs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`listed_equity_fund_configs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL,
        \`base_currency_code\` VARCHAR(3) NOT NULL DEFAULT 'USD',
        \`trust_bank_id\` VARCHAR(191) NULL,
        \`coa_mapping_json\` JSON NULL,
        \`broker_profile_id\` VARCHAR(191) NULL,
        \`custodian_profile_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`listed_equity_fund_configs_fund_id_key\` (\`fund_id\`),
        CONSTRAINT \`listed_equity_fund_configs_fund_fk\` FOREIGN KEY (\`fund_id\`) REFERENCES \`funds\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`listed_equity_fund_configs_bank_fk\` FOREIGN KEY (\`trust_bank_id\`) REFERENCES \`banks\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`listed_equity_fund_configs_broker_fk\` FOREIGN KEY (\`broker_profile_id\`) REFERENCES \`listed_equity_stakeholder_profiles\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`listed_equity_fund_configs_custodian_fk\` FOREIGN KEY (\`custodian_profile_id\`) REFERENCES \`listed_equity_stakeholder_profiles\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] listed_equity_fund_configs");
  } else {
    console.log("[skip] listed_equity_fund_configs");
  }

  if (!(await tableExists("listed_equity_fund_signing_keys"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`listed_equity_fund_signing_keys\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fund_config_id\` VARCHAR(191) NOT NULL,
        \`key_label\` VARCHAR(128) NOT NULL,
        \`key_ref\` VARCHAR(512) NOT NULL,
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`listed_equity_fund_signing_keys_config_fk\` FOREIGN KEY (\`fund_config_id\`) REFERENCES \`listed_equity_fund_configs\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] listed_equity_fund_signing_keys");
  } else {
    console.log("[skip] listed_equity_fund_signing_keys");
  }

  if (!(await tableExists("listed_equity_holdings"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`listed_equity_holdings\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL,
        \`security_id\` VARCHAR(191) NOT NULL,
        \`quantity\` DECIMAL(18,6) NOT NULL DEFAULT 0,
        \`wac\` DECIMAL(18,6) NOT NULL DEFAULT 0,
        \`wac_currency_code\` VARCHAR(3) NOT NULL,
        \`last_valuation_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`listed_equity_holdings_fund_security_key\` (\`fund_id\`, \`security_id\`),
        CONSTRAINT \`listed_equity_holdings_fund_fk\` FOREIGN KEY (\`fund_id\`) REFERENCES \`funds\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`listed_equity_holdings_security_fk\` FOREIGN KEY (\`security_id\`) REFERENCES \`listed_equity_securities\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] listed_equity_holdings");
  } else {
    console.log("[skip] listed_equity_holdings");
  }

  if (!(await tableExists("listed_equity_holding_lots"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`listed_equity_holding_lots\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL,
        \`security_id\` VARCHAR(191) NOT NULL,
        \`trade_id\` VARCHAR(191) NULL,
        \`quantity\` DECIMAL(18,6) NOT NULL,
        \`execution_price\` DECIMAL(18,6) NOT NULL,
        \`currency_code\` VARCHAR(3) NOT NULL,
        \`purchased_at\` DATETIME(3) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`listed_equity_holding_lots_fund_security_idx\` (\`fund_id\`, \`security_id\`),
        CONSTRAINT \`listed_equity_holding_lots_security_fk\` FOREIGN KEY (\`security_id\`) REFERENCES \`listed_equity_securities\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] listed_equity_holding_lots");
  } else {
    console.log("[skip] listed_equity_holding_lots");
  }

  if (!(await tableExists("listed_equity_valuation_snapshots"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`listed_equity_valuation_snapshots\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL,
        \`as_of\` DATETIME(3) NOT NULL,
        \`nav_base_currency\` DECIMAL(18,2) NOT NULL,
        \`unrealized_pnl_usd\` DECIMAL(18,2) NOT NULL DEFAULT 0,
        \`unrealized_pnl_zig\` DECIMAL(18,2) NOT NULL DEFAULT 0,
        \`realized_pnl_usd\` DECIMAL(18,2) NOT NULL DEFAULT 0,
        \`realized_pnl_zig\` DECIMAL(18,2) NOT NULL DEFAULT 0,
        \`fx_rate_used\` DECIMAL(18,8) NULL,
        \`fx_rate_source\` VARCHAR(32) NULL,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'OK',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`listed_equity_valuation_snapshots_fund_asof_idx\` (\`fund_id\`, \`as_of\`),
        CONSTRAINT \`listed_equity_valuation_snapshots_fund_fk\` FOREIGN KEY (\`fund_id\`) REFERENCES \`funds\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] listed_equity_valuation_snapshots");
  } else {
    console.log("[skip] listed_equity_valuation_snapshots");
  }

  if (!(await tableExists("listed_equity_trades"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`listed_equity_trades\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`trade_ref\` VARCHAR(64) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL,
        \`security_id\` VARCHAR(191) NOT NULL,
        \`side\` VARCHAR(8) NOT NULL,
        \`quantity\` DECIMAL(18,6) NOT NULL,
        \`execution_price\` DECIMAL(18,6) NOT NULL,
        \`execution_currency_code\` VARCHAR(3) NOT NULL,
        \`fees\` DECIMAL(18,2) NOT NULL DEFAULT 0,
        \`status\` VARCHAR(24) NOT NULL DEFAULT 'DRAFT',
        \`idempotency_key\` VARCHAR(128) NULL,
        \`executed_at\` DATETIME(3) NULL,
        \`settled_at\` DATETIME(3) NULL,
        \`executed_by_id\` VARCHAR(191) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`listed_equity_trades_trade_ref_key\` (\`trade_ref\`),
        UNIQUE KEY \`listed_equity_trades_idempotency_key_key\` (\`idempotency_key\`),
        KEY \`listed_equity_trades_fund_status_idx\` (\`fund_id\`, \`status\`),
        CONSTRAINT \`listed_equity_trades_fund_fk\` FOREIGN KEY (\`fund_id\`) REFERENCES \`funds\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`listed_equity_trades_security_fk\` FOREIGN KEY (\`security_id\`) REFERENCES \`listed_equity_securities\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`listed_equity_trades_executor_fk\` FOREIGN KEY (\`executed_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] listed_equity_trades");
  } else {
    console.log("[skip] listed_equity_trades");
  }

  if (!(await tableExists("listed_equity_trade_routing_hops"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`listed_equity_trade_routing_hops\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`trade_id\` VARCHAR(191) NOT NULL,
        \`target\` VARCHAR(16) NOT NULL,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'STAGED',
        \`attempt_count\` INT NOT NULL DEFAULT 0,
        \`external_ref\` VARCHAR(128) NULL,
        \`payload_ref\` TEXT NULL,
        \`receipt_ref\` TEXT NULL,
        \`last_error\` TEXT NULL,
        \`next_retry_at\` DATETIME(3) NULL,
        \`dispatched_at\` DATETIME(3) NULL,
        \`confirmed_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`listed_equity_trade_routing_hops_trade_target_key\` (\`trade_id\`, \`target\`),
        KEY \`listed_equity_trade_routing_hops_retry_idx\` (\`status\`, \`next_retry_at\`),
        CONSTRAINT \`listed_equity_trade_routing_hops_trade_fk\` FOREIGN KEY (\`trade_id\`) REFERENCES \`listed_equity_trades\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] listed_equity_trade_routing_hops");
  } else {
    console.log("[skip] listed_equity_trade_routing_hops");
  }

  if (!(await tableExists("listed_equity_trade_settlements"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`listed_equity_trade_settlements\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`trade_id\` VARCHAR(191) NOT NULL,
        \`journal_entry_id\` VARCHAR(191) NULL,
        \`cashbook_entry_id\` VARCHAR(191) NULL,
        \`realized_pnl\` DECIMAL(18,2) NULL,
        \`cgt_amount\` DECIMAL(18,2) NULL,
        \`settlement_document_ref\` TEXT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`listed_equity_trade_settlements_trade_id_key\` (\`trade_id\`),
        CONSTRAINT \`listed_equity_trade_settlements_trade_fk\` FOREIGN KEY (\`trade_id\`) REFERENCES \`listed_equity_trades\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`listed_equity_trade_settlements_journal_fk\` FOREIGN KEY (\`journal_entry_id\`) REFERENCES \`journal_entries\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] listed_equity_trade_settlements");
  } else {
    console.log("[skip] listed_equity_trade_settlements");
  }

  if (!(await tableExists("listed_equity_cash_holds"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`listed_equity_cash_holds\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`trade_id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL,
        \`bank_id\` VARCHAR(191) NOT NULL,
        \`amount\` DECIMAL(18,2) NOT NULL,
        \`currency_code\` VARCHAR(3) NOT NULL,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'PLACED',
        \`placed_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`released_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`listed_equity_cash_holds_trade_idx\` (\`trade_id\`),
        CONSTRAINT \`listed_equity_cash_holds_trade_fk\` FOREIGN KEY (\`trade_id\`) REFERENCES \`listed_equity_trades\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`listed_equity_cash_holds_bank_fk\` FOREIGN KEY (\`bank_id\`) REFERENCES \`banks\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] listed_equity_cash_holds");
  } else {
    console.log("[skip] listed_equity_cash_holds");
  }

  // Seed default domestic source configs when empty
  const cfgCount = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM listed_equity_market_data_source_configs`
  );
  if (Number(cfgCount[0]?.c ?? 0) === 0) {
    const { randomBytes } = await import("crypto");
    const cuid = () => `c${Date.now().toString(36)}${randomBytes(6).toString("hex")}`.slice(0, 25);
    for (const row of [
      { code: "ZSE", name: "Zimbabwe Stock Exchange", url: process.env.ZSE_PRICE_URL || "" },
      { code: "VFEX", name: "Victoria Falls Exchange", url: process.env.VFEX_PRICE_URL || "" },
      { code: "SECZIM", name: "SECZIM Reference", url: process.env.SECZIM_PRICE_URL || "" },
    ]) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO listed_equity_market_data_source_configs (id, source_code, display_name, source_url, is_enabled, cron_windows, created_at, updated_at)
         VALUES (?, ?, ?, ?, true, ?, NOW(3), NOW(3))`,
        cuid(),
        row.code,
        row.name,
        row.url || null,
        JSON.stringify(["09:00", "16:00"])
      );
    }
    console.log("[ok] seeded market data source configs");
  } else {
    console.log("[skip] market data source configs seed");
  }

  // Ensure international source configs exist (idempotent)
  const { randomBytes } = await import("crypto");
  const cuid = () => `c${Date.now().toString(36)}${randomBytes(6).toString("hex")}`.slice(0, 25);
  for (const row of [
    { code: "NASDAQ", name: "NASDAQ (FastBull + Yahoo scrape)", url: "https://www.fastbull.com/" },
    { code: "NYSE", name: "NYSE (Yahoo Finance scrape)", url: "https://finance.yahoo.com/quote/%5ENYA/" },
  ]) {
    const exists = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM listed_equity_market_data_source_configs WHERE source_code = ?`,
      row.code
    );
    if (Number(exists[0]?.c ?? 0) > 0) {
      console.log(`[skip] source config ${row.code}`);
      continue;
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO listed_equity_market_data_source_configs (id, source_code, display_name, source_url, is_enabled, cron_windows, created_at, updated_at)
       VALUES (?, ?, ?, ?, true, ?, NOW(3), NOW(3))`,
      cuid(),
      row.code,
      row.name,
      row.url,
      JSON.stringify(["16:30", "21:00"])
    );
    console.log(`[ok] seeded source config ${row.code}`);
  }

  console.log("Listed equity market terminal migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
