/**
 * Applies accounting exchange snapshot columns directly (no prisma migrate).
 * Safe to re-run: skips existing columns / FKs.
 *
 * Usage: npx ts-node scripts/run-accounting-exchange-snapshot-migration.ts
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

async function constraintExists(table: string, constraintName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?`,
    table,
    constraintName
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
  console.log(`[ok] ${table}.${column}`);
}

async function addForeignKeyIfMissing(
  table: string,
  constraintName: string,
  column: string
) {
  if (await constraintExists(table, constraintName)) {
    console.log(`[skip] FK ${constraintName} on ${table}`);
    return;
  }
  await prisma.$executeRawUnsafe(
    `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraintName}\` FOREIGN KEY (\`${column}\`) REFERENCES \`currencies\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE`
  );
  console.log(`[ok] FK ${constraintName} on ${table}`);
}

async function main() {
  const snapComment = 'USD/ZWG avg from Zimrate at transaction time';
  const curComment = 'Currency the row was recorded in (denormalized at creation)';

  await addColumnIfMissing(
    'journal_entries',
    'usd_zwg_rate_snapshot',
    'DECIMAL(18,6) NULL',
    snapComment
  );

  for (const t of [
    'expenses',
    'revenues',
    'invoices',
    'purchase_invoices',
    'procurement_invoices',
    'credit_notes'
  ]) {
    await addColumnIfMissing(t, 'usd_zwg_rate_snapshot', 'DECIMAL(18,6) NULL', snapComment);
  }

  await addColumnIfMissing(
    'cashbook_entries',
    'recorded_currency_id',
    'VARCHAR(191) NULL',
    curComment
  );
  await addColumnIfMissing(
    'cashbook_entries',
    'usd_zwg_rate_snapshot',
    'DECIMAL(18,6) NULL',
    snapComment
  );
  await addForeignKeyIfMissing(
    'cashbook_entries',
    'cashbook_entries_recorded_currency_id_fkey',
    'recorded_currency_id'
  );

  await addColumnIfMissing('assets', 'recorded_currency_id', 'VARCHAR(191) NULL', curComment);
  await addColumnIfMissing(
    'assets',
    'usd_zwg_rate_snapshot',
    'DECIMAL(18,6) NULL',
    snapComment
  );
  await addForeignKeyIfMissing(
    'assets',
    'assets_recorded_currency_id_fkey',
    'recorded_currency_id'
  );

  await addColumnIfMissing(
    'stock_movements',
    'recorded_currency_id',
    'VARCHAR(191) NULL',
    curComment
  );
  await addColumnIfMissing(
    'stock_movements',
    'usd_zwg_rate_snapshot',
    'DECIMAL(18,6) NULL',
    snapComment
  );
  await addForeignKeyIfMissing(
    'stock_movements',
    'stock_movements_recorded_currency_id_fkey',
    'recorded_currency_id'
  );

  await addColumnIfMissing(
    'inventory_items',
    'recorded_currency_id',
    'VARCHAR(191) NULL',
    curComment
  );
  await addColumnIfMissing(
    'inventory_items',
    'usd_zwg_rate_snapshot',
    'DECIMAL(18,6) NULL',
    snapComment
  );
  await addForeignKeyIfMissing(
    'inventory_items',
    'inventory_items_recorded_currency_id_fkey',
    'recorded_currency_id'
  );

  await addColumnIfMissing(
    'depreciation_records',
    'recorded_currency_id',
    'VARCHAR(191) NULL',
    curComment
  );
  await addColumnIfMissing(
    'depreciation_records',
    'usd_zwg_rate_snapshot',
    'DECIMAL(18,6) NULL',
    snapComment
  );
  await addForeignKeyIfMissing(
    'depreciation_records',
    'depreciation_records_recorded_currency_id_fkey',
    'recorded_currency_id'
  );

  await addColumnIfMissing(
    'asset_disposal_records',
    'recorded_currency_id',
    'VARCHAR(191) NULL',
    curComment
  );
  await addColumnIfMissing(
    'asset_disposal_records',
    'usd_zwg_rate_snapshot',
    'DECIMAL(18,6) NULL',
    snapComment
  );
  await addForeignKeyIfMissing(
    'asset_disposal_records',
    'asset_disposal_records_recorded_currency_id_fkey',
    'recorded_currency_id'
  );

  console.log('Accounting exchange snapshot migration finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
