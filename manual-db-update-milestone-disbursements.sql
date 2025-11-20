-- Manual database update for milestone-based disbursement tracking
-- Run this SQL script directly on your database (DO NOT use migrations)

-- Add disbursement mode and total committed amount fields
ALTER TABLE investment_implementations 
ADD COLUMN disbursementMode VARCHAR(50) DEFAULT 'ONE_TIME',
ADD COLUMN totalCommittedAmount DECIMAL(15, 2) NULL;

-- Verify the columns were added
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'investment_implementations' 
AND (COLUMN_NAME = 'disbursementMode' OR COLUMN_NAME = 'totalCommittedAmount');

