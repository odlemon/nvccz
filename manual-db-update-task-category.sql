-- Manual database update for Task category
-- Run this SQL directly on the database (do not run Prisma migrations)

ALTER TABLE tasks
ADD COLUMN category VARCHAR(255) NULL COMMENT 'Optional classification (e.g., Market Research, Financial Assessment, Legal Compliance, Management Review)';

-- Verify the new column exists
SELECT COLUMN_NAME, DATA_TYPE, COLUMN_DEFAULT, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'tasks'
AND COLUMN_NAME = 'category';

