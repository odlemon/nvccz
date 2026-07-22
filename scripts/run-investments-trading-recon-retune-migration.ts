/**
 * Investments trading & recon retune (BA-TR-1..4, BA-RC-1..4).
 * Idempotent DDL for broker confirmations + trade 3-way recon.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    table
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
    `SELECT COUNT(*) AS cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.cnt || 0) > 0;
}

async function addColumn(table: string, column: string, ddl: string) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column}`);
    return;
  }
  await prisma.$executeRawUnsafe(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
  console.log(`[ok] added ${table}.${column}`);
}

async function createTable(table: string, ddl: string) {
  if (await tableExists(table)) {
    console.log(`[skip] table ${table}`);
    return;
  }
  await prisma.$executeRawUnsafe(ddl);
  console.log(`[ok] created ${table}`);
}

async function main() {
  const dbRows = await prisma.$queryRawUnsafe<Array<{ db: string }>>(`SELECT DATABASE() AS db`);
  console.log(`Trading/recon retune DDL on DATABASE()=${dbRows[0]?.db}`);

  await addColumn(
    "investment_orders",
    "sent_to_broker_at",
    "`sent_to_broker_at` DATETIME(3) NULL"
  );
  await addColumn(
    "investment_orders",
    "sent_to_broker_channel",
    "`sent_to_broker_channel` VARCHAR(32) NULL"
  );
  await addColumn(
    "investment_orders",
    "sent_to_broker_notes",
    "`sent_to_broker_notes` TEXT NULL"
  );

  // BROKER_CONFIRMATION_RECORDED is 28 chars — widen status
  const statusCol = await prisma.$queryRawUnsafe<Array<{ COLUMN_TYPE: string }>>(
    `SELECT COLUMN_TYPE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'investment_orders' AND COLUMN_NAME = 'status'`
  );
  const statusType = String(statusCol[0]?.COLUMN_TYPE || "").toLowerCase();
  if (statusType.includes("varchar(24)") || statusType.includes("varchar(16)")) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE \`investment_orders\` MODIFY COLUMN \`status\` VARCHAR(48) NOT NULL DEFAULT 'DRAFT'`
    );
    console.log("[ok] widened investment_orders.status to VARCHAR(48)");
  } else {
    console.log(`[skip] investment_orders.status already ${statusType || "unknown"}`);
  }

  await addColumn(
    "investment_orders",
    "settlement_account_id",
    "`settlement_account_id` VARCHAR(191) NULL"
  );

  await createTable(
    "investment_order_broker_confirmations",
    `CREATE TABLE \`investment_order_broker_confirmations\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`order_id\` VARCHAR(191) NOT NULL,
      \`outcome\` VARCHAR(24) NOT NULL,
      \`status\` VARCHAR(24) NOT NULL DEFAULT 'RECORDED',
      \`quantity\` DECIMAL(20, 8) NOT NULL,
      \`price\` DECIMAL(20, 8) NOT NULL,
      \`currency_code\` VARCHAR(3) NOT NULL,
      \`broker_reference\` VARCHAR(128) NULL,
      \`trade_date\` DATE NULL,
      \`value_date\` DATE NULL,
      \`notes\` TEXT NULL,
      \`attachment_file_id\` VARCHAR(191) NULL,
      \`reject_reason\` TEXT NULL,
      \`accepted_trade_id\` VARCHAR(191) NULL,
      \`idempotency_key\` VARCHAR(191) NULL,
      \`recorded_by_id\` VARCHAR(191) NULL,
      \`recorded_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`decided_at\` DATETIME(3) NULL,
      \`decided_by_id\` VARCHAR(191) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`investment_order_broker_confirmations_idempotency_key\` (\`idempotency_key\`),
      KEY \`investment_order_broker_confirmations_order_idx\` (\`order_id\`),
      KEY \`investment_order_broker_confirmations_status_idx\` (\`status\`, \`recorded_at\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );

  await createTable(
    "investment_trade_recon_templates",
    `CREATE TABLE \`investment_trade_recon_templates\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`code\` VARCHAR(64) NOT NULL,
      \`name\` VARCHAR(255) NOT NULL,
      \`party\` VARCHAR(24) NOT NULL,
      \`format\` VARCHAR(16) NOT NULL DEFAULT 'CSV',
      \`column_map_json\` JSON NOT NULL,
      \`is_active\` TINYINT(1) NOT NULL DEFAULT 1,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`investment_trade_recon_templates_code_key\` (\`code\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );

  await createTable(
    "investment_trade_recon_batches",
    `CREATE TABLE \`investment_trade_recon_batches\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`fund_id\` VARCHAR(191) NOT NULL,
      \`as_of_date\` DATE NOT NULL,
      \`status\` VARCHAR(24) NOT NULL DEFAULT 'OPEN',
      \`broker_template_code\` VARCHAR(64) NULL,
      \`custodian_template_code\` VARCHAR(64) NULL,
      \`matched_count\` INT NOT NULL DEFAULT 0,
      \`exception_count\` INT NOT NULL DEFAULT 0,
      \`idempotency_key\` VARCHAR(191) NULL,
      \`created_by_id\` VARCHAR(191) NULL,
      \`completed_at\` DATETIME(3) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE KEY \`investment_trade_recon_batches_idempotency_key\` (\`idempotency_key\`),
      KEY \`investment_trade_recon_batches_fund_idx\` (\`fund_id\`, \`as_of_date\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );

  await createTable(
    "investment_trade_recon_lines",
    `CREATE TABLE \`investment_trade_recon_lines\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`batch_id\` VARCHAR(191) NOT NULL,
      \`source\` VARCHAR(24) NOT NULL,
      \`line_no\` INT NOT NULL,
      \`instrument_symbol\` VARCHAR(64) NULL,
      \`side\` VARCHAR(8) NULL,
      \`quantity\` DECIMAL(20, 8) NULL,
      \`price\` DECIMAL(20, 8) NULL,
      \`trade_date\` DATE NULL,
      \`external_ref\` VARCHAR(128) NULL,
      \`currency_code\` VARCHAR(3) NULL,
      \`raw_json\` JSON NULL,
      \`matched_trade_id\` VARCHAR(191) NULL,
      \`match_status\` VARCHAR(24) NOT NULL DEFAULT 'UNMATCHED',
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`investment_trade_recon_lines_batch_idx\` (\`batch_id\`, \`source\`),
      KEY \`investment_trade_recon_lines_trade_idx\` (\`matched_trade_id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );

  await createTable(
    "investment_trade_recon_exceptions",
    `CREATE TABLE \`investment_trade_recon_exceptions\` (
      \`id\` VARCHAR(191) NOT NULL,
      \`batch_id\` VARCHAR(191) NOT NULL,
      \`code\` VARCHAR(48) NOT NULL,
      \`status\` VARCHAR(24) NOT NULL DEFAULT 'OPEN',
      \`instrument_symbol\` VARCHAR(64) NULL,
      \`side\` VARCHAR(8) NULL,
      \`internal_quantity\` DECIMAL(20, 8) NULL,
      \`broker_quantity\` DECIMAL(20, 8) NULL,
      \`custodian_quantity\` DECIMAL(20, 8) NULL,
      \`price\` DECIMAL(20, 8) NULL,
      \`trade_date\` DATE NULL,
      \`trade_id\` VARCHAR(191) NULL,
      \`broker_line_id\` VARCHAR(191) NULL,
      \`custodian_line_id\` VARCHAR(191) NULL,
      \`message\` TEXT NULL,
      \`resolution_reason\` TEXT NULL,
      \`resolved_by_id\` VARCHAR(191) NULL,
      \`resolved_at\` DATETIME(3) NULL,
      \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      KEY \`investment_trade_recon_exceptions_batch_idx\` (\`batch_id\`, \`status\`),
      KEY \`investment_trade_recon_exceptions_trade_idx\` (\`trade_id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
  );

  // Seed default templates (idempotent upsert by code)
  const templates = [
    {
      id: "trtpl_broker_zse_csv_v1",
      code: "BROKER_ZSE_CSV_V1",
      name: "Broker ZSE trade statement CSV v1",
      party: "BROKER",
      columnMap: {
        instrumentSymbol: "symbol",
        side: "side",
        quantity: "quantity",
        price: "price",
        tradeDate: "trade_date",
        externalRef: "broker_ref",
        currencyCode: "currency",
      },
    },
    {
      id: "trtpl_custodian_csd_csv_v1",
      code: "CUSTODIAN_CSD_CSV_V1",
      name: "Custodian CSD settlement statement CSV v1",
      party: "CUSTODIAN",
      columnMap: {
        instrumentSymbol: "symbol",
        side: "side",
        quantity: "quantity",
        price: "price",
        tradeDate: "trade_date",
        externalRef: "custodian_ref",
        currencyCode: "currency",
      },
    },
  ];

  for (const t of templates) {
    const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      `SELECT id FROM investment_trade_recon_templates WHERE code = ? LIMIT 1`,
      t.code
    );
    if (existing.length) {
      console.log(`[skip] template ${t.code}`);
      continue;
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO investment_trade_recon_templates
       (id, code, name, party, format, column_map_json, is_active)
       VALUES (?, ?, ?, ?, 'CSV', CAST(? AS JSON), 1)`,
      t.id,
      t.code,
      t.name,
      t.party,
      JSON.stringify(t.columnMap)
    );
    console.log(`[ok] seeded template ${t.code}`);
  }

  // BA-RC-2 — cash journal ↔ trade link
  if (await tableExists("sp_cash_journals")) {
    await addColumn("sp_cash_journals", "trade_id", "`trade_id` VARCHAR(191) NULL");
    const idx = await prisma.$queryRawUnsafe<Array<{ cnt: bigint }>>(
      `SELECT COUNT(*) AS cnt FROM information_schema.STATISTICS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'sp_cash_journals' AND INDEX_NAME = 'sp_cash_journals_trade_idx'`
    );
    if (Number(idx[0]?.cnt || 0) === 0) {
      await prisma.$executeRawUnsafe(
        `CREATE INDEX \`sp_cash_journals_trade_idx\` ON \`sp_cash_journals\` (\`trade_id\`)`
      );
      console.log("[ok] index sp_cash_journals_trade_idx");
    } else {
      console.log("[skip] index sp_cash_journals_trade_idx");
    }
  } else if (await tableExists("sp_cash_ledger_lines")) {
    await addColumn("sp_cash_ledger_lines", "trade_id", "`trade_id` VARCHAR(191) NULL");
  } else if (await tableExists("sp_cash_ledger_entries")) {
    await addColumn("sp_cash_ledger_entries", "trade_id", "`trade_id` VARCHAR(191) NULL");
  } else {
    console.log("[skip] no sp_cash_journals / ledger table for trade_id");
  }

  console.log("Trading/recon retune DDL complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
