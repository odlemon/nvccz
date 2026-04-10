/**
 * Per-allocation payment ledger for capital calls (MySQL). Idempotent.
 *
 * Run: npm run db:migrate:capital-call-allocation-payments
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

async function main() {
  const table = "capital_call_allocation_payments";
  const allocations = "capital_call_allocations";

  if (!(await tableExists(allocations))) {
    console.error("Missing capital_call_allocations — run db:migrate:capital-calls first.");
    process.exitCode = 1;
    return;
  }

  if (!(await tableExists(table))) {
    await prisma.$executeRawUnsafe(`
      CREATE TABLE \`${table}\` (
        \`id\` VARCHAR(191) NOT NULL,
        \`capital_call_allocation_id\` VARCHAR(191) NOT NULL,
        \`amount\` DECIMAL(15, 2) NOT NULL,
        \`recorded_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`created_at\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        INDEX \`capital_call_allocation_payments_allocation_idx\` (\`capital_call_allocation_id\`),
        CONSTRAINT \`capital_call_allocation_payments_allocation_id_fkey\` FOREIGN KEY (\`capital_call_allocation_id\`) REFERENCES \`${allocations}\` (\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
    `);
    console.log("[ok] created capital_call_allocation_payments");
  } else {
    console.log("[skip] capital_call_allocation_payments exists");
  }

  console.log("Done. Run: npx prisma generate");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
