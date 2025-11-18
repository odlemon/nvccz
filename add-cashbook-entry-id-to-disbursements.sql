-- Add cashbook_entry_id column to fund_disbursements table
-- This links fund disbursements to their cashbook entries

-- Check if column already exists, if not add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'fund_disbursements' 
        AND column_name = 'cashbook_entry_id'
    ) THEN
        ALTER TABLE fund_disbursements 
        ADD COLUMN cashbook_entry_id VARCHAR(255) UNIQUE;
        
        -- Add foreign key constraint
        ALTER TABLE fund_disbursements
        ADD CONSTRAINT fund_disbursements_cashbook_entry_id_fkey 
        FOREIGN KEY (cashbook_entry_id) 
        REFERENCES cashbook_entries(id) 
        ON DELETE SET NULL;
        
        RAISE NOTICE 'Column cashbook_entry_id added successfully';
    ELSE
        RAISE NOTICE 'Column cashbook_entry_id already exists';
    END IF;
END $$;

