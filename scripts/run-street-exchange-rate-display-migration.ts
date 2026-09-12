/**
 * Street Exchange Rate Display — schema + seed sources/configs.
 * Idempotent. Run: npm run db:migrate:street-exchange-rate-display
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

const DEFAULT_FORMAT = JSON.stringify({
  showBidAsk: true,
  showSpread: true,
  showChangePct: true,
  decimals: 2,
  labelTemplate: "ZWG per 1 USD",
});

const DEFAULT_CONTEXTS = [
  { contextCode: "DASHBOARD_ACCOUNTING", sortOrder: 10 },
  { contextCode: "DASHBOARD_PORTFOLIO", sortOrder: 20 },
  { contextCode: "DASHBOARD_CEO", sortOrder: 30 },
  { contextCode: "PRICING_LISTED_EQUITY", sortOrder: 40 },
  { contextCode: "LP_PORTAL", sortOrder: 50 },
  { contextCode: "GENERIC", sortOrder: 99 },
];

async function main() {
  if (!(await tableExists("exchange_rate_display_sources"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`exchange_rate_display_sources\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`source_code\` VARCHAR(32) NOT NULL,
        \`display_name\` VARCHAR(128) NOT NULL,
        \`source_url\` TEXT NULL,
        \`rate_type\` VARCHAR(16) NOT NULL,
        \`is_enabled\` BOOLEAN NOT NULL DEFAULT true,
        \`refresh_cron_windows\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`exchange_rate_display_sources_code_key\` (\`source_code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] exchange_rate_display_sources");
  } else {
    console.log("[skip] exchange_rate_display_sources");
  }

  if (!(await tableExists("exchange_rate_quotes"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`exchange_rate_quotes\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`source_code\` VARCHAR(32) NOT NULL,
        \`from_currency_code\` VARCHAR(8) NOT NULL,
        \`to_currency_code\` VARCHAR(8) NOT NULL,
        \`as_of_date\` DATE NOT NULL,
        \`fetched_at\` DATETIME(3) NOT NULL,
        \`bid\` DECIMAL(15, 6) NOT NULL,
        \`ask\` DECIMAL(15, 6) NOT NULL,
        \`avg\` DECIMAL(15, 6) NOT NULL,
        \`previous_avg\` DECIMAL(15, 6) NULL,
        \`change_pct\` DECIMAL(8, 4) NULL,
        \`sha256_checksum\` VARCHAR(64) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`exchange_rate_quotes_daily_key\` (\`source_code\`, \`from_currency_code\`, \`to_currency_code\`, \`as_of_date\`),
        INDEX \`exchange_rate_quotes_pair_date_idx\` (\`source_code\`, \`from_currency_code\`, \`to_currency_code\`, \`as_of_date\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] exchange_rate_quotes");
  } else {
    console.log("[skip] exchange_rate_quotes");
  }

  if (!(await tableExists("exchange_rate_display_configs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`exchange_rate_display_configs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`context_code\` VARCHAR(64) NOT NULL,
        \`from_currency_code\` VARCHAR(8) NOT NULL,
        \`to_currency_code\` VARCHAR(8) NOT NULL,
        \`primary_source_code\` VARCHAR(32) NOT NULL,
        \`comparison_source_code\` VARCHAR(32) NULL,
        \`display_format\` JSON NULL,
        \`sort_order\` INT NOT NULL DEFAULT 0,
        \`is_active\` BOOLEAN NOT NULL DEFAULT true,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`exchange_rate_display_configs_ctx_pair_key\` (\`context_code\`, \`from_currency_code\`, \`to_currency_code\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] exchange_rate_display_configs");
  } else {
    console.log("[skip] exchange_rate_display_configs");
  }

  const sources = [
    {
      id: "erds_zimrate_street",
      source_code: "ZIMRATE_STREET",
      display_name: "Zimrate Street (Parallel)",
      source_url: "https://zimrate.com/",
      rate_type: "STREET",
    },
    {
      id: "erds_zimrate_official",
      source_code: "ZIMRATE_OFFICIAL",
      display_name: "Zimrate Official",
      source_url: "https://zimrate.com/",
      rate_type: "OFFICIAL",
    },
    {
      id: "erds_manual",
      source_code: "MANUAL",
      display_name: "Manual exchange_rates table",
      source_url: null,
      rate_type: "MANUAL",
    },
    {
      id: "erds_internal",
      source_code: "INTERNAL",
      display_name: "Internal company override",
      source_url: null,
      rate_type: "INTERNAL",
    },
  ];

  for (const s of sources) {
    const exists = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM exchange_rate_display_sources WHERE source_code = ?`,
      s.source_code
    );
    if (Number(exists[0]?.c ?? 0) > 0) {
      console.log(`[skip] source ${s.source_code}`);
      continue;
    }
    await prisma.$executeRawUnsafe(
      `INSERT INTO exchange_rate_display_sources (id, source_code, display_name, source_url, rate_type, is_enabled, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      s.id,
      s.source_code,
      s.display_name,
      s.source_url,
      s.rate_type
    );
    console.log(`[ok] source ${s.source_code}`);
  }

  for (const ctx of DEFAULT_CONTEXTS) {
    const exists = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c FROM exchange_rate_display_configs
       WHERE context_code = ? AND from_currency_code = 'USD' AND to_currency_code = 'ZWG'`,
      ctx.contextCode
    );
    if (Number(exists[0]?.c ?? 0) > 0) {
      console.log(`[skip] config ${ctx.contextCode}`);
      continue;
    }
    const id = `ercfg_${ctx.contextCode.toLowerCase()}`;
    await prisma.$executeRawUnsafe(
      `INSERT INTO exchange_rate_display_configs
       (id, context_code, from_currency_code, to_currency_code, primary_source_code, comparison_source_code,
        display_format, sort_order, is_active, created_at, updated_at)
       VALUES (?, ?, 'USD', 'ZWG', 'ZIMRATE_STREET', 'ZIMRATE_OFFICIAL', ?, ?, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))`,
      id,
      ctx.contextCode,
      DEFAULT_FORMAT,
      ctx.sortOrder
    );
    console.log(`[ok] config ${ctx.contextCode}`);
  }

  const fkRows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'exchange_rate_quotes'
       AND CONSTRAINT_NAME = 'exchange_rate_quotes_source_fk'`
  );
  if (Number(fkRows[0]?.c ?? 0) === 0) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`exchange_rate_quotes\`
      ADD CONSTRAINT \`exchange_rate_quotes_source_fk\`
      FOREIGN KEY (\`source_code\`) REFERENCES \`exchange_rate_display_sources\`(\`source_code\`)
      ON DELETE RESTRICT ON UPDATE CASCADE
    `);
    console.log("[ok] exchange_rate_quotes FK");
  } else {
    console.log("[skip] exchange_rate_quotes FK");
  }

  console.log("Street exchange rate display migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
