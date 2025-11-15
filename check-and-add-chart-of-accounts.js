const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Required Chart of Accounts from the document
// Format: { accountNo, accountName, accountType, financialStatement, notes }
const requiredAccounts = [
  // 1100s: Current Assets (Cash & Cash Equivalents)
  { accountNo: '1100', accountType: 'Current Asset', accountName: 'Bank Account - ZIG', financialStatement: 'Balance Sheet', notes: 'Base Currency Account' },
  { accountNo: '1110', accountType: 'Current Asset', accountName: 'Bank Account - USD', financialStatement: 'Balance Sheet', notes: 'Foreign Currency Account' },
  { accountNo: '1120', accountType: 'Current Asset', accountName: 'Short-Term Deposits / T-Bills', financialStatement: 'Balance Sheet', notes: 'Cash held for liquidity management (< 90 days)' },
  { accountNo: '1200', accountType: 'Current Asset', accountName: 'Petty Cash / Cash Float', financialStatement: 'Balance Sheet', notes: 'Physical cash on hand' },
  
  // 1300s: Accounts Receivable & Debtors
  { accountNo: '1300', accountType: 'Current Asset', accountName: 'Accounts Receivable (Debtors Control)', financialStatement: 'Balance Sheet', notes: 'Aggregated balance for the Debtors Sub-Ledger' },
  { accountNo: '1350', accountType: 'Contra-Asset', accountName: 'Allowance for Doubtful Debts', financialStatement: 'Balance Sheet', notes: 'Bad debt estimation/provision' },
  { accountNo: '1400', accountType: 'Current Asset', accountName: 'Prepaid Expenses - Rent', financialStatement: 'Balance Sheet', notes: 'Rent paid in advance' },
  
  // 1500s: Non-Current Assets
  { accountNo: '1500', accountType: 'Long-Term Asset', accountName: 'Investment in Portfolio Companies', financialStatement: 'Balance Sheet', notes: 'The core asset of the VC firm. Initial cost/Fair Value' },
  { accountNo: '1520', accountType: 'Fixed Asset', accountName: 'Office Equipment & Furniture (Cost)', financialStatement: 'Balance Sheet', notes: 'Original cost of physical assets' },
  { accountNo: '1550', accountType: 'Contra-Asset', accountName: 'Accumulated Depreciation', financialStatement: 'Balance Sheet', notes: 'Depreciation accumulated over time' },
  
  // 2000s: Current Liabilities
  { accountNo: '2000', accountType: 'Current Liability', accountName: 'Accounts Payable (Creditors Control)', financialStatement: 'Balance Sheet', notes: 'P2P integration point' },
  { accountNo: '2050', accountType: 'Current Liability', accountName: 'VAT/Sales Tax Payable', financialStatement: 'Balance Sheet', notes: 'Tax collected on behalf of ZIMRA/Fiscus' },
  { accountNo: '2110', accountType: 'Current Liability', accountName: 'Unearned Revenue / Deferred Income', financialStatement: 'Balance Sheet', notes: 'Cash received for services not yet rendered' },
  
  // 2150s: Statutory Liabilities
  { accountNo: '2150', accountType: 'Current Liability', accountName: 'PAYE Payable', financialStatement: 'Balance Sheet', notes: 'Income Tax deducted' },
  { accountNo: '2160', accountType: 'Current Liability', accountName: 'NSSA/Pension Payable', financialStatement: 'Balance Sheet', notes: 'Social security/pension contributions' },
  { accountNo: '2200', accountType: 'Current Liability', accountName: 'Net Wages Payable (Clearing)', financialStatement: 'Balance Sheet', notes: 'Temporary clearing account for net pay' },
  
  // 3000s: Equity
  { accountNo: '3000', accountType: 'Equity', accountName: "Owner's/Shareholder's Capital", financialStatement: 'Balance Sheet', notes: 'Initial and subsequent capital investments' },
  { accountNo: '3100', accountType: 'Equity', accountName: 'Retained Earnings (Prior Year Profit)', financialStatement: 'Balance Sheet', notes: 'Profits carried forward' },
  { accountNo: '3200', accountType: 'Equity', accountName: 'Drawings / Dividends Paid', financialStatement: 'Balance Sheet', notes: 'Distribution of profits' },
  
  // 4000s: Revenue
  { accountNo: '4001', accountType: 'Revenue', accountName: 'Management Fees Income', financialStatement: 'Income Statement', notes: 'Regular fee income from fund management' },
  { accountNo: '4002', accountType: 'Revenue', accountName: 'Performance Fees (Carried Interest)', financialStatement: 'Income Statement', notes: 'Contingent fee based on fund performance' },
  { accountNo: '4050', accountType: 'Revenue', accountName: 'Interest Income - Bank Deposits', financialStatement: 'Income Statement', notes: 'Interest earned on cash' },
  
  // 5000s: Expenses
  { accountNo: '5010', accountType: 'Expense', accountName: 'Gross Salaries & Wages Expense', financialStatement: 'Income Statement', notes: 'Full cost of employee compensation' },
  { accountNo: '5020', accountType: 'Expense', accountName: 'Employer Payroll Contributions Expense', financialStatement: 'Income Statement', notes: "Employer's statutory contribution" },
  { accountNo: '5100', accountType: 'Expense', accountName: 'Office Rental Expense', financialStatement: 'Income Statement', notes: 'Periodic cost for physical office space' },
  { accountNo: '5130', accountType: 'Expense', accountName: 'Depreciation Expense', financialStatement: 'Income Statement', notes: 'Non-cash expense' },
  { accountNo: '5160', accountType: 'Expense', accountName: 'Professional Fees (Audit/Legal)', financialStatement: 'Income Statement', notes: 'Fees paid to professionals' },
  
  // 6000s: Other Income & Expense
  { accountNo: '6000', accountType: 'Income', accountName: 'Gain on Disposal of Fixed Asset', financialStatement: 'Income Statement', notes: 'Gain when asset is sold above NBV' },
  { accountNo: '6050', accountType: 'Expense', accountName: 'Loss on Disposal of Fixed Asset', financialStatement: 'Income Statement', notes: 'Loss when asset is sold below NBV' },
  { accountNo: '6100', accountType: 'Income', accountName: 'Unrealized Gain on Investment Revaluation', financialStatement: 'Income Statement', notes: 'Non-cash gain from marking investments to market value' },
  { accountNo: '6150', accountType: 'Expense', accountName: 'Unrealized Loss on Investment Revaluation', financialStatement: 'Income Statement', notes: 'Non-cash loss from marking investments to market value' },
  { accountNo: '6200', accountType: 'Expense', accountName: 'Bad Debt Expense (Write-off)', financialStatement: 'Income Statement', notes: 'Actual write-off expense' },
];

async function checkAndAddChartOfAccounts() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 CHECKING AND ADDING CHART OF ACCOUNTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Get all existing accounts
    const existingAccounts = await prisma.chartOfAccounts.findMany({
      select: {
        id: true,
        accountNo: true,
        accountName: true,
        accountType: true,
        financialStatement: true
      }
    });

    console.log(`Found ${existingAccounts.length} existing account(s) in the system\n`);

    // Create a map of existing accounts by code
    const existingByCode = new Map();
    existingAccounts.forEach(acc => {
      existingByCode.set(acc.accountNo, acc);
    });

    // Check which accounts are missing
    const missingAccounts = [];
    const existingAccountsList = [];

    for (const required of requiredAccounts) {
      if (existingByCode.has(required.accountNo)) {
        const existing = existingByCode.get(required.accountNo);
        existingAccountsList.push({
          accountNo: required.accountNo,
          name: required.accountName,
          existingName: existing.accountName,
          existingType: existing.accountType
        });
      } else {
        missingAccounts.push(required);
      }
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 EXISTING ACCOUNTS');
    console.log('═══════════════════════════════════════════════════════════\n');

      if (existingAccountsList.length > 0) {
        existingAccountsList.forEach(acc => {
          console.log(`✅ ${acc.accountNo} - ${acc.existingName} (${acc.existingType})`);
        });
      } else {
        console.log('No existing accounts found matching required codes.');
      }

    console.log(`\n📊 Summary: ${existingAccountsList.length} account(s) already exist\n`);

    // Add missing accounts
    if (missingAccounts.length > 0) {
      console.log('═══════════════════════════════════════════════════════════');
      console.log('➕ ADDING MISSING ACCOUNTS');
      console.log('═══════════════════════════════════════════════════════════\n');

      let addedCount = 0;

      for (const account of missingAccounts) {
        try {
          await prisma.chartOfAccounts.create({
            data: {
              accountNo: account.accountNo,
              accountName: account.accountName,
              accountType: account.accountType,
              financialStatement: account.financialStatement,
              notes: account.notes || '',
              isActive: true
            }
          });

          console.log(`✅ Added: ${account.accountNo} - ${account.accountName} (${account.accountType})`);
          addedCount++;
        } catch (error) {
          console.error(`❌ Error adding ${account.accountNo} - ${account.accountName}: ${error.message}`);
        }
      }

      console.log(`\n📊 Summary: Added ${addedCount} new account(s)\n`);
    } else {
      console.log('✅ All required accounts already exist! No accounts to add.\n');
    }

    // Final summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 FINAL SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`Total required accounts: ${requiredAccounts.length}`);
    console.log(`Existing accounts: ${existingAccountsList.length}`);
    console.log(`Newly added accounts: ${missingAccounts.length > 0 ? missingAccounts.length : 0}`);
    console.log(`Total accounts now: ${existingAccountsList.length + (missingAccounts.length > 0 ? missingAccounts.length : 0)}`);

    if (existingAccountsList.length + (missingAccounts.length > 0 ? missingAccounts.length : 0) === requiredAccounts.length) {
      console.log('\n✅ All required chart of accounts are now in place!');
    } else {
      console.log('\n⚠️  Some accounts may need manual review.');
    }

  } catch (error) {
    console.error('❌ Fatal error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

checkAndAddChartOfAccounts()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

