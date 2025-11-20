const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('decimal.js');
const prisma = new PrismaClient();

async function clarifyTransaction() {
  try {
    console.log('🔍 Clarifying "Threading numbers" Transaction\n');
    console.log('═══════════════════════════════════════════════════════\n');

    const cashbookEntry = await prisma.cashbookEntry.findFirst({
      where: {
        reference: 'REF3',
        description: { contains: 'Threading numbers' }
      },
      include: {
        bank: true,
        glAccount: true,
        journalEntry: {
          include: {
            journalEntryLines: {
              include: {
                chartOfAccount: true
              }
            }
          }
        }
      }
    });

    if (!cashbookEntry) {
      console.log('❌ Cashbook entry not found');
      return;
    }

    console.log('📋 Current Transaction (CB-GSX0669D):\n');
    console.log(`Type: ${cashbookEntry.type} (${cashbookEntry.type === 'RECEIPT' ? 'Money IN' : 'Money OUT'})`);
    console.log(`Description: ${cashbookEntry.description}`);
    console.log(`Amount: $${cashbookEntry.amount}`);
    console.log(`Date: ${cashbookEntry.transactionDate.toISOString().split('T')[0]}\n`);
    
    console.log('Journal Entry:');
    cashbookEntry.journalEntry.journalEntryLines.forEach(line => {
      const side = new Decimal(line.debitAmount || 0).gt(0) ? 'DEBIT' : 'CREDIT';
      const amount = new Decimal(line.debitAmount || 0).gt(0) ? line.debitAmount : line.creditAmount;
      console.log(`   ${side.padEnd(6)} ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}: $${amount}`);
    });

    console.log('\n\n❓ The Question:\n');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('You said: "How is it income if we gave money to the company?"\n');
    console.log('This means you PAID $20k to Threaded Numbers (fund disbursement).\n');
    
    console.log('💡 What Should Have Happened:\n');
    console.log('───────────────────────────────────────────────────────\n');
    console.log('If you PAID $20k to Threaded Numbers:');
    console.log('   → Should be a PAYMENT (money going OUT)');
    console.log('   → Should DEBIT Portfolio Investments');
    console.log('   → Should CREDIT Bank Account');
    console.log('   → Should NOT credit Management Fees Income\n');
    
    console.log('💡 What Actually Happened:\n');
    console.log('───────────────────────────────────────────────────────\n');
    console.log('The transaction shows:');
    console.log('   → It\'s a RECEIPT (money coming IN)');
    console.log('   → It DEBITS Bank Account (cash increases)');
    console.log('   → It CREDITS Management Fees Income (revenue)\n');
    
    console.log('❌ This is WRONG if you actually PAID money to the company!\n');
    
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('🔧 Possible Explanations:\n');
    console.log('───────────────────────────────────────────────────────\n');
    console.log('1. The transaction was created incorrectly');
    console.log('   - Should have been PAYMENT, not RECEIPT');
    console.log('   - Should credit Portfolio Investments, not Management Fees Income\n');
    
    console.log('2. This is a different transaction');
    console.log('   - Maybe you RECEIVED $20k as management fees FROM Threaded Numbers?');
    console.log('   - In that case, RECEIPT is correct, but it\'s income, not investment\n');
    
    console.log('3. Data entry error');
    console.log('   - Someone created a receipt when they meant to create a payment\n');
    
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('❓ What Actually Happened?\n');
    console.log('───────────────────────────────────────────────────────\n');
    console.log('Did you:');
    console.log('   A) PAY $20k TO Threaded Numbers? → Should be PAYMENT');
    console.log('   B) RECEIVE $20k FROM Threaded Numbers? → RECEIPT is correct');
    console.log('   C) Something else?\n');
    
    console.log('If you PAID them, this transaction is WRONG and should be:');
    console.log('   - Type: PAYMENT (not RECEIPT)');
    console.log('   - Debit: Portfolio Investments');
    console.log('   - Credit: Bank Account');
    console.log('   - NOT Management Fees Income\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

clarifyTransaction();


