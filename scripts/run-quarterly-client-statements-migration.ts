/**
 * Quarterly Client Statements — schema.
 * Idempotent. Run: npm run db:migrate:quarterly-client-statements
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
  if (!(await tableExists("quarterly_statement_runs"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`quarterly_statement_runs\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL,
        \`financial_year\` INT NOT NULL,
        \`calendar_quarter\` VARCHAR(4) NOT NULL,
        \`period_start\` DATE NOT NULL,
        \`period_end\` DATE NOT NULL,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'COMPILING',
        \`reconciled\` BOOLEAN NOT NULL DEFAULT false,
        \`compiled_by_id\` VARCHAR(191) NULL,
        \`submitted_by_id\` VARCHAR(191) NULL,
        \`approved_by_id\` VARCHAR(191) NULL,
        \`approved_at\` DATETIME(3) NULL,
        \`locked_at\` DATETIME(3) NULL,
        \`error_message\` TEXT NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`quarterly_statement_runs_fund_period_key\` (\`fund_id\`, \`financial_year\`, \`calendar_quarter\`),
        INDEX \`quarterly_statement_runs_fund_idx\` (\`fund_id\`),
        INDEX \`quarterly_statement_runs_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] quarterly_statement_runs");
  } else {
    console.log("[skip] quarterly_statement_runs");
  }

  if (!(await tableExists("quarterly_statement_recipients"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`quarterly_statement_recipients\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`run_id\` VARCHAR(191) NOT NULL,
        \`client_id\` VARCHAR(191) NOT NULL,
        \`lp_legal_name\` VARCHAR(255) NOT NULL,
        \`status\` VARCHAR(16) NOT NULL DEFAULT 'PENDING',
        \`metrics_snapshot\` JSON NULL,
        \`dpi\` DECIMAL(12, 4) NULL,
        \`tvpi\` DECIMAL(12, 4) NULL,
        \`rvpi\` DECIMAL(12, 4) NULL,
        \`net_irr\` DECIMAL(12, 4) NULL,
        \`pdf_sha256\` VARCHAR(64) NULL,
        \`pdf_storage_path\` VARCHAR(512) NULL,
        \`pdf_file_url\` VARCHAR(1024) NULL,
        \`pdf_file_size\` INT NULL,
        \`portal_document_id\` VARCHAR(191) NULL,
        \`compiled_at\` DATETIME(3) NULL,
        \`published_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        UNIQUE INDEX \`quarterly_statement_recipients_run_client_key\` (\`run_id\`, \`client_id\`),
        INDEX \`quarterly_statement_recipients_run_idx\` (\`run_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] quarterly_statement_recipients");
  } else {
    console.log("[skip] quarterly_statement_recipients");
  }

  if (!(await tableExists("quarterly_statement_ledger_snapshots"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`quarterly_statement_ledger_snapshots\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`run_id\` VARCHAR(191) NOT NULL,
        \`client_id\` VARCHAR(191) NULL,
        \`source_type\` VARCHAR(24) NOT NULL,
        \`source_id\` VARCHAR(191) NOT NULL,
        \`transaction_date\` DATE NOT NULL,
        \`amount\` DECIMAL(18, 2) NOT NULL,
        \`currency_code\` VARCHAR(8) NOT NULL,
        \`fx_rate_at_tx\` DECIMAL(18, 6) NULL,
        \`amount_usd\` DECIMAL(18, 2) NULL,
        \`amount_zig\` DECIMAL(18, 2) NULL,
        \`metadata\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`quarterly_statement_ledger_snapshots_run_client_idx\` (\`run_id\`, \`client_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] quarterly_statement_ledger_snapshots");
  } else {
    console.log("[skip] quarterly_statement_ledger_snapshots");
  }

  if (!(await tableExists("quarterly_statement_audit_events"))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`quarterly_statement_audit_events\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`run_id\` VARCHAR(191) NOT NULL,
        \`event_type\` VARCHAR(32) NOT NULL,
        \`actor_id\` VARCHAR(191) NOT NULL,
        \`recipient_id\` VARCHAR(191) NULL,
        \`details\` JSON NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`quarterly_statement_audit_events_run_idx\` (\`run_id\`, \`created_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] quarterly_statement_audit_events");
  } else {
    console.log("[skip] quarterly_statement_audit_events");
  }

  console.log("Quarterly client statements migration complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
