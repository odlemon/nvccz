-- Bank reconciliation schema update (manual execution - do NOT use Prisma migrate)
-- Run this script once. Adds fields for bank statement format: Account Number, Account Currency, Opening/Closing Balance;
-- and per-transaction: Value Date, Debit, Credit, Balance.
-- Database: MySQL. If a column already exists, skip that statement.

-- 1. bank_reconciliations: statement header fields
ALTER TABLE bank_reconciliations ADD COLUMN bank_id VARCHAR(255) NULL;
ALTER TABLE bank_reconciliations ADD COLUMN account_number VARCHAR(100) NULL;
ALTER TABLE bank_reconciliations ADD COLUMN account_currency VARCHAR(10) NULL;
ALTER TABLE bank_reconciliations ADD COLUMN opening_balance DECIMAL(18,2) NULL;
ALTER TABLE bank_reconciliations ADD COLUMN closing_balance DECIMAL(18,2) NULL;
ALTER TABLE bank_reconciliations ADD COLUMN statement_date DATE NULL;
ALTER TABLE bank_reconciliations ADD CONSTRAINT fk_bank_recon_bank FOREIGN KEY (bank_id) REFERENCES banks(id) ON DELETE SET NULL;

-- 2. bank_transactions: value date, debit, credit, balance
ALTER TABLE bank_transactions ADD COLUMN value_date DATE NULL;
ALTER TABLE bank_transactions ADD COLUMN debit_amount DECIMAL(15,2) NULL;
ALTER TABLE bank_transactions ADD COLUMN credit_amount DECIMAL(15,2) NULL;
ALTER TABLE bank_transactions ADD COLUMN balance DECIMAL(18,2) NULL;
