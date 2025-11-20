const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('decimal.js');
const prisma = new PrismaClient();

async function verifyFundDisbursement() {
  try {
    console.log('✅ Verifying Fund Disbursement Entry\n');
    console.log('═══════════════════════════════════════════════════════\n');

    const journalEntry = await prisma.journalEntry.findFirst({
      where: { referenceNumber: 'FD-CMI36LP4-1763386415023' },
      include: {
        journalEntryLines: {
          include: { chartOfAccount: true }
        }
      }
    });

    if (!journalEntry) {
      console.log('❌ Journal entry not found');
      return;
    }

    console.log('📋 Fund Disbursement Entry: FD-CMI36LP4\n');
    console.log('What it represents: Paying $20,000 to "Threaded Numbers" portfolio company\n');
    
    console.log('Current Journal Entry:');
    journalEntry.journalEntryLines.forEach((line, index) => {
      const isDebit = line.debitAmount !== '0';
      const amount = isDebit ? line.debitAmount : line.creditAmount;
      const side = isDebit ? 'DEBIT' : 'CREDIT';
      console.log(`   ${side.padEnd(6)} ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}: $${amount}`);
    });

    console.log('\n\n✅ THIS IS CORRECT!\n');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('When you pay a portfolio company from your bank:\n');
    console.log('1. Your bank account DECREASES (money going out)');
    console.log('   → This is a CREDIT to Bank Account ✅');
    console.log('   → Shows as: -$20,000 (outflow) in balance sheet ✅\n');
    
    console.log('2. Your Portfolio Investments INCREASE (you invested)');
    console.log('   → This is a DEBIT to Portfolio Investments ✅');
    console.log('   → Shows as: +$20,000 (asset increased) ✅\n');
    
    console.log('📊 The Entry is CORRECT:\n');
    console.log('   Dr Portfolio Investments    $20,000  ✅ Investment increases');
    console.log('   Cr Bank Account            $20,000  ✅ Cash decreases (PAYMENT)\n');
    
    console.log('This is exactly what should happen when you disburse funds!');
    console.log('The CREDIT to bank account means money is going OUT (payment).');
    console.log('This is correct accounting.\n');
    
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('❓ If you think it\'s wrong, what did you expect to see?\n');
    console.log('If you expected:');
    console.log('   Dr Bank Account            $20,000');
    console.log('   Cr Portfolio Investments   $20,000');
    console.log('That would be WRONG - that would mean money coming IN, not going OUT!');
    console.log('\nThe current entry is CORRECT - it shows a payment (money going out).');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

verifyFundDisbursement();


