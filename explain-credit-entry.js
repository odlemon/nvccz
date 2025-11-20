const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('decimal.js');
const prisma = new PrismaClient();

async function explainCreditEntry() {
  try {
    console.log('📚 Explaining Why Fund Disbursement is a Credit Entry\n');
    console.log('═══════════════════════════════════════════════════════\n');

    const journalEntry = await prisma.journalEntry.findFirst({
      where: {
        referenceNumber: 'FD-CMI36LP4-1763386415023'
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        }
      }
    });

    if (!journalEntry) {
      console.log('❌ Journal entry not found');
      return;
    }

    console.log('📋 Journal Entry: FD-CMI36LP4-1763386415023\n');
    console.log('Journal Entry Lines:\n');
    
    journalEntry.journalEntryLines.forEach((line, index) => {
      console.log(`${index + 1}. Account: ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}`);
      console.log(`   Account Type: ${line.chartOfAccount.accountType}`);
      console.log(`   Debit: $${line.debitAmount}`);
      console.log(`   Credit: $${line.creditAmount}`);
      console.log('');
    });

    console.log('\n💡 Accounting Explanation:\n');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const portfolioLine = journalEntry.journalEntryLines.find(l => l.chartOfAccount.accountNo === '1501');
    const bankLine = journalEntry.journalEntryLines.find(l => l.chartOfAccount.accountNo === '1010');

    if (portfolioLine && bankLine) {
      console.log('When you disburse funds to a portfolio company:');
      console.log('');
      console.log('1. You are INVESTING money (increasing your Portfolio Investments asset)');
      console.log('   → This is a DEBIT to Portfolio Investments (1501)');
      console.log(`   → Amount: $${portfolioLine.debitAmount}`);
      console.log('');
      console.log('2. You are PAYING OUT money from your bank account');
      console.log('   → This is a CREDIT to Main Bank Account (1010)');
      console.log(`   → Amount: $${bankLine.creditAmount}`);
      console.log('');
      console.log('✅ This is CORRECT accounting:');
      console.log('   - Assets (like Portfolio Investments) increase with DEBITS');
      console.log('   - Assets (like Bank Account) decrease with CREDITS');
      console.log('');
      console.log('So when you disburse $20,000:');
      console.log('   Dr Portfolio Investments    $20,000  (increasing your investment)');
      console.log('   Cr Bank Account             $20,000  (decreasing your cash)');
      console.log('');
      console.log('This means:');
      console.log('   ✅ Your Portfolio Investments increased by $20,000');
      console.log('   ✅ Your Bank Account decreased by $20,000');
      console.log('');
      console.log('In the balance sheet, this shows as:');
      console.log('   - Portfolio Investments: +$20,000 (asset increased)');
      console.log('   - Cash Account: -$20,000 (asset decreased)');
      console.log('');
      console.log('This is why it appears as a CREDIT (outflow) in the cash account.');
      console.log('It\'s money going OUT of your bank account.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

explainCreditEntry();


