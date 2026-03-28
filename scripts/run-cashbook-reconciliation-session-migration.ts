/**
 * Cashbook bank reconciliation sessions (draft / finish) + session lines + FK on cashbook_entries.
 * Run: npm run db:migrate:cashbook-reconciliation-sessions
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

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const sessionsTable = "cashbook_reconciliation_sessions";
  const linesTable = "cashbook_reconciliation_session_lines";

  if (!(await tableExists(sessionsTable))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${sessionsTable}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`bank_id\` VARCHAR(191) NOT NULL,
        \`status\` ENUM('DRAFT','FINALIZED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
        \`statement_date\` DATETIME(3) NOT NULL,
        \`statement_end_balance\` DECIMAL(18,2) NOT NULL,
        \`reference\` VARCHAR(255) NULL,
        \`opening_balance\` DECIMAL(18,2) NULL,
        \`closing_balance\` DECIMAL(18,2) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`finished_by_id\` VARCHAR(191) NULL,
        \`finished_at\` DATETIME(3) NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        KEY \`cashbook_recon_sess_bank_status\` (\`bank_id\`, \`status\`),
        KEY \`cashbook_recon_sess_bank_stmt\` (\`bank_id\`, \`statement_date\`),
        CONSTRAINT \`cashbook_recon_sess_bank_fk\` FOREIGN KEY (\`bank_id\`) REFERENCES \`banks\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`cashbook_recon_sess_created_fk\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`cashbook_recon_sess_finished_fk\` FOREIGN KEY (\`finished_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] created", sessionsTable);
  } else {
    console.log("[skip] table exists:", sessionsTable);
  }

  if (!(await tableExists(linesTable))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${linesTable}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`session_id\` VARCHAR(191) NOT NULL,
        \`cashbook_entry_id\` VARCHAR(191) NOT NULL,
        \`selected\` BOOLEAN NOT NULL DEFAULT true,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`cashbook_recon_session_line_unique\` (\`session_id\`, \`cashbook_entry_id\`),
        KEY \`cashbook_recon_session_line_entry\` (\`cashbook_entry_id\`),
        CONSTRAINT \`cashbook_recon_line_session_fk\` FOREIGN KEY (\`session_id\`) REFERENCES \`${sessionsTable}\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`cashbook_recon_line_entry_fk\` FOREIGN KEY (\`cashbook_entry_id\`) REFERENCES \`cashbook_entries\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log("[ok] created", linesTable);
  } else {
    console.log("[skip] table exists:", linesTable);
  }

  if (!(await columnExists("cashbook_entries", "cashbook_reconciliation_session_id"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`cashbook_entries\`
      ADD COLUMN \`cashbook_reconciliation_session_id\` VARCHAR(191) NULL,
      ADD KEY \`cashbook_entries_recon_session_id\` (\`cashbook_reconciliation_session_id\`),
      ADD CONSTRAINT \`cashbook_entries_recon_session_fk\`
        FOREIGN KEY (\`cashbook_reconciliation_session_id\`) REFERENCES \`${sessionsTable}\` (\`id\`)
        ON DELETE SET NULL ON UPDATE CASCADE
    `);
    console.log("[ok] added cashbook_entries.cashbook_reconciliation_session_id");
  } else {
    console.log("[skip] column cashbook_reconciliation_session_id already on cashbook_entries");
  }

  console.log("\nCashbook reconciliation session migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
