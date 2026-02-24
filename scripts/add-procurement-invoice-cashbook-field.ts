// @ts-nocheck
/**
 * Add cashbook_entry_id to procurement_invoices (direct DB update, no Prisma migrate).
 * Run: npx ts-node scripts/add-procurement-invoice-cashbook-field.ts
 */
import { prisma } from '../src/utils/database';

async function addProcurementInvoiceCashbookField() {
  console.log('🚀 Adding cashbook_entry_id to procurement_invoices...\n');

  try {
    const table = 'procurement_invoices';
    const column = 'cashbook_entry_id';

    console.log('🔍 Checking if column exists...');
    const cols: any[] = await prisma.$queryRawUnsafe(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
    `, table, column);

    if (Array.isArray(cols) && cols.length > 0) {
      console.log('   ⏭️  Column already exists, skipping.\n');
      return;
    }

    console.log('   Adding column...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE procurement_invoices
      ADD COLUMN cashbook_entry_id VARCHAR(191) NULL UNIQUE
    `);
    console.log('   ✅ Column added.');

    console.log('🔍 Checking if FK constraint exists...');
    const fks: any[] = await prisma.$queryRawUnsafe(`
      SELECT CONSTRAINT_NAME FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL
    `, table, column);

    if (Array.isArray(fks) && fks.length > 0) {
      console.log('   ⏭️  FK already exists, skipping.\n');
      return;
    }

    console.log('   Adding FK to cashbook_entries...');
    await prisma.$executeRawUnsafe(`
      ALTER TABLE procurement_invoices
      ADD CONSTRAINT procurement_invoices_cashbook_entry_id_fkey
      FOREIGN KEY (cashbook_entry_id) REFERENCES cashbook_entries(id) ON DELETE SET NULL ON UPDATE CASCADE
    `);
    console.log('   ✅ FK added.\n');
    console.log('✅ Done. Run: npx prisma generate');
  } catch (e: any) {
    console.error('❌ Error:', e.message);
    throw e;
  } finally {
    await prisma.$disconnect();
  }
}

addProcurementInvoiceCashbookField();
