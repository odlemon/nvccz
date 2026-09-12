/**
 * Capital calls / LP drawdown tables (MySQL). Idempotent.
 *
 * Run: npm run db:migrate:capital-calls
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function fkExists(table: string, name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
     FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND CONSTRAINT_NAME = ?
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    table,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function indexExistsByName(table: string, indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c
     FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND INDEX_NAME = ?`,
    table,
    indexName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const allocations = "capital_call_allocations";
  const calls = "capital_calls";

  if (!(await tableExists(calls))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${calls}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`fund_id\` VARCHAR(191) NOT NULL,
        \`currency_id\` VARCHAR(191) NOT NULL,
        \`call_percent\` DECIMAL(12, 6) NOT NULL,
        \`payment_due_date\` DATE NOT NULL,
        \`bank_instructions\` TEXT NOT NULL,
        \`transaction_date\` DATE NOT NULL,
        \`journal_entry_id\` VARCHAR(191) NULL,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'INITIATED',
        \`notices_sent_at\` DATETIME(3) NULL,
        \`created_by_id\` VARCHAR(191) NOT NULL,
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`capital_calls_journal_entry_id_key\` (\`journal_entry_id\`),
        INDEX \`capital_calls_fund_id_idx\` (\`fund_id\`),
        CONSTRAINT \`capital_calls_fund_id_fkey\` FOREIGN KEY (\`fund_id\`) REFERENCES \`funds\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`capital_calls_currency_id_fkey\` FOREIGN KEY (\`currency_id\`) REFERENCES \`currencies\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`capital_calls_journal_entry_id_fkey\` FOREIGN KEY (\`journal_entry_id\`) REFERENCES \`journal_entries\` (\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT \`capital_calls_created_by_id_fkey\` FOREIGN KEY (\`created_by_id\`) REFERENCES \`users\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created capital_calls");
  } else {
    console.log("[skip] capital_calls exists");
  }

  if (!(await tableExists(allocations))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${allocations}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`capital_call_id\` VARCHAR(191) NOT NULL,
        \`client_id\` VARCHAR(191) NOT NULL,
        \`investment_commitment_id\` VARCHAR(191) NOT NULL,
        \`lp_legal_name_snapshot\` VARCHAR(512) NOT NULL,
        \`total_commitment_snapshot\` DECIMAL(15, 2) NOT NULL,
        \`uncalled_capital_before_snapshot\` DECIMAL(15, 2) NOT NULL,
        \`current_call_amount\` DECIMAL(15, 2) NOT NULL,
        \`amount_paid\` DECIMAL(15, 2) NOT NULL DEFAULT 0,
        \`status\` VARCHAR(32) NOT NULL DEFAULT 'PENDING',
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updated_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`capital_call_allocations_call_idx\` (\`capital_call_id\`),
        INDEX \`capital_call_allocations_client_idx\` (\`client_id\`),
        CONSTRAINT \`capital_call_allocations_capital_call_id_fkey\` FOREIGN KEY (\`capital_call_id\`) REFERENCES \`${calls}\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`capital_call_allocations_client_id_fkey\` FOREIGN KEY (\`client_id\`) REFERENCES \`clients\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT \`capital_call_allocations_investment_commitment_id_fkey\` FOREIGN KEY (\`investment_commitment_id\`) REFERENCES \`investment_commitments\` (\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created capital_call_allocations");
  } else {
    console.log("[skip] capital_call_allocations exists");
  }

  // If tables were created manually without FKs, add missing keys (idempotent)
  if ((await tableExists(calls)) && !(await fkExists(calls, "capital_calls_fund_id_fkey"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${calls}\`
      ADD CONSTRAINT \`capital_calls_fund_id_fkey\` FOREIGN KEY (\`fund_id\`) REFERENCES \`funds\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
    `);
    console.log("[ok] added capital_calls fund FK");
  }

  if ((await tableExists(calls)) && !(await indexExistsByName(calls, "capital_calls_fund_created_idx"))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${calls}\`
      ADD INDEX \`capital_calls_fund_created_idx\` (\`fund_id\`, \`created_at\`)
    `);
    console.log("[ok] added capital_calls_fund_created_idx");
  }

  if (
    (await tableExists(allocations)) &&
    !(await indexExistsByName(allocations, "capital_call_allocations_commitment_idx"))
  ) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${allocations}\`
      ADD INDEX \`capital_call_allocations_commitment_idx\` (\`investment_commitment_id\`)
    `);
    console.log("[ok] added capital_call_allocations_commitment_idx");
  }

  console.log("\nCapital calls migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
