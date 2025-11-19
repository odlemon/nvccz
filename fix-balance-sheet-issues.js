const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixBalanceSheetIssues() {
  try {
    console.log('🔧 Fixing Balance Sheet Issues...\n');

    // 1. Fix "Threading numbers" description
    console.log('1️⃣ Fixing "Threading numbers" description...\n');
    
    const threadingEntry = await prisma.journalEntry.findFirst({
      where: {
        description: {
          contains: 'Cashbook RECEIPT: Threading numbers'
        }
      }
    });

    if (threadingEntry) {
      await prisma.journalEntry.update({
        where: { id: threadingEntry.id },
        data: {
          description: 'Bank Receipt: Threading numbers'
        }
      });
      console.log(`✅ Updated: ${threadingEntry.referenceNumber}`);
      console.log(`   Old: ${threadingEntry.description}`);
      console.log(`   New: Bank Receipt: Threading numbers\n`);
    } else {
      console.log('⚠️  Threading numbers entry not found\n');
    }

    // 2. Check account types for 1500 and 1501
    console.log('2️⃣ Checking account types...\n');
    
    const account1500 = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: '1500' }
    });
    
    const account1501 = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: '1501' }
    });

    if (account1500) {
      console.log(`Account 1500: ${account1500.accountName}`);
      console.log(`   Account Type: ${account1500.accountType}`);
      console.log(`   Financial Statement: ${account1500.financialStatement}\n`);
    }

    if (account1501) {
      console.log(`Account 1501: ${account1501.accountName}`);
      console.log(`   Account Type: ${account1501.accountType}`);
      console.log(`   Financial Statement: ${account1501.financialStatement}\n`);
    }

    console.log('✅ All fixes completed!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

fixBalanceSheetIssues();

