/**
 * Widen journal_entry_lines debit/credit to DECIMAL(15,3) so sub-cent rounding variance (e.g. 0.001 ZiG) can post.
 * Direct SQL via Prisma (no prisma migrate).
 * Idempotent: skips if columns already DECIMAL(15,3).
 *
 * Run: npm run db:migrate:journal-line-amount-precision
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function getNumericScale(table: string, column: string): Promise<number | null> {
  const rows = await prisma.$queryRawUnsafe<Array<{ NUMERIC_SCALE: number | null }>>(
    `SELECT NUMERIC_SCALE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  const s = rows[0]?.NUMERIC_SCALE as unknown;
  return s == null ? null : Number(s);
}

async function main() {
  const table = 'journal_entry_lines';
  const debitScale = await getNumericScale(table, 'debitAmount');
  const creditScale = await getNumericScale(table, 'creditAmount');

  if (debitScale === 3 && creditScale === 3) {
    console.log('[skip] journal_entry_lines debitAmount/creditAmount already DECIMAL(...,3)');
    return;
  }

  await prisma.$executeRawUnsafe(`
    ALTER TABLE \`${table}\`
      MODIFY COLUMN \`debitAmount\` DECIMAL(15,3) NOT NULL DEFAULT 0,
      MODIFY COLUMN \`creditAmount\` DECIMAL(15,3) NOT NULL DEFAULT 0
  `);
  console.log('[ok] journal_entry_lines debitAmount/creditAmount → DECIMAL(15,3)');

  const d = await getNumericScale(table, 'debitAmount');
  const c = await getNumericScale(table, 'creditAmount');
  if (d !== 3 || c !== 3) {
    throw new Error(`Verify failed: expected NUMERIC_SCALE 3, got debit=${d} credit=${c}`);
  }
  console.log('[verify OK] NUMERIC_SCALE=3 on debitAmount and creditAmount');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
