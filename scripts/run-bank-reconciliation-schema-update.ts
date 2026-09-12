/**
 * Run bank reconciliation schema update (adds columns without Prisma migrate).
 * Execute: npx ts-node scripts/run-bank-reconciliation-schema-update.ts
 * Or: node --loader ts-node/esm scripts/run-bank-reconciliation-schema-update.ts
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();

const statements = [
  'ALTER TABLE bank_reconciliations ADD COLUMN bank_id VARCHAR(255) NULL',
  'ALTER TABLE bank_reconciliations ADD COLUMN account_number VARCHAR(100) NULL',
  'ALTER TABLE bank_reconciliations ADD COLUMN account_currency VARCHAR(10) NULL',
  'ALTER TABLE bank_reconciliations ADD COLUMN opening_balance DECIMAL(18,2) NULL',
  'ALTER TABLE bank_reconciliations ADD COLUMN closing_balance DECIMAL(18,2) NULL',
  'ALTER TABLE bank_reconciliations ADD COLUMN statement_date DATE NULL',
  'ALTER TABLE bank_reconciliations ADD CONSTRAINT fk_bank_recon_bank FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE SET NULL',
  'ALTER TABLE bank_transactions ADD COLUMN value_date DATE NULL',
  'ALTER TABLE bank_transactions ADD COLUMN debit_amount DECIMAL(15,2) NULL',
  'ALTER TABLE bank_transactions ADD COLUMN credit_amount DECIMAL(15,2) NULL',
  'ALTER TABLE bank_transactions ADD COLUMN balance DECIMAL(18,2) NULL',
];

async function main() {
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('OK:', sql.slice(0, 60) + '...');
    } catch (e: any) {
      if (e.message?.includes('Duplicate column') || e.message?.includes('already exists') || e.message?.includes('Duplicate key')) {
        console.log('SKIP (already exists):', sql.slice(0, 50) + '...');
      } else {
        console.error('FAIL:', sql);
        console.error(e.message);
      }
    }
  }
  console.log('Done.');
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
