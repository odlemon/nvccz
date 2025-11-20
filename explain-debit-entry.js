const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('decimal.js');
const prisma = new PrismaClient();

async function explainDebitEntry() {
  try {
    console.log('📚 Explaining Why Bank Receipt is a Debit Entry\n');
    console.log('═══════════════════════════════════════════════════════\n');

    const journalEntry = await prisma.journalEntry.findFirst({
      where: {
        referenceNumber: 'CB-GSX0669D'
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        },
        cashbookEntries: {
          include: {
            bank: true
          }
        }
      }
    });

    if (!journalEntry) {
      console.log('❌ Journal entry not found');
      return;
    }

    console.log('📋 Journal Entry: CB-GSX0669D\n');
    console.log('Description: Bank Receipt: Threading numbers\n');
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
    
    const bankLine = journalEntry.journalEntryLines.find(l => 
      l.chartOfAccount.accountNo === '1010' || 
      l.chartOfAccount.accountName.toLowerCase().includes('bank')
    );
    const incomeLine = journalEntry.journalEntryLines.find(l => 
      l.chartOfAccount.accountType === 'Revenue'
    );

    if (bankLine && incomeLine) {
      console.log('When you receive money (Bank Receipt):');
      console.log('');
      console.log('1. You are RECEIVING money into your bank account');
      console.log('   → This is a DEBIT to Main Bank Account (1010)');
      console.log(`   → Amount: $${bankLine.debitAmount}`);
      console.log('   → Debit increases your cash balance');
      console.log('');
      console.log('2. You are EARNING income (Management Fees)');
      console.log('   → This is a CREDIT to Management Fees Income (4000)');
      console.log(`   → Amount: $${incomeLine.creditAmount}`);
      console.log('   → Credit increases your revenue');
      console.log('');
      console.log('✅ This is CORRECT accounting:');
      console.log('   - Assets (like Bank Account) increase with DEBITS');
      console.log('   - Revenue accounts increase with CREDITS');
      console.log('');
      console.log('So when you receive $20,000:');
      console.log('   Dr Bank Account              $20,000  (increasing your cash)');
      console.log('   Cr Management Fees Income    $20,000  (increasing your revenue)');
      console.log('');
      console.log('This means:');
      console.log('   ✅ Your Bank Account increased by $20,000');
      console.log('   ✅ Your Revenue increased by $20,000');
      console.log('');
      console.log('In the balance sheet, this shows as:');
      console.log('   - Cash Account: +$20,000 (asset increased)');
      console.log('   - This is money coming IN to your bank account');
      console.log('');
      console.log('This is why it appears as a DEBIT (inflow) in the cash account.');
      console.log('It\'s money coming INTO your bank account.');
      console.log('');
      console.log('📊 Summary of Both Transactions:\n');
      console.log('═══════════════════════════════════════════════════════\n');
      console.log('Transaction 1 (FD-CMI36LP4): Fund Disbursement');
      console.log('   → CREDIT to Cash = Money going OUT = -$20,000');
      console.log('   → DEBIT to Portfolio Investments = Investment increased');
      console.log('');
      console.log('Transaction 2 (CB-GSX0669D): Bank Receipt');
      console.log('   → DEBIT to Cash = Money coming IN = +$20,000');
      console.log('   → CREDIT to Management Fees Income = Revenue earned');
      console.log('');
      console.log('Net effect on cash: -$20,000 + $20,000 = $0');
      console.log('(These two transactions cancel each other out on the cash account)');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

explainDebitEntry();


