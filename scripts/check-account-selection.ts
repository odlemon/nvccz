import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkAccountSelection() {
  try {
    console.log('🔍 Checking Account Selection Logic\n');

    // Check which accounts exist
    const account5010 = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: '5010', isActive: true }
    });

    const account5030 = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: '5030', isActive: true }
    });

    console.log('Available Accounts:');
    if (account5010) {
      console.log(`   ✅ 5010 - ${account5010.accountName}`);
    } else {
      console.log(`   ❌ 5010 - Not found`);
    }

    if (account5030) {
      console.log(`   ✅ 5030 - ${account5030.accountName}`);
    } else {
      console.log(`   ❌ 5030 - Not found`);
    }

    // Test the actual query logic
    console.log('\nTesting Account Selection Query:');
    const selectedAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        OR: [
          { accountNo: '5030' },
          { accountNo: '5010' },
          { 
            accountName: { 
              contains: 'Salaries and Wages'
            } 
          },
          { 
            accountName: { 
              contains: 'Salaries Expense'
            } 
          }
        ],
        isActive: true
      },
      orderBy: [
        { accountNo: 'asc' }
      ]
    });

    if (selectedAccount) {
      console.log(`   Selected: ${selectedAccount.accountNo} - ${selectedAccount.accountName}`);
      console.log(`   Correct: ${selectedAccount.accountNo === '5030' ? '✅ YES' : '❌ NO (should be 5030)'}`);
    }

    // The issue: OR with orderBy doesn't guarantee order in Prisma
    // We need to check 5030 first explicitly
    console.log('\nTesting Explicit 5030 Check:');
    const account5030First = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: '5030', isActive: true }
    });

    if (account5030First) {
      console.log(`   ✅ 5030 exists and should be used`);
    } else {
      console.log(`   ❌ 5030 not found, will fallback to 5010`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAccountSelection();

