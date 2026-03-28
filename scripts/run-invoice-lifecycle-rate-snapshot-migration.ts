/**
 * Adds invoice send/paid exchange snapshot columns (no prisma migrate).
 * Safe to re-run: skips columns that already exist.
 *
 * Usage: npx ts-node scripts/run-invoice-lifecycle-rate-snapshot-migration.ts
 */
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
  console.log(`[ok] ${table}.${column}`);
}

async function main() {
  const table = 'invoices';

  await addColumnIfMissing(
    table,
    'exchange_rate_at_sent',
    'DECIMAL(15,6) NULL',
    'ZWG per USD when invoice sent'
  );
  await addColumnIfMissing(
    table,
    'usd_zwg_rate_snapshot_sent',
    'DECIMAL(18,6) NULL',
    'USD/ZWG snapshot when invoice sent'
  );
  await addColumnIfMissing(
    table,
    'exchange_rate_at_paid',
    'DECIMAL(15,6) NULL',
    'ZWG per USD when invoice marked paid'
  );
  await addColumnIfMissing(
    table,
    'usd_zwg_rate_snapshot_paid',
    'DECIMAL(18,6) NULL',
    'USD/ZWG snapshot when invoice marked paid'
  );

  console.log('Invoice lifecycle rate snapshot migration finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
