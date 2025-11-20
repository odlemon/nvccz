const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('decimal.js');
const prisma = new PrismaClient();

async function checkActualEntries() {
  try {
    console.log('🔍 Checking Actual Journal Entry Lines\n');
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

    console.log('📋 Journal Entry: FD-CMI36LP4-1763386415023\n');
    console.log('All Journal Entry Lines:\n');
    
    journalEntry.journalEntryLines.forEach((line, index) => {
      console.log(`Line ${index + 1}:`);
      console.log(`   Account: ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}`);
      console.log(`   Account Type: ${line.chartOfAccount.accountType}`);
      console.log(`   Debit Amount: $${line.debitAmount}`);
      console.log(`   Credit Amount: $${line.creditAmount}`);
      console.log(`   Raw Debit: ${typeof line.debitAmount} = ${line.debitAmount}`);
      console.log(`   Raw Credit: ${typeof line.creditAmount} = ${line.creditAmount}`);
      console.log('');
    });

    // Check if it's correct
    const portfolioLine = journalEntry.journalEntryLines.find(l => l.chartOfAccount.accountNo === '1501');
    const bankLine = journalEntry.journalEntryLines.find(l => l.chartOfAccount.accountNo === '1010');

    console.log('\n📊 Analysis:\n');
    if (portfolioLine) {
      const portfolioDebit = new Decimal(portfolioLine.debitAmount || 0);
      const portfolioCredit = new Decimal(portfolioLine.creditAmount || 0);
      console.log(`Portfolio Investments (1501):`);
      console.log(`   Debit: $${portfolioDebit.toString()}`);
      console.log(`   Credit: $${portfolioCredit.toString()}`);
      console.log(`   Net: $${portfolioDebit.minus(portfolioCredit).toString()}`);
    }
    
    if (bankLine) {
      const bankDebit = new Decimal(bankLine.debitAmount || 0);
      const bankCredit = new Decimal(bankLine.creditAmount || 0);
      console.log(`\nBank Account (1010):`);
      console.log(`   Debit: $${bankDebit.toString()}`);
      console.log(`   Credit: $${bankCredit.toString()}`);
      console.log(`   Net: $${bankDebit.minus(bankCredit).toString()}`);
      
      if (bankCredit.gt(0)) {
        console.log(`   ✅ CORRECT: Credit means cash going OUT (payment)`);
      } else if (bankDebit.gt(0)) {
        console.log(`   ❌ WRONG: Debit would mean cash coming IN (receipt)`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

checkActualEntries();


