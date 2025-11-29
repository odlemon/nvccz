const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function listBankGLAccounts() {
  try {
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('🏦 LISTING BANK ACCOUNTS WITH GL ACCOUNTS');
    console.log('════════════════════════════════════════════════════════════════\n');

    const banks = await prisma.bank.findMany({
      where: {
        isActive: true
      },
      include: {
        glAccount: {
          select: {
            id: true,
            accountNo: true,
            accountName: true,
            accountType: true
          }
        },
        currency: {
          select: {
            id: true,
            code: true,
            name: true,
            symbol: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });

    if (banks.length === 0) {
      console.log('❌ No active bank accounts found in the system.');
      return;
    }

    console.log(`✅ Found ${banks.length} active bank account(s):\n`);

    banks.forEach((bank, index) => {
      console.log(`${'─'.repeat(80)}`);
      console.log(`🏦 BANK #${index + 1}`);
      console.log(`${'─'.repeat(80)}`);
      console.log(`Bank ID: ${bank.id}`);
      console.log(`Name: ${bank.name}`);
      console.log(`Account Number: ${bank.accountNumber || 'N/A'}`);
      console.log(`Currency: ${bank.currency?.code || 'N/A'} (${bank.currency?.name || 'N/A'})`);
      
      if (bank.glAccount) {
        console.log(`\n✅ GL Account (Use this ID for payments):`);
        console.log(`   GL Account ID: ${bank.glAccount.id}`);
        console.log(`   Account No: ${bank.glAccount.accountNo}`);
        console.log(`   Account Name: ${bank.glAccount.accountName}`);
        console.log(`   Account Type: ${bank.glAccount.accountType}`);
      } else {
        console.log(`\n⚠️  No GL Account linked to this bank account!`);
        console.log(`   This bank cannot be used for payments until a GL account is linked.`);
      }
      console.log('');
    });

    // Filter banks with GL accounts
    const banksWithGL = banks.filter(b => b.glAccount);
    
    console.log(`${'═'.repeat(80)}`);
    console.log('📌 USAGE FOR PAYMENTS:');
    console.log(`${'═'.repeat(80)}`);
    console.log(`✅ Banks with GL Accounts (${banksWithGL.length}):\n`);
    
    if (banksWithGL.length > 0) {
      banksWithGL.forEach((bank, index) => {
        console.log(`${index + 1}. ${bank.name}`);
        console.log(`   Bank Account ID: ${bank.id}`);
        console.log(`   GL Account ID: ${bank.glAccount.id} ← USE THIS for bankAccountId`);
        console.log(`   GL Account: ${bank.glAccount.accountNo} - ${bank.glAccount.accountName}`);
        console.log('');
      });

      console.log('\n📝 Example payment request body:');
      console.log(JSON.stringify({
        paymentAmount: 1000.00,
        paymentMethod: "BANK",
        bankAccountId: banksWithGL[0].glAccount.id,
        paymentReference: "TXN-12345",
        notes: "Payment for invoice"
      }, null, 2));
    } else {
      console.log('❌ No banks have GL accounts linked. Payments will use default bank account.');
      console.log('💡 To use a specific bank, link it to a GL account in the Chart of Accounts.');
    }

    console.log('\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

listBankGLAccounts()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

