import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkChartOfAccounts() {
  try {
    console.log('📊 Checking Chart of Accounts for Expense Journal Entries...\n');
    
    // Get the specific accounts we need for expense journal entries
    const accountNumbers = ['1000', '1101', '5120', '5070', '2000'];
    
    const accounts = await prisma.chartOfAccounts.findMany({
      where: { 
        accountNo: { in: accountNumbers } 
      },
      select: { 
        accountNo: true, 
        accountName: true, 
        accountType: true,
        financialStatement: true
      }
    });
    
    console.log('🏦 Chart of Accounts Found:');
    accounts.forEach(acc => {
      console.log(`   ${acc.accountNo} - ${acc.accountName} (${acc.accountType}) - ${acc.financialStatement}`);
    });
    
    console.log('\n📋 Expense Category Mappings:');
    console.log('   Office Equipment → 5120 (Office Supplies)');
    console.log('   Travel and Accommodation → 5070 (Travel Expense)');
    console.log('   VAT Input → 1101 (VAT Input)');
    console.log('   Bank Payment → 1000 (Cash and Cash Equivalents)');
    console.log('   Credit Payment → 2000 (Accounts Payable)');
    
  } catch (error: any) {
    console.error('❌ Error checking chart of accounts:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkChartOfAccounts();



