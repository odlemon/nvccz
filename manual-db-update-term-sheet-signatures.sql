-- Manual database update for Term Sheet signature fields
-- Run this SQL script directly on your database (DO NOT use migrations)

-- Add applicant signature fields
ALTER TABLE term_sheets 
ADD COLUMN applicantSignatureUrl TEXT NULL,
ADD COLUMN applicantSignatureFileName VARCHAR(255) NULL,
ADD COLUMN applicantSignedById VARCHAR(191) NULL,
ADD COLUMN applicantSignedAt DATETIME NULL;

-- Add investor signature fields
ALTER TABLE term_sheets 
ADD COLUMN investorSignatureUrl TEXT NULL,
ADD COLUMN investorSignatureFileName VARCHAR(255) NULL,
ADD COLUMN investorSignedById VARCHAR(191) NULL,
ADD COLUMN investorSignedAt DATETIME NULL;

-- Add foreign key constraints for signed by users
ALTER TABLE term_sheets 
ADD CONSTRAINT term_sheets_applicantSignedById_fkey 
FOREIGN KEY (applicantSignedById) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE term_sheets 
ADD CONSTRAINT term_sheets_investorSignedById_fkey 
FOREIGN KEY (investorSignedById) REFERENCES users(id) ON DELETE SET NULL;

-- Verify the columns were added
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME = 'term_sheets' 
AND COLUMN_NAME LIKE '%signature%' OR COLUMN_NAME LIKE '%Signed%';

