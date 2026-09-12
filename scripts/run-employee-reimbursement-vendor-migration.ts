/**
 * Adds employees.reimbursement_vendor_id (optional FK to vendors) for staff reimbursement creditor tracking.
 * Idempotent: skips pieces that already exist.
 *
 * Run: npx ts-node scripts/run-employee-reimbursement-vendor-migration.ts
 * Or:  npm run db:migrate:employee-reimbursement-vendor
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TABLE = 'employees';
const COLUMN = 'reimbursement_vendor_id';
const FK_NAME = 'employees_reimbursement_vendor_id_fkey';
const UNIQUE_NAME = 'employees_reimbursement_vendor_id_key';

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

async function uniqueIndexExists(table: string, indexName: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ? AND NON_UNIQUE = 0`,
    table,
    indexName
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

/** Any UNIQUE (or PK) index on this column — avoids duplicate unique if Prisma used another index name. */
async function columnHasUniqueIndex(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ? AND NON_UNIQUE = 0`,
    table,
    column
  );
  return Number(rows[0]?.c ?? 0) > 0;
}

async function main() {
  const colOk = await columnExists(TABLE, COLUMN);
  if (!colOk) {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE `' +
        TABLE +
        '` ADD COLUMN `' +
        COLUMN +
        "` VARCHAR(191) NULL COMMENT 'Vendor shell for staff reimbursement / creditor tracking'"
    );
    console.log('[ok] added ' + TABLE + '.' + COLUMN);
  } else {
    console.log('[skip] ' + TABLE + '.' + COLUMN + ' already exists');
  }

  if (!(await uniqueIndexExists(TABLE, UNIQUE_NAME)) && !(await columnHasUniqueIndex(TABLE, COLUMN))) {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE `' + TABLE + '` ADD UNIQUE INDEX `' + UNIQUE_NAME + '` (`' + COLUMN + '`)'
    );
    console.log('[ok] added unique index ' + UNIQUE_NAME);
  } else {
    console.log('[skip] unique index on ' + COLUMN + ' already exists (or ' + UNIQUE_NAME + ' present)');
  }

  if (!(await fkExists(TABLE, FK_NAME))) {
    await prisma.$executeRawUnsafe(
      'ALTER TABLE `' +
        TABLE +
        '` ADD CONSTRAINT `' +
        FK_NAME +
        '` FOREIGN KEY (`' +
        COLUMN +
        '`) REFERENCES `vendors`(`id`) ON DELETE SET NULL ON UPDATE CASCADE'
    );
    console.log('[ok] added FK ' + FK_NAME);
  } else {
    console.log('[skip] FK ' + FK_NAME + ' already exists');
  }

  if (!(await columnExists(TABLE, COLUMN)) || !(await fkExists(TABLE, FK_NAME))) {
    throw new Error('Verification failed');
  }

  console.log('\nEmployee reimbursement vendor column migration finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
