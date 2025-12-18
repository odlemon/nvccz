import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testAccountLookup() {
  try {
    console.log('🧪 Testing Account Lookup Logic\n');

    // Test the exact logic from PayrollService
    console.log('Step 1: Check 5030 first...');
    let account = await prisma.chartOfAccounts.findFirst({
      where: {
        accountNo: '5030',
        isActive: true
      }
    });

    if (account) {
      console.log(`   ✅ Found: ${account.accountNo} - ${account.accountName}`);
    } else {
      console.log(`   ❌ Not found, checking 5010...`);
      account = await prisma.chartOfAccounts.findFirst({
        where: {
          accountNo: '5010',
          isActive: true
        }
      });
      if (account) {
        console.log(`   ✅ Found: ${account.accountNo} - ${account.accountName}`);
      }
    }

    console.log(`\n   Final Selection: ${account?.accountNo} - ${account?.accountName}`);
    console.log(`   Correct: ${account?.accountNo === '5030' ? '✅ YES' : '❌ NO'}\n`);

    // Check if server needs restart
    console.log('⚠️ NOTE: If the code was just changed, the server may need to be restarted');
    console.log('   for the changes to take effect. The running server is using old code.\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testAccountLookup();

