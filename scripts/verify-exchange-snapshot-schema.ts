/**
 * Confirms DB columns/FKs match prisma/schema.prisma accounting snapshot fields.
 * Usage: npx ts-node scripts/verify-exchange-snapshot-schema.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COLUMNS: Array<[string, string]> = [
  ['journal_entries', 'usd_zwg_rate_snapshot'],
  ['expenses', 'usd_zwg_rate_snapshot'],
  ['revenues', 'usd_zwg_rate_snapshot'],
  ['invoices', 'usd_zwg_rate_snapshot'],
  ['invoices', 'exchange_rate_at_sent'],
  ['invoices', 'usd_zwg_rate_snapshot_sent'],
  ['invoices', 'exchange_rate_at_paid'],
  ['invoices', 'usd_zwg_rate_snapshot_paid'],
  ['purchase_invoices', 'usd_zwg_rate_snapshot'],
  ['procurement_invoices', 'usd_zwg_rate_snapshot'],
  ['credit_notes', 'usd_zwg_rate_snapshot'],
  ['cashbook_entries', 'recorded_currency_id'],
  ['cashbook_entries', 'usd_zwg_rate_snapshot'],
  ['assets', 'recorded_currency_id'],
  ['assets', 'usd_zwg_rate_snapshot'],
  ['stock_movements', 'recorded_currency_id'],
  ['stock_movements', 'usd_zwg_rate_snapshot'],
  ['inventory_items', 'recorded_currency_id'],
  ['inventory_items', 'usd_zwg_rate_snapshot'],
  ['depreciation_records', 'recorded_currency_id'],
  ['depreciation_records', 'usd_zwg_rate_snapshot'],
  ['asset_disposal_records', 'recorded_currency_id'],
  ['asset_disposal_records', 'usd_zwg_rate_snapshot']
];

const FOREIGN_KEYS: Array<[string, string]> = [
  ['cashbook_entries', 'cashbook_entries_recorded_currency_id_fkey'],
  ['assets', 'assets_recorded_currency_id_fkey'],
  ['stock_movements', 'stock_movements_recorded_currency_id_fkey'],
  ['inventory_items', 'inventory_items_recorded_currency_id_fkey'],
  ['depreciation_records', 'depreciation_records_recorded_currency_id_fkey'],
  ['asset_disposal_records', 'asset_disposal_records_recorded_currency_id_fkey']
];

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function fkExists(table: string, name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ? AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    table,
    name
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  let failed = false;
  for (const [table, col] of COLUMNS) {
    const ok = await columnExists(table, col);
    if (!ok) {
      console.error(`MISSING COLUMN: ${table}.${col}`);
      failed = true;
    } else {
      console.log(`OK column ${table}.${col}`);
    }
  }
  for (const [table, name] of FOREIGN_KEYS) {
    const ok = await fkExists(table, name);
    if (!ok) {
      console.error(`MISSING FK: ${table}.${name}`);
      failed = true;
    } else {
      console.log(`OK FK ${table}.${name}`);
    }
  }
  if (failed) {
    console.error('\nVerification failed.');
    process.exitCode = 1;
  } else {
    console.log('\nAll exchange-snapshot columns and FKs present (DB matches expected Prisma fields).');
  }
}

main().finally(() => prisma.$disconnect());
