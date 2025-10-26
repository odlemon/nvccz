import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAllAccounts() {
  try {
    console.log('📊 Checking All Available Chart of Accounts...\n');
    
    // Get all accounts
    const accounts = await prisma.chartOfAccounts.findMany({
      select: { 
        accountNo: true, 
        accountName: true, 
        accountType: true,
        financialStatement: true
      },
      orderBy: { accountNo: 'asc' }
    });
    
    console.log('🏦 All Chart of Accounts:');
    accounts.forEach(acc => {
      console.log(`   ${acc.accountNo} - ${acc.accountName} (${acc.accountType}) - ${acc.financialStatement}`);
    });
    
    console.log('\n📋 Key Accounts for Expenses:');
    const expenseAccounts = accounts.filter(acc => 
      acc.accountNo.includes('5') || // Expense accounts
      acc.accountNo === '1000' || // Cash
      acc.accountNo === '2000' || // Payable
      acc.accountNo.includes('1101') || // VAT Input
      acc.accountNo.includes('5120') // Office Supplies
    );
    
    expenseAccounts.forEach(acc => {
      console.log(`   ${acc.accountNo} - ${acc.accountName}`);
    });
    
  } catch (error: any) {
    console.error('❌ Error checking chart of accounts:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkAllAccounts();



