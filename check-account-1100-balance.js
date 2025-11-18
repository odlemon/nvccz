const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAccount1100Balance() {
  try {
    console.log('🔍 CHECKING ACCOUNT 1100 BALANCE');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Get account 1100
    const account1100 = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: '1100' }
    });

    if (!account1100) {
      console.log('❌ Account 1100 not found');
      return;
    }

    console.log(`Account: ${account1100.accountNo} - ${account1100.accountName}`);
    console.log(`Account Type: ${account1100.accountType}\n`);

    // Get ALL journal entry lines for account 1100
    const allLines = await prisma.journalEntryLine.findMany({
      where: {
        chartOfAccountId: account1100.id
      },
      include: {
        journalEntry: {
          select: {
            id: true,
            referenceNumber: true,
            transactionDate: true,
            status: true,
            currencyId: true
          }
        }
      },
      orderBy: {
        journalEntry: {
          transactionDate: 'asc'
        }
      }
    });

    console.log(`Total journal entry lines: ${allLines.length}\n`);

    let balance = 0;
    console.log('Journal Entry Lines:');
    allLines.forEach((line, index) => {
      const debit = Number(line.debitAmount);
      const credit = Number(line.creditAmount);
      // Assets: Debits increase, Credits decrease
      balance += debit - credit;
      
      console.log(`\n   Line ${index + 1}:`);
      console.log(`      - Journal Entry: ${line.journalEntry.referenceNumber}`);
      console.log(`      - Date: ${line.journalEntry.transactionDate.toISOString().split('T')[0]}`);
      console.log(`      - Status: ${line.journalEntry.status}`);
      console.log(`      - Debit: $${debit}`);
      console.log(`      - Credit: $${credit}`);
      console.log(`      - Running Balance: $${balance.toFixed(2)}`);
    });

    console.log(`\n════════════════════════════════════════════════════════════════`);
    console.log(`Final Balance: $${balance.toFixed(2)}`);
    console.log(`════════════════════════════════════════════════════════════════\n`);

    // Check if there are any asset-related entries
    const assetEntries = allLines.filter(line => 
      line.journalEntry.referenceNumber?.includes('ASSET')
    );
    
    if (assetEntries.length > 0) {
      console.log(`Asset-related entries: ${assetEntries.length}`);
      assetEntries.forEach(line => {
        console.log(`   - ${line.journalEntry.referenceNumber}: Debit $${line.debitAmount}, Credit $${line.creditAmount}`);
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkAccount1100Balance();

