-- Manual database update for Term Sheet: Remove equityAmount and make equityPercentage required
-- Run this SQL script directly on your database (DO NOT use migrations)
-- Usage: ts-node scripts/run-sql.ts scripts/sql/remove_equity_amount_make_equity_percentage_required.sql

-- Step 1: Update any existing NULL equityPercentage values
-- Calculate equityPercentage from existing equityAmount and valuation if needed
UPDATE term_sheets 
SET equityPercentage = CASE 
  WHEN valuation > 0 AND equityAmount > 0 THEN (equityAmount * 100.0 / valuation)
  WHEN investmentAmount > 0 AND valuation > 0 THEN (investmentAmount * 100.0 / valuation)
  ELSE 20.0  -- Default to 20% if we can't calculate
END
WHERE equityPercentage IS NULL;

-- Step 2: Make equityPercentage NOT NULL
ALTER TABLE term_sheets 
MODIFY COLUMN equityPercentage DECIMAL(5, 2) NOT NULL;

-- Step 3: Remove equityAmount column
ALTER TABLE term_sheets 
DROP COLUMN equityAmount;

-- Verify the columns were updated correctly
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'term_sheets' 
AND COLUMN_NAME IN ('investmentAmount', 'equityPercentage', 'valuation')
ORDER BY ORDINAL_POSITION;

