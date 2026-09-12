-- Manual database update for Term Sheet: Add equityAmount and make valuation required
-- Run this SQL script directly on your database (DO NOT use migrations)
-- Usage: ts-node scripts/run-sql.ts scripts/sql/add_equity_amount_to_term_sheet.sql

-- Step 1: Add equityAmount column to term_sheets table
ALTER TABLE term_sheets 
ADD COLUMN equityAmount DECIMAL(15, 2) NOT NULL DEFAULT 0 AFTER investmentAmount;

-- Step 2: Update any existing NULL valuation values to 0 (if any exist)
-- This is necessary before making the column NOT NULL
UPDATE term_sheets 
SET valuation = 0 
WHERE valuation IS NULL;

-- Step 3: Make valuation column NOT NULL
ALTER TABLE term_sheets 
MODIFY COLUMN valuation DECIMAL(15, 2) NOT NULL;

-- Verify the columns were added/modified correctly
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'term_sheets' 
AND COLUMN_NAME IN ('investmentAmount', 'equityAmount', 'valuation', 'equityPercentage')
ORDER BY ORDINAL_POSITION;

