-- Safe script to modify application_documents.fileUrl column from VARCHAR to TEXT
-- This allows storing longer Firebase URLs without migration drift issues

-- Step 1: Verify current column structure (run this first to check)
-- SELECT 
--   COLUMN_NAME,
--   DATA_TYPE,
--   CHARACTER_MAXIMUM_LENGTH,
--   IS_NULLABLE
-- FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND TABLE_NAME = 'application_documents'
--   AND COLUMN_NAME = 'fileUrl';

-- Step 2: Modify the column (safe operation - only changes data type, doesn't lose data)
ALTER TABLE `application_documents` 
MODIFY COLUMN `fileUrl` TEXT NOT NULL;

-- Step 3: Verify the change (run this after to confirm)
-- SELECT 
--   COLUMN_NAME,
--   DATA_TYPE,
--   CHARACTER_MAXIMUM_LENGTH,
--   IS_NULLABLE
-- FROM INFORMATION_SCHEMA.COLUMNS
-- WHERE TABLE_SCHEMA = DATABASE()
--   AND TABLE_NAME = 'application_documents'
--   AND COLUMN_NAME = 'fileUrl';

-- Note: This operation is safe because:
-- 1. TEXT can store up to 65,535 bytes (much more than VARCHAR(191))
-- 2. All existing data will be preserved
-- 3. No data loss occurs when converting VARCHAR to TEXT
-- 4. The NOT NULL constraint is maintained

