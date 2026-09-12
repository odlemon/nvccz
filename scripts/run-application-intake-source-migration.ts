/**
 * Add applications.source (VARCHAR 32) for intake origin:
 * INTERNAL | APPLICANT_FORM. Default APPLICANT_FORM. Idempotent.
 *
 * Run: npm run db:migrate:application-intake-source
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
  const col = "source";

  if (!(await columnExists(table, col))) {
    await prisma.$executeRawUnsafe(`
      ALTER TABLE \`${table}\`
      ADD COLUMN \`${col}\` VARCHAR(32) NOT NULL DEFAULT 'APPLICANT_FORM'
    `);
    console.log(`[ok] ${table}.${col}`);
  } else {
    console.log(`[skip] ${table}.${col} exists`);
  }

  console.log("\nApplication intake source migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
