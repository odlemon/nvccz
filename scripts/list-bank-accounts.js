const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function listBankAccounts() {
  try {
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('🏦 LISTING AVAILABLE BANK ACCOUNTS');
    console.log('════════════════════════════════════════════════════════════════\n');

    const banks = await prisma.bank.findMany({
      where: {
        isActive: true
      },
      include: {
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
      console.log('\n💡 You may need to create bank accounts first.');
      return;
    }

    console.log(`✅ Found ${banks.length} active bank account(s):\n`);

    banks.forEach((bank, index) => {
      console.log(`${'─'.repeat(80)}`);
      console.log(`🏦 BANK #${index + 1}`);
      console.log(`${'─'.repeat(80)}`);
      console.log(`ID: ${bank.id}`);
      console.log(`Name: ${bank.name}`);
      console.log(`Account Number: ${bank.accountNumber || 'N/A'}`);
      console.log(`Account Type: ${bank.accountType || 'N/A'}`);
      console.log(`Currency: ${bank.currency?.code || 'N/A'} (${bank.currency?.name || 'N/A'})`);
      console.log(`Current Balance: ${bank.currency?.symbol || '$'}${Number(bank.currentBalance || 0).toFixed(2)}`);
      console.log(`Status: ${bank.isActive ? 'ACTIVE' : 'INACTIVE'}`);
      if (bank.branch) {
        console.log(`Branch: ${bank.branch}`);
      }
      if (bank.swiftCode) {
        console.log(`SWIFT Code: ${bank.swiftCode}`);
      }
      console.log('');
    });

    console.log(`${'═'.repeat(80)}`);
    console.log('📌 USAGE:');
    console.log(`${'═'.repeat(80)}`);
    console.log('When making a payment, use the bank account ID in the "bankAccountId" field.');
    console.log('Example request body:');
    console.log(JSON.stringify({
      paymentAmount: 1000.00,
      paymentMethod: "BANK",
      bankAccountId: banks[0]?.id || "BANK_ID_HERE",
      paymentReference: "TXN-12345",
      notes: "Payment for invoice"
    }, null, 2));
    console.log('\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

listBankAccounts()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });

