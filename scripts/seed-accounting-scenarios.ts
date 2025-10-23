// @ts-nocheck
/**
 * Seed Accounting Scenarios
 * 
 * This script creates comprehensive accounting scenarios to test
 * various business transactions and demonstrate proper journal entries.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedAccountingScenarios() {
  console.log('💼 Seeding Accounting Scenarios...');
  console.log('=' .repeat(60));

  try {
    // Check if we should clear existing entries
    const existingEntries = await prisma.journalEntry.findMany({
      take: 1
    });

    if (existingEntries.length > 0) {
      console.log('⚠️ Journal entries already exist.');
      console.log('💡 To create fresh scenarios, delete existing entries first.');
      return;
    }

    // Get required data
    const accounts = await prisma.chartOfAccounts.findMany({
      select: { id: true, accountNo: true, accountName: true, accountType: true }
    });

    const adminUser = await prisma.user.findFirst({
      where: { email: 'admin@nvccz.co.zw' }
    });

    if (!adminUser) {
      console.log('❌ Admin user not found. Please run main seeder first.');
      return;
    }

    const accountMap = new Map(accounts.map(acc => [acc.accountNo, acc.id]));

    console.log(`📊 Found ${accounts.length} chart of accounts`);
    console.log(`👤 Using admin user: ${adminUser.email}`);

    // Scenario 1: Company Startup
    console.log('\n🚀 Scenario 1: Company Startup');
    await createStartupScenario(adminUser.id, accountMap);

    // Scenario 2: Monthly Operations
    console.log('\n📅 Scenario 2: Monthly Operations');
    await createMonthlyOperationsScenario(adminUser.id, accountMap);

    // Scenario 3: Revenue Generation
    console.log('\n💰 Scenario 3: Revenue Generation');
    await createRevenueScenario(adminUser.id, accountMap);

    // Scenario 4: Asset Purchases
    console.log('\n🏢 Scenario 4: Asset Purchases');
    await createAssetPurchaseScenario(adminUser.id, accountMap);

    // Scenario 5: VAT Transactions
    console.log('\n🧾 Scenario 5: VAT Transactions');
    await createVATScenario(adminUser.id, accountMap);

    // Scenario 6: Year-End Adjustments
    console.log('\n📊 Scenario 6: Year-End Adjustments');
    await createYearEndScenario(adminUser.id, accountMap);

    // Display final balances
    await displayFinalBalances();

    console.log('\n🎉 Accounting scenarios seeded successfully!');
    console.log('\n📈 Scenarios Created:');
    console.log('1. Company Startup - Initial capital and setup');
    console.log('2. Monthly Operations - Regular business operations');
    console.log('3. Revenue Generation - Income and sales transactions');
    console.log('4. Asset Purchases - Equipment and fixed assets');
    console.log('5. VAT Transactions - Tax-compliant transactions');
    console.log('6. Year-End Adjustments - Closing and adjustments');

  } catch (error) {
    console.error('❌ Error seeding accounting scenarios:', error);
    throw error;
  }
}

async function createStartupScenario(createdById: string, accountMap: Map<string, string>) {
  // 1. Initial Capital Investment
  await createJournalEntry(
    'Initial Capital Investment',
    'Shareholders invest initial capital of $200,000',
    [
      { accountNo: '1000', debit: 200000, credit: 0 },   // Cash
      { accountNo: '3000', debit: 0, credit: 200000 }   // Share Capital
    ],
    createdById,
    accountMap
  );

  // 2. Bank Loan
  await createJournalEntry(
    'Business Loan',
    'Bank loan of $100,000 for business operations',
    [
      { accountNo: '1000', debit: 100000, credit: 0 },   // Cash
      { accountNo: '2200', debit: 0, credit: 100000 }   // Notes Payable
    ],
    createdById,
    accountMap
  );

  // 3. Office Setup
  await createJournalEntry(
    'Office Setup Costs',
    'Initial office setup and equipment',
    [
      { accountNo: '1100', debit: 25000, credit: 0 },    // Office Equipment
      { accountNo: '1000', debit: 0, credit: 25000 }     // Cash
    ],
    createdById,
    accountMap
  );
}

async function createMonthlyOperationsScenario(createdById: string, accountMap: Map<string, string>) {
  // 1. Rent Payment
  await createJournalEntry(
    'Monthly Rent',
    'Office rent for the month',
    [
      { accountNo: '5000', debit: 8000, credit: 0 },     // Rent Expense
      { accountNo: '1000', debit: 0, credit: 8000 }      // Cash
    ],
    createdById,
    accountMap
  );

  // 2. Salary Payment
  await createJournalEntry(
    'Monthly Salaries',
    'Employee salaries and wages',
    [
      { accountNo: '5030', debit: 45000, credit: 0 },    // Salaries and Wages
      { accountNo: '1000', debit: 0, credit: 45000 }     // Cash
    ],
    createdById,
    accountMap
  );

  // 3. Utilities
  await createJournalEntry(
    'Utility Bills',
    'Electricity, water, internet',
    [
      { accountNo: '5040', debit: 3500, credit: 0 },     // Utilities Expense
      { accountNo: '1000', debit: 0, credit: 3500 }      // Cash
    ],
    createdById,
    accountMap
  );

  // 4. Office Supplies
  await createJournalEntry(
    'Office Supplies',
    'Monthly office supplies purchase',
    [
      { accountNo: '5010', debit: 2000, credit: 0 },     // Office Supplies Expense
      { accountNo: '1000', debit: 0, credit: 2000 }       // Cash
    ],
    createdById,
    accountMap
  );
}

async function createRevenueScenario(createdById: string, accountMap: Map<string, string>) {
  // 1. Cash Sales
  await createJournalEntry(
    'Cash Sales Revenue',
    'Consulting services paid in cash',
    [
      { accountNo: '1000', debit: 75000, credit: 0 },     // Cash
      { accountNo: '4000', debit: 0, credit: 75000 }     // Management Fees Income
    ],
    createdById,
    accountMap
  );

  // 2. Credit Sales
  await createJournalEntry(
    'Credit Sales Revenue',
    'Services provided on credit terms',
    [
      { accountNo: '1200', debit: 50000, credit: 0 },    // Accounts Receivable
      { accountNo: '4000', debit: 0, credit: 50000 }     // Management Fees Income
    ],
    createdById,
    accountMap
  );

  // 3. Interest Income
  await createJournalEntry(
    'Bank Interest',
    'Interest earned on bank deposits',
    [
      { accountNo: '1000', debit: 1500, credit: 0 },     // Cash
      { accountNo: '4010', debit: 0, credit: 1500 }      // Investment Gains
    ],
    createdById,
    accountMap
  );

  // 4. Collection of Receivables
  await createJournalEntry(
    'Receivables Collection',
    'Collection of outstanding receivables',
    [
      { accountNo: '1000', debit: 30000, credit: 0 },     // Cash
      { accountNo: '1200', debit: 0, credit: 30000 }     // Accounts Receivable
    ],
    createdById,
    accountMap
  );
}

async function createAssetPurchaseScenario(createdById: string, accountMap: Map<string, string>) {
  // 1. Computer Equipment
  await createJournalEntry(
    'Computer Equipment Purchase',
    'Purchase of computers and IT equipment',
    [
      { accountNo: '1100', debit: 15000, credit: 0 },    // Office Equipment
      { accountNo: '1000', debit: 0, credit: 15000 }     // Cash
    ],
    createdById,
    accountMap
  );

  // 2. Furniture Purchase
  await createJournalEntry(
    'Office Furniture',
    'Purchase of office furniture and fixtures',
    [
      { accountNo: '1100', debit: 12000, credit: 0 },    // Office Equipment
      { accountNo: '1000', debit: 0, credit: 12000 }     // Cash
    ],
    createdById,
    accountMap
  );

  // 3. Vehicle Purchase
  await createJournalEntry(
    'Company Vehicle',
    'Purchase of company vehicle',
    [
      { accountNo: '1100', debit: 35000, credit: 0 },    // Office Equipment
      { accountNo: '1000', debit: 0, credit: 35000 }     // Cash
    ],
    createdById,
    accountMap
  );

  // 4. Depreciation
  await createJournalEntry(
    'Monthly Depreciation',
    'Monthly depreciation of fixed assets',
    [
      { accountNo: '1300', debit: 2000, credit: 0 },      // Accumulated Depreciation
      { accountNo: '1100', debit: 0, credit: 2000 }      // Office Equipment
    ],
    createdById,
    accountMap
  );
}

async function createVATScenario(createdById: string, accountMap: Map<string, string>) {
  // 1. Purchase with VAT
  await createJournalEntry(
    'Purchase with VAT',
    'Office supplies with 14.5% VAT',
    [
      { accountNo: '5010', debit: 2000, credit: 0 },     // Office Supplies Expense
      { accountNo: '1101', debit: 290, credit: 0 },      // VAT Input
      { accountNo: '1000', debit: 0, credit: 2290 }      // Cash
    ],
    createdById,
    accountMap
  );

  // 2. Sale with VAT
  await createJournalEntry(
    'Sale with VAT',
    'Service revenue with 14.5% VAT',
    [
      { accountNo: '1000', debit: 11450, credit: 0 },    // Cash
      { accountNo: '4000', debit: 0, credit: 10000 },   // Management Fees Income
      { accountNo: '2001', debit: 0, credit: 1450 }     // VAT Output
    ],
    createdById,
    accountMap
  );

  // 3. VAT Payment to Government
  await createJournalEntry(
    'VAT Payment',
    'VAT payment to tax authority',
    [
      { accountNo: '2001', debit: 1450, credit: 0 },     // VAT Output
      { accountNo: '1000', debit: 0, credit: 1450 }      // Cash
    ],
    createdById,
    accountMap
  );
}

async function createYearEndScenario(createdById: string, accountMap: Map<string, string>) {
  // 1. Accrued Expenses
  await createJournalEntry(
    'Accrued Salaries',
    'Year-end accrued salary expense',
    [
      { accountNo: '5030', debit: 5000, credit: 0 },     // Salaries and Wages
      { accountNo: '2010', debit: 0, credit: 5000 }     // Accrued Expenses
    ],
    createdById,
    accountMap
  );

  // 2. Prepaid Expenses
  await createJournalEntry(
    'Prepaid Insurance',
    'Prepaid insurance for next year',
    [
      { accountNo: '1020', debit: 6000, credit: 0 },     // Prepaid Expenses
      { accountNo: '1000', debit: 0, credit: 6000 }      // Cash
    ],
    createdById,
    accountMap
  );

  // 3. Bad Debt Provision
  await createJournalEntry(
    'Bad Debt Provision',
    'Provision for doubtful debts',
    [
      { accountNo: '5090', debit: 2000, credit: 0 },     // Other Operating Expenses
      { accountNo: '1200', debit: 0, credit: 2000 }      // Accounts Receivable
    ],
    createdById,
    accountMap
  );

  // 4. Year-End Closing
  await createJournalEntry(
    'Year-End Closing',
    'Transfer to retained earnings',
    [
      { accountNo: '3200', debit: 50000, credit: 0 },   // Current Year Earnings (debit to close)
      { accountNo: '3100', debit: 0, credit: 50000 }    // Retained Earnings (credit to increase)
    ],
    createdById,
    accountMap
  );
}

async function createJournalEntry(
  title: string,
  description: string,
  lines: Array<{ accountNo: string; debit: number; credit: number }>,
  createdById: string,
  accountMap: Map<string, string>
) {
  const totalDebits = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredits = lines.reduce((sum, line) => sum + line.credit, 0);

  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error(`Journal entry "${title}" is not balanced. Debits: ${totalDebits}, Credits: ${totalCredits}`);
  }

  // Get default currency
  const defaultCurrency = await prisma.currency.findFirst({
    where: { code: 'USD' }
  });

  if (!defaultCurrency) {
    throw new Error('Default currency (USD) not found');
  }

  const journalEntry = await prisma.journalEntry.create({
    data: {
      transactionDate: new Date(),
      referenceNumber: `JE-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      description: `${title} - ${description}`,
      totalAmount: totalDebits,
      currencyId: defaultCurrency.id,
      createdById,
      status: 'POSTED'
    }
  });

  for (const line of lines) {
    const accountId = accountMap.get(line.accountNo);
    if (!accountId) {
      throw new Error(`Account ${line.accountNo} not found`);
    }

    await prisma.journalEntryLine.create({
      data: {
        journalEntryId: journalEntry.id,
        chartOfAccountId: accountId,
        debitAmount: line.debit,
        creditAmount: line.credit,
        description: `${title} - ${line.accountNo}`
      }
    });
  }

  console.log(`   ✅ ${title} (${totalDebits.toFixed(2)})`);
}

async function displayFinalBalances() {
  console.log('\n💰 Final Account Balances:');
  console.log('=' .repeat(50));

  const accountBalances = await prisma.journalEntryLine.groupBy({
    by: ['chartOfAccountId'],
    _sum: {
      debitAmount: true,
      creditAmount: true
    }
  });

  const accounts = await prisma.chartOfAccounts.findMany({
    where: {
      id: {
        in: accountBalances.map(b => b.chartOfAccountId)
      }
    },
    orderBy: { accountNo: 'asc' }
  });

  const accountMap = new Map(accounts.map(acc => [acc.id, acc]));

  // Group by account type
  const balancesByType: Record<string, Array<{account: any, balance: number}>> = {};

  for (const balance of accountBalances) {
    const account = accountMap.get(balance.accountId);
    if (!account) continue;

    const totalDebits = balance._sum.debitAmount || 0;
    const totalCredits = balance._sum.creditAmount || 0;
    const netBalance = totalDebits - totalCredits;

    if (!balancesByType[account.accountType]) {
      balancesByType[account.accountType] = [];
    }

    balancesByType[account.accountType].push({
      account,
      balance: netBalance
    });
  }

  // Display by account type
  for (const [accountType, balances] of Object.entries(balancesByType)) {
    console.log(`\n📊 ${accountType}:`);
    balances.forEach(({ account, balance }) => {
      const sign = balance >= 0 ? '+' : '';
      console.log(`   ${account.accountNo} - ${account.accountName}: ${sign}${balance.toFixed(2)}`);
    });
  }

  // Calculate totals
  const totalAssets = balancesByType['Current Asset']?.reduce((sum, b) => sum + b.balance, 0) || 0;
  const totalLiabilities = balancesByType['Current Liability']?.reduce((sum, b) => sum + b.balance, 0) || 0;
  const totalEquity = balancesByType['Equity']?.reduce((sum, b) => sum + b.balance, 0) || 0;
  const totalRevenue = balancesByType['Revenue']?.reduce((sum, b) => sum + b.balance, 0) || 0;
  const totalExpenses = balancesByType['Expense']?.reduce((sum, b) => sum + b.balance, 0) || 0;

  console.log('\n📈 Financial Summary:');
  console.log(`   Total Assets: ${totalAssets.toFixed(2)}`);
  console.log(`   Total Liabilities: ${totalLiabilities.toFixed(2)}`);
  console.log(`   Total Equity: ${totalEquity.toFixed(2)}`);
  console.log(`   Total Revenue: ${totalRevenue.toFixed(2)}`);
  console.log(`   Total Expenses: ${totalExpenses.toFixed(2)}`);
  console.log(`   Net Income: ${(totalRevenue - totalExpenses).toFixed(2)}`);
}

async function main() {
  try {
    await seedAccountingScenarios();
  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
