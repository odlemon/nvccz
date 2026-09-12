/**
 * Tax Return Pack — gap-fill columns.
 * Adds `filing_due_date` to `tax_return_packs` (nullable, additive only).
 * Idempotent: skips columns that already exist.
 *
 * Run: npm run db:migrate:tax-return-pack-gaps
 * Then: npx prisma generate
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

async function addColumnIfMissing(
  table: string,
  column: string,
  definition: string,
  comment?: string
) {
  if (await columnExists(table, column)) {
    console.log(`[skip] ${table}.${column} already exists`);
    return;
  }
  const sql = comment
    ? `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition} COMMENT '${comment.replace(/'/g, "''")}'`
    : `ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`;
  await prisma.$executeRawUnsafe(sql);
  console.log(`[ok] added ${table}.${column}`);
}

async function main() {
  const table = "tax_return_packs";

  await addColumnIfMissing(
    table,
    "filing_due_date",
    "DATE NULL",
    "ZIMRA filing deadline for this tax return pack"
  );

  if (!(await columnExists(table, "filing_due_date"))) {
    throw new Error(`Missing column after migration: ${table}.filing_due_date`);
  }
  console.log(`[verify OK] ${table}.filing_due_date`);

  console.log("\nTax return pack gaps migration finished.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
