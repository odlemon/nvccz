-- Add investment-related chart of accounts entries if they do not exist
-- Run manually (do not use prisma migrate)

INSERT INTO chart_of_accounts (id, accountNo, accountName, accountType, financialStatement, notes, createdAt, updatedAt)
SELECT UUID(), '1502', 'Investment Asset', 'Long-Term Asset', 'Balance Sheet', 'Fair value of portfolio investments', NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE accountNo = '1502');

INSERT INTO chart_of_accounts (id, accountNo, accountName, accountType, financialStatement, notes, createdAt, updatedAt)
SELECT UUID(), '4050', 'Unrealized Gain on Investment', 'Revenue', 'Income Statement', 'Fair value increase for portfolio investments', NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE accountNo = '4050');

INSERT INTO chart_of_accounts (id, accountNo, accountName, accountType, financialStatement, notes, createdAt, updatedAt)
SELECT UUID(), '6050', 'Unrealized Loss on Investment', 'Expense', 'Income Statement', 'Fair value decrease for portfolio investments', NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE accountNo = '6050');

INSERT INTO chart_of_accounts (id, accountNo, accountName, accountType, financialStatement, notes, createdAt, updatedAt)
SELECT UUID(), '4100', 'Dividend Income', 'Revenue', 'Income Statement', 'Cash dividends received from portfolio companies', NOW(3), NOW(3)
WHERE NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE accountNo = '4100');
