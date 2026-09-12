/**
 * Adds purchase_invoices.source_purchase_order_id (optional FK to purchase_orders) for three-way PO variance.
 * Idempotent.
 *
 * Run: npm run db:migrate:purchase-invoice-source-po
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TABLE = 'purchase_invoices';
const COLUMN = 'source_purchase_order_id';
const FK_NAME = 'purchase_invoices_source_purchase_order_id_fkey';

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function fkExists(table: string, constraintName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = ?
       AND CONSTRAINT_TYPE = 'FOREIGN KEY'`,
    table,
    constraintName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  if (!(await columnExists(TABLE, COLUMN))) {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE `' +
        TABLE +
        '` ADD COLUMN `' +
        COLUMN +
        "` VARCHAR(191) NULL COMMENT 'PO link for variance check on submit'"
    );
    console.log('[ok] added ' + TABLE + '.' + COLUMN);
  } else {
    console.log('[skip] ' + TABLE + '.' + COLUMN + ' already exists');
  }

  if (!(await fkExists(TABLE, FK_NAME))) {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE `' +
        TABLE +
        '` ADD CONSTRAINT `' +
        FK_NAME +
        '` FOREIGN KEY (`' +
        COLUMN +
        '`) REFERENCES `purchase_orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE'
    );
    console.log('[ok] added FK ' + FK_NAME);
  } else {
    console.log('[skip] FK ' + FK_NAME + ' already exists');
  }

  if (!(await columnExists(TABLE, COLUMN)) || !(await fkExists(TABLE, FK_NAME))) {
    throw new Error('Verification failed');
  }
  console.log('\nPurchase invoice source PO migration finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
