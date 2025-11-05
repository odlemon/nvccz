-- Verification script - Run this BEFORE and AFTER the ALTER TABLE command
-- to confirm the column type change

SELECT 
  COLUMN_NAME,
  DATA_TYPE,
  CHARACTER_MAXIMUM_LENGTH,
  IS_NULLABLE,
  COLUMN_TYPE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'application_documents'
  AND COLUMN_NAME = 'fileUrl';

-- Expected BEFORE: DATA_TYPE = 'varchar', CHARACTER_MAXIMUM_LENGTH = 191 (or similar)
-- Expected AFTER: DATA_TYPE = 'text', CHARACTER_MAXIMUM_LENGTH = NULL

