/**
 * Adds invoice JSON columns for persisted payment conversion + cross-currency breakdown.
 * Communicates with MySQL directly via Prisma raw SQL (no `prisma migrate` / `db push`).
 * Safe to re-run: skips columns that already exist; verifies columns at the end.
 *
 * Run: npx ts-node scripts/run-invoice-payment-snapshot-migration.ts
 * Or:  npm run db:migrate:invoice-payment-snapshots
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

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

async function addColumnIfMissing(table: string, column: string, definition: string, comment?: string) {
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

async function verifyColumns(table: string, columns: string[]): Promise<boolean> {
  let ok = true;
  for (const col of columns) {
    const exists = await columnExists(table, col);
    if (!exists) {
      console.error(`[verify FAIL] missing ${table}.${col}`);
      ok = false;
    } else {
      console.log(`[verify OK] ${table}.${col}`);
    }
  }
  return ok;
}

async function main() {
  const table = 'invoices';

  await addColumnIfMissing(
    table,
    'payment_settlement_snapshot',
    'JSON NULL',
    'Normalized payment conversion + realized FX when marked PAID'
  );
  await addColumnIfMissing(
    table,
    'cross_currency_payment_snapshot',
    'JSON NULL',
    'Path-specific cross-currency payment breakdown'
  );

  const allPresent = await verifyColumns(table, [
    'payment_settlement_snapshot',
    'cross_currency_payment_snapshot'
  ]);

  if (!allPresent) {
    throw new Error('Verification failed: not all columns exist');
  }

  console.log('\nInvoice payment snapshot migration finished and verified.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
