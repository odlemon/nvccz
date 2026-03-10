-- ============================================================
-- Add cashbook_entry_id to procurement_invoices (PRODUCTION)
-- Run this on prod DB so /api/procurement/invoices works.
-- ============================================================
-- Option A: Run with MySQL client:
--   mysql -h HOST -u USER -p DATABASE < scripts/sql/apply_procurement_cashbook_entry_id_prod.sql
-- Option B: Run the TS script (uses DATABASE_URL from .env):
--   DATABASE_URL="mysql://user:pass@31.220.82.129:3306/client1_db" npx ts-node scripts/add-procurement-invoice-cashbook-field.ts
-- ============================================================

-- Step 1: Add column (required for Prisma schema)
-- If column already exists, this will error - that's OK, skip to end.
ALTER TABLE procurement_invoices
ADD COLUMN cashbook_entry_id VARCHAR(191) NULL UNIQUE;

-- Step 2 (optional): Add FK - skip if your Prisma uses relationMode = "prisma" or if this fails
-- ALTER TABLE procurement_invoices
-- ADD CONSTRAINT procurement_invoices_cashbook_entry_id_fkey
-- FOREIGN KEY (cashbook_entry_id) REFERENCES cashbook_entries(id) ON DELETE SET NULL ON UPDATE CASCADE;
