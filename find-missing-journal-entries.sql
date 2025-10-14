-- ============================================
-- SQL Script to Find Records with Missing Journal Entries
-- ============================================
-- Purpose: Identify entities that should have journal entries but don't
-- Created: October 13, 2025
-- ============================================

-- 1. CREDIT NOTES WITHOUT JOURNAL ENTRIES
-- ============================================
SELECT 
    'CreditNote' as entity_type,
    cn.id,
    cn.creditNoteNumber as reference,
    cn.totalAmount as amount,
    cn.status,
    cn.createdAt,
    c.name as customer_name,
    CASE 
        WHEN cn.journalEntryId IS NULL THEN 'No journal entry ID'
        WHEN je.id IS NULL THEN 'Journal entry does not exist'
        ELSE 'Unknown issue'
    END as issue
FROM "CreditNote" cn
LEFT JOIN "JournalEntry" je ON cn.journalEntryId = je.id
LEFT JOIN "Customer" c ON cn.customerId = c.id
WHERE cn.journalEntryId IS NULL 
   OR je.id IS NULL
ORDER BY cn.createdAt DESC;

-- 2. CREDIT NOTES WITH JOURNAL ENTRIES BUT NO LINES
-- ============================================
SELECT 
    'CreditNote-NoLines' as entity_type,
    cn.id,
    cn.creditNoteNumber as reference,
    cn.totalAmount as amount,
    je.id as journal_entry_id,
    je.referenceNumber as journal_reference,
    COUNT(jel.id) as line_count
FROM "CreditNote" cn
INNER JOIN "JournalEntry" je ON cn.journalEntryId = je.id
LEFT JOIN "JournalEntryLine" jel ON je.id = jel.journalEntryId
GROUP BY cn.id, cn.creditNoteNumber, cn.totalAmount, je.id, je.referenceNumber
HAVING COUNT(jel.id) = 0
ORDER BY cn.createdAt DESC;

-- 3. ASSETS WITHOUT ACQUISITION JOURNAL ENTRIES
-- ============================================
-- Note: Assets don't have a direct journalEntryId field, 
-- so we check if acquisition journal entry exists by reference number
SELECT 
    'Asset' as entity_type,
    a.id,
    a.assetCode as reference,
    a.assetName,
    a.cost as amount,
    a.status,
    a.purchaseDate,
    CASE 
        WHEN je.id IS NULL THEN 'No acquisition journal entry'
        ELSE 'Found'
    END as journal_status
FROM "Asset" a
LEFT JOIN "JournalEntry" je ON je.referenceNumber = CONCAT('ASSET-', a.assetCode)
WHERE a.status = 'ACTIVE'
  AND je.id IS NULL
ORDER BY a.purchaseDate DESC;

-- 4. INVOICES WITHOUT JOURNAL ENTRIES
-- ============================================
SELECT 
    'Invoice' as entity_type,
    i.id,
    i.invoiceNumber as reference,
    i.totalAmount as amount,
    i.status,
    i.transactionDate,
    c.name as customer_name,
    COUNT(je.id) as journal_entry_count
FROM "Invoice" i
LEFT JOIN "Customer" c ON i.customerId = c.id
LEFT JOIN "JournalEntry" je ON je.referenceNumber LIKE '%' || COALESCE(i.invoiceNumber, i.id) || '%'
WHERE i.status != 'DRAFT'
GROUP BY i.id, i.invoiceNumber, i.totalAmount, i.status, i.transactionDate, c.name
HAVING COUNT(je.id) = 0
ORDER BY i.transactionDate DESC;

-- 5. JOURNAL ENTRIES WITHOUT LINES (GENERAL CHECK)
-- ============================================
SELECT 
    'JournalEntry-NoLines' as entity_type,
    je.id,
    je.referenceNumber as reference,
    je.totalAmount as amount,
    je.status,
    je.transactionDate,
    je.description,
    COUNT(jel.id) as line_count
FROM "JournalEntry" je
LEFT JOIN "JournalEntryLine" jel ON je.id = jel.journalEntryId
GROUP BY je.id, je.referenceNumber, je.totalAmount, je.status, je.transactionDate, je.description
HAVING COUNT(jel.id) = 0
ORDER BY je.transactionDate DESC;

-- 6. JOURNAL ENTRIES WITH UNBALANCED LINES
-- ============================================
SELECT 
    'JournalEntry-Unbalanced' as entity_type,
    je.id,
    je.referenceNumber as reference,
    je.totalAmount as amount,
    je.status,
    je.transactionDate,
    SUM(jel.debitAmount) as total_debits,
    SUM(jel.creditAmount) as total_credits,
    (SUM(jel.debitAmount) - SUM(jel.creditAmount)) as difference
FROM "JournalEntry" je
INNER JOIN "JournalEntryLine" jel ON je.id = jel.journalEntryId
GROUP BY je.id, je.referenceNumber, je.totalAmount, je.status, je.transactionDate
HAVING ABS(SUM(jel.debitAmount) - SUM(jel.creditAmount)) > 0.01
ORDER BY je.transactionDate DESC;

-- 7. MEANINGLESS AR-TO-AR CREDIT NOTE APPLICATION ENTRIES
-- ============================================
SELECT 
    'CreditNoteApp-ArToAr' as entity_type,
    je.id,
    je.referenceNumber as reference,
    je.totalAmount as amount,
    je.status,
    je.transactionDate,
    je.description,
    COUNT(DISTINCT jel.chartOfAccountId) as unique_accounts,
    STRING_AGG(DISTINCT coa.accountName, ', ') as accounts_used
FROM "JournalEntry" je
INNER JOIN "JournalEntryLine" jel ON je.id = jel.journalEntryId
INNER JOIN "ChartOfAccounts" coa ON jel.chartOfAccountId = coa.id
WHERE je.referenceNumber LIKE 'CN-APPLY%'
GROUP BY je.id, je.referenceNumber, je.totalAmount, je.status, je.transactionDate, je.description
HAVING COUNT(DISTINCT jel.chartOfAccountId) = 1  -- Only one unique account used (meaningless!)
ORDER BY je.transactionDate DESC;

-- 8. SUMMARY COUNT BY ISSUE TYPE
-- ============================================
SELECT 
    'SUMMARY' as report_type,
    (SELECT COUNT(*) FROM "CreditNote" cn 
     LEFT JOIN "JournalEntry" je ON cn.journalEntryId = je.id
     WHERE cn.journalEntryId IS NULL OR je.id IS NULL) as credit_notes_no_je,
    
    (SELECT COUNT(*) FROM "CreditNote" cn
     INNER JOIN "JournalEntry" je ON cn.journalEntryId = je.id
     LEFT JOIN "JournalEntryLine" jel ON je.id = jel.journalEntryId
     GROUP BY cn.id HAVING COUNT(jel.id) = 0) as credit_notes_no_lines,
    
    (SELECT COUNT(*) FROM "JournalEntry" je
     LEFT JOIN "JournalEntryLine" jel ON je.id = jel.journalEntryId
     GROUP BY je.id HAVING COUNT(jel.id) = 0) as journal_entries_no_lines,
    
    (SELECT COUNT(*) FROM "JournalEntry" je
     INNER JOIN "JournalEntryLine" jel ON je.id = jel.journalEntryId
     GROUP BY je.id 
     HAVING ABS(SUM(jel.debitAmount) - SUM(jel.creditAmount)) > 0.01) as unbalanced_entries,
    
    (SELECT COUNT(DISTINCT je.id) FROM "JournalEntry" je
     INNER JOIN "JournalEntryLine" jel ON je.id = jel.journalEntryId
     WHERE je.referenceNumber LIKE 'CN-APPLY%'
     GROUP BY je.id
     HAVING COUNT(DISTINCT jel.chartOfAccountId) = 1) as ar_to_ar_entries;

-- ============================================
-- CLEANUP SCRIPTS (USE WITH CAUTION!)
-- ============================================

-- Option 1: DELETE credit notes without journal entries (if test data)
-- UNCOMMENT TO USE:
/*
DELETE FROM "CreditNote"
WHERE id IN (
    SELECT cn.id
    FROM "CreditNote" cn
    LEFT JOIN "JournalEntry" je ON cn.journalEntryId = je.id
    WHERE cn.journalEntryId IS NULL OR je.id IS NULL
);
*/

-- Option 2: SET credit notes to DRAFT status for manual review
-- UNCOMMENT TO USE:
/*
UPDATE "CreditNote"
SET status = 'DRAFT'
WHERE id IN (
    SELECT cn.id
    FROM "CreditNote" cn
    LEFT JOIN "JournalEntry" je ON cn.journalEntryId = je.id
    WHERE cn.journalEntryId IS NULL OR je.id IS NULL
);
*/

-- Option 3: VOID meaningless AR-to-AR credit note application entries
-- UNCOMMENT TO USE:
/*
UPDATE "JournalEntry"
SET status = 'VOID'
WHERE referenceNumber LIKE 'CN-APPLY%'
  AND id IN (
    SELECT je.id
    FROM "JournalEntry" je
    INNER JOIN "JournalEntryLine" jel ON je.id = jel.journalEntryId
    GROUP BY je.id
    HAVING COUNT(DISTINCT jel.chartOfAccountId) = 1
  );
*/

-- Option 4: DELETE meaningless AR-to-AR entries completely (if test data)
-- UNCOMMENT TO USE:
/*
-- Step 1: Delete journal entry lines
DELETE FROM "JournalEntryLine"
WHERE journalEntryId IN (
    SELECT je.id
    FROM "JournalEntry" je
    INNER JOIN "JournalEntryLine" jel ON je.id = jel.journalEntryId
    WHERE je.referenceNumber LIKE 'CN-APPLY%'
    GROUP BY je.id
    HAVING COUNT(DISTINCT jel.chartOfAccountId) = 1
);

-- Step 2: Delete the journal entries
DELETE FROM "JournalEntry"
WHERE referenceNumber LIKE 'CN-APPLY%'
  AND id NOT IN (
    SELECT DISTINCT journalEntryId 
    FROM "JournalEntryLine"
    WHERE journalEntryId IS NOT NULL
  );
*/

-- ============================================
-- USAGE INSTRUCTIONS
-- ============================================
-- 1. Run queries 1-6 individually to identify issues
-- 2. Run query 7 to get summary counts
-- 3. Export results for documentation
-- 4. Review with team before running cleanup scripts
-- 5. Backup database before any DELETE operations
-- ============================================

