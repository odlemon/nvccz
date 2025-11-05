-- ROLLBACK script (in case you need to revert)
-- WARNING: This will convert TEXT back to VARCHAR(500)
-- Only use if absolutely necessary

-- Note: If you have URLs longer than 500 characters, this will truncate them!
-- Check max length first:
-- SELECT MAX(CHAR_LENGTH(fileUrl)) as max_url_length FROM application_documents;

-- Only proceed if max_url_length < 500
-- ALTER TABLE `application_documents` 
-- MODIFY COLUMN `fileUrl` VARCHAR(500) NOT NULL;

