import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function testAccountCreation() {
  try {
    console.log('\n🔍 Testing account creation...\n');

    // Check if Event Budget Allocation account exists
    let account = await prisma.chartOfAccounts.findFirst({
      where: { 
        accountName: 'Event Budget Allocation',
        accountType: 'ASSET'
      }
    });

    if (!account) {
      console.log('❌ Event Budget Allocation account not found. Creating...\n');
      
      try {
        account = await prisma.chartOfAccounts.create({
          data: {
            accountNo: 'EBA-001',
            accountName: 'Event Budget Allocation',
            accountType: 'ASSET',
            financialStatement: 'BALANCE_SHEET',
            notes: 'Allocated budget for events',
            isActive: true
          }
        });
        console.log('✅ Created Event Budget Allocation account:', account.id);
      } catch (error: any) {
        console.error('❌ Error creating account:', error.message);
        console.error(error);
      }
    } else {
      console.log('✅ Event Budget Allocation account exists:', account.id);
      console.log(`   Account No: ${account.accountNo}`);
      console.log(`   Account Name: ${account.accountName}`);
    }

    // Check if Cash account exists
    let cashAccount = await prisma.chartOfAccounts.findFirst({
      where: { 
        accountName: 'Cash',
        accountType: 'ASSET'
      }
    });

    if (!cashAccount) {
      console.log('\n❌ Cash account not found. Creating...\n');
      
      try {
        cashAccount = await prisma.chartOfAccounts.create({
          data: {
            accountNo: 'CASH-001',
            accountName: 'Cash',
            accountType: 'ASSET',
            financialStatement: 'BALANCE_SHEET',
            notes: 'Cash on hand',
            isActive: true
          }
        });
        console.log('✅ Created Cash account:', cashAccount.id);
      } catch (error: any) {
        console.error('❌ Error creating account:', error.message);
        console.error(error);
      }
    } else {
      console.log('\n✅ Cash account exists:', cashAccount.id);
      console.log(`   Account No: ${cashAccount.accountNo}`);
      console.log(`   Account Name: ${cashAccount.accountName}`);
    }

    console.log('\n');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

testAccountCreation();

