import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function analyzeChartOfAccounts() {
  try {
    console.log('📊 ANALYZING CHART OF ACCOUNTS FOR CASHBOOK MODULE\n');
    
    // Get all chart of accounts
    const accounts = await prisma.chartOfAccounts.findMany({
      select: {
        accountNo: true,
        accountName: true,
        accountType: true,
        financialStatement: true
      },
      orderBy: { accountNo: 'asc' }
    });
    
    console.log(`📋 Total Accounts: ${accounts.length}\n`);
    console.log('='.repeat(80));
    
    // Group by account type
    const groupedAccounts = accounts.reduce((acc, account) => {
      const type = account.accountType;
      if (!acc[type]) acc[type] = [];
      acc[type].push(account);
      return acc;
    }, {} as Record<string, typeof accounts>);
    
    // Display by account type
    Object.keys(groupedAccounts).forEach(accountType => {
      console.log(`\n🏷️  ${accountType.toUpperCase()} ACCOUNTS:`);
      console.log('-'.repeat(50));
      groupedAccounts[accountType].forEach(account => {
        console.log(`   ${account.accountNo} - ${account.accountName} (${account.financialStatement})`);
      });
    });
    
    console.log('\n' + '='.repeat(80));
    
    // Check for cashbook-specific accounts
    console.log('\n🏦 CASHBOOK MODULE ANALYSIS:\n');
    
    // Check for bank accounts (1000s - Assets)
    const bankAccounts = accounts.filter(acc => 
      acc.accountNo.startsWith('1') && 
      (acc.accountName.toLowerCase().includes('bank') || 
       acc.accountName.toLowerCase().includes('cash'))
    );
    
    console.log('💰 BANK/CASH ACCOUNTS:');
    if (bankAccounts.length > 0) {
      bankAccounts.forEach(acc => {
        console.log(`   ✅ ${acc.accountNo} - ${acc.accountName}`);
      });
    } else {
      console.log('   ❌ No bank/cash accounts found');
    }
    
    // Check for VAT accounts
    const vatAccounts = accounts.filter(acc => 
      acc.accountName.toLowerCase().includes('vat')
    );
    
    console.log('\n🧾 VAT ACCOUNTS:');
    if (vatAccounts.length > 0) {
      vatAccounts.forEach(acc => {
        console.log(`   ✅ ${acc.accountNo} - ${acc.accountName}`);
      });
    } else {
      console.log('   ❌ No VAT accounts found');
    }
    
    // Check for control accounts
    const controlAccounts = accounts.filter(acc => 
      acc.accountName.toLowerCase().includes('control') ||
      acc.accountName.toLowerCase().includes('receivable') ||
      acc.accountName.toLowerCase().includes('payable')
    );
    
    console.log('\n🔗 CONTROL ACCOUNTS:');
    if (controlAccounts.length > 0) {
      controlAccounts.forEach(acc => {
        console.log(`   ✅ ${acc.accountNo} - ${acc.accountName}`);
      });
    } else {
      console.log('   ❌ No control accounts found');
    }
    
    // Check for expense accounts (5000s)
    const expenseAccounts = accounts.filter(acc => 
      acc.accountNo.startsWith('5')
    );
    
    console.log('\n💸 EXPENSE ACCOUNTS:');
    if (expenseAccounts.length > 0) {
      expenseAccounts.forEach(acc => {
        console.log(`   ✅ ${acc.accountNo} - ${acc.accountName}`);
      });
    } else {
      console.log('   ❌ No expense accounts found');
    }
    
    // Check for revenue accounts (4000s)
    const revenueAccounts = accounts.filter(acc => 
      acc.accountNo.startsWith('4')
    );
    
    console.log('\n💰 REVENUE ACCOUNTS:');
    if (revenueAccounts.length > 0) {
      revenueAccounts.forEach(acc => {
        console.log(`   ✅ ${acc.accountNo} - ${acc.accountName}`);
      });
    } else {
      console.log('   ❌ No revenue accounts found');
    }
    
    console.log('\n' + '='.repeat(80));
    
    // Identify missing accounts for cashbook
    console.log('\n🔍 MISSING ACCOUNTS FOR CASHBOOK MODULE:\n');
    
    const requiredAccounts = [
      { accountNo: '1000', name: 'Cash and Cash Equivalents', type: 'Current Asset' },
      { accountNo: '1010', name: 'Main Bank Account - USD', type: 'Current Asset' },
      { accountNo: '1020', name: 'Savings Account - USD', type: 'Current Asset' },
      { accountNo: '1030', name: 'Petty Cash', type: 'Current Asset' },
      { accountNo: '1200', name: 'Accounts Receivable Control', type: 'Current Asset' },
      { accountNo: '2000', name: 'Accounts Payable Control', type: 'Current Liability' },
      { accountNo: '2100', name: 'VAT Output', type: 'Current Liability' },
      { accountNo: '2110', name: 'VAT Input', type: 'Current Asset' },
      { accountNo: '4000', name: 'Management Fees Income', type: 'Revenue' },
      { accountNo: '5000', name: 'Rent Expense', type: 'Expense' },
      { accountNo: '5010', name: 'Office Supplies Expense', type: 'Expense' },
      { accountNo: '5030', name: 'Salaries and Wages', type: 'Expense' },
      { accountNo: '5070', name: 'Travel Expense', type: 'Expense' }
    ];
    
    const existingAccountNos = accounts.map(acc => acc.accountNo);
    const missingAccounts = requiredAccounts.filter(req => 
      !existingAccountNos.includes(req.accountNo)
    );
    
    if (missingAccounts.length > 0) {
      console.log('❌ Missing Required Accounts:');
      missingAccounts.forEach(acc => {
        console.log(`   ${acc.accountNo} - ${acc.name} (${acc.type})`);
      });
    } else {
      console.log('✅ All required accounts exist');
    }
    
    console.log('\n' + '='.repeat(80));
    console.log('\n📋 SUMMARY:');
    console.log(`   Total Accounts: ${accounts.length}`);
    console.log(`   Bank/Cash Accounts: ${bankAccounts.length}`);
    console.log(`   VAT Accounts: ${vatAccounts.length}`);
    console.log(`   Control Accounts: ${controlAccounts.length}`);
    console.log(`   Expense Accounts: ${expenseAccounts.length}`);
    console.log(`   Revenue Accounts: ${revenueAccounts.length}`);
    console.log(`   Missing Required: ${missingAccounts.length}`);
    
  } catch (error: any) {
    console.error('❌ Error analyzing chart of accounts:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeChartOfAccounts();


