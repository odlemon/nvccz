// @ts-nocheck
// Seed script for required Chart of Accounts for Sage Pastel Cashbook
// Run this after implementing the cashbook schema

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function seedCashbookChartOfAccounts() {
  console.log('🌱 Seeding Chart of Accounts for Cashbook...');

  // 1. Bank Control Accounts (Asset - 1000s)
  const bankAccounts = [
    { accountNo: '1000', accountName: 'Cash and Cash Equivalents', accountType: 'Current Asset', financialStatement: 'Balance Sheet' },
    { accountNo: '1010', accountName: 'Main Bank Account - USD', accountType: 'Current Asset', financialStatement: 'Balance Sheet' },
    { accountNo: '1020', accountName: 'Savings Account - USD', accountType: 'Current Asset', financialStatement: 'Balance Sheet' },
    { accountNo: '1030', accountName: 'Petty Cash', accountType: 'Current Asset', financialStatement: 'Balance Sheet' },
    { accountNo: '1040', accountName: 'Bank Account - ZAR', accountType: 'Current Asset', financialStatement: 'Balance Sheet' },
  ];

  // 2. Accounts Receivable Control (Asset - 1200s)
  const receivableAccounts = [
    { accountNo: '1200', accountName: 'Accounts Receivable Control', accountType: 'Current Asset', financialStatement: 'Balance Sheet' },
    { accountNo: '1210', accountName: 'Trade Debtors', accountType: 'Current Asset', financialStatement: 'Balance Sheet' },
  ];

  // 3. Accounts Payable Control (Liability - 2100s)
  const payableAccounts = [
    { accountNo: '2100', accountName: 'Accounts Payable Control', accountType: 'Current Liability', financialStatement: 'Balance Sheet' },
    { accountNo: '2110', accountName: 'Trade Creditors', accountType: 'Current Liability', financialStatement: 'Balance Sheet' },
  ];

  // 4. Revenue Accounts (4000s)
  const revenueAccounts = [
    { accountNo: '4000', accountName: 'Sales Revenue', accountType: 'Revenue', financialStatement: 'Income Statement' },
    { accountNo: '4010', accountName: 'Interest Income', accountType: 'Revenue', financialStatement: 'Income Statement' },
    { accountNo: '4020', accountName: 'Management Fees Income', accountType: 'Revenue', financialStatement: 'Income Statement' },
    { accountNo: '4030', accountName: 'Investment Income', accountType: 'Revenue', financialStatement: 'Income Statement' },
    { accountNo: '4040', accountName: 'Other Income', accountType: 'Revenue', financialStatement: 'Income Statement' },
  ];

  // 5. Expense Accounts (5000s)
  const expenseAccounts = [
    { accountNo: '5000', accountName: 'Rent Expense', accountType: 'Expense', financialStatement: 'Income Statement' },
    { accountNo: '5010', accountName: 'Office Supplies Expense', accountType: 'Expense', financialStatement: 'Income Statement' },
    { accountNo: '5020', accountName: 'Bank Charges', accountType: 'Expense', financialStatement: 'Income Statement' },
    { accountNo: '5030', accountName: 'Salaries and Wages', accountType: 'Expense', financialStatement: 'Income Statement' },
    { accountNo: '5040', accountName: 'Utilities Expense', accountType: 'Expense', financialStatement: 'Income Statement' },
    { accountNo: '5050', accountName: 'Professional Fees', accountType: 'Expense', financialStatement: 'Income Statement' },
    { accountNo: '5060', accountName: 'Marketing Expense', accountType: 'Expense', financialStatement: 'Income Statement' },
    { accountNo: '5070', accountName: 'Travel Expense', accountType: 'Expense', financialStatement: 'Income Statement' },
    { accountNo: '5080', accountName: 'Insurance Expense', accountType: 'Expense', financialStatement: 'Income Statement' },
    { accountNo: '5090', accountName: 'Other Operating Expenses', accountType: 'Expense', financialStatement: 'Income Statement' },
  ];

  // 6. VAT Accounts (if not already present)
  const vatAccounts = [
    { accountNo: '2200', accountName: 'VAT Output', accountType: 'Current Liability', financialStatement: 'Balance Sheet' },
    { accountNo: '1300', accountName: 'VAT Input', accountType: 'Current Asset', financialStatement: 'Balance Sheet' },
  ];

  // Combine all accounts
  const allAccounts = [
    ...bankAccounts,
    ...receivableAccounts,
    ...payableAccounts,
    ...revenueAccounts,
    ...expenseAccounts,
    ...vatAccounts
  ];

  // Create accounts
  for (const account of allAccounts) {
    await prisma.chartOfAccounts.upsert({
      where: { accountNo: account.accountNo },
      update: account,
      create: {
        ...account,
        isActive: true
      }
    });
    console.log(`✅ Created/Updated account: ${account.accountNo} - ${account.accountName}`);
  }

  console.log('🎉 Chart of Accounts seeding completed!');
  console.log('\n📋 Summary:');
  console.log(`   • Bank Control Accounts: ${bankAccounts.length}`);
  console.log(`   • Receivable Accounts: ${receivableAccounts.length}`);
  console.log(`   • Payable Accounts: ${payableAccounts.length}`);
  console.log(`   • Revenue Accounts: ${revenueAccounts.length}`);
  console.log(`   • Expense Accounts: ${expenseAccounts.length}`);
  console.log(`   • VAT Accounts: ${vatAccounts.length}`);
  console.log(`   • Total: ${allAccounts.length} accounts`);
}

// Run the seeding
seedCashbookChartOfAccounts()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
