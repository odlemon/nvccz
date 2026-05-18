/**
 * Add applications.screeningRejectionReason (TEXT) for internal screening rejection notes. Idempotent.
 *
 * Run: npm run db:migrate:application-screening-rejection-reason
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
  const table = "applications";
  const col = "screeningRejectionReason";

  if (!(await columnExists(table, col))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${table}\`
      ADD COLUMN \`${col}\` TEXT NULL
    `);
    console.log(`[ok] ${table}.${col}`);
  } else {
    console.log(`[skip] ${table}.${col} exists`);
  }

  console.log("\nApplication screening rejection reason migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
