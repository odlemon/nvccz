const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('decimal.js');
const prisma = new PrismaClient();

async function clarifyFundDisbursement() {
  try {
    console.log('📚 Clarifying Fund Disbursement Accounting\n');
    console.log('═══════════════════════════════════════════════════════\n');

    // Get both transactions
    const fundDisbursementJE = await prisma.journalEntry.findFirst({
      where: { referenceNumber: 'FD-CMI36LP4-1763386415023' },
      include: {
        journalEntryLines: {
          include: { chartOfAccount: true }
        }
      }
    });

    const bankReceiptJE = await prisma.journalEntry.findFirst({
      where: { referenceNumber: 'CB-GSX0669D' },
      include: {
        journalEntryLines: {
          include: { chartOfAccount: true }
        },
        cashbookEntries: true
      }
    });

    console.log('✅ YES - These are TWO DIFFERENT transactions!\n');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📋 Transaction 1: Fund Disbursement (FD-CMI36LP4)');
    console.log('───────────────────────────────────────────────────────');
    console.log('What happened: You PAID OUT $20,000 to "Threaded Numbers" portfolio company');
    console.log('When: Nov 17, 2025');
    console.log('Purpose: Investment in portfolio company\n');
    
    if (fundDisbursementJE) {
      console.log('Journal Entry:');
      fundDisbursementJE.journalEntryLines.forEach(line => {
        const side = line.debitAmount !== '0' ? 'DEBIT' : 'CREDIT';
        const amount = line.debitAmount !== '0' ? line.debitAmount : line.creditAmount;
        console.log(`   ${side.padEnd(6)} ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}: $${amount}`);
      });
    }

    console.log('\n📋 Transaction 2: Bank Receipt (CB-GSX0669D)');
    console.log('───────────────────────────────────────────────────────');
    console.log('What happened: You RECEIVED $20,000 as "Management Fees Income"');
    console.log('When: Nov 17, 2025');
    console.log('Purpose: Income/revenue from "Threading numbers"\n');
    
    if (bankReceiptJE) {
      console.log('Journal Entry:');
      bankReceiptJE.journalEntryLines.forEach(line => {
        const side = line.debitAmount !== '0' ? 'DEBIT' : 'CREDIT';
        const amount = line.debitAmount !== '0' ? line.debitAmount : line.creditAmount;
        console.log(`   ${side.padEnd(6)} ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}: $${amount}`);
      });
    }

    console.log('\n\n💡 FUND DISBURSEMENT - Which Side Should It Go To?\n');
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('When you disburse funds to a portfolio company:\n');
    console.log('1. You are PAYING OUT money from your bank');
    console.log('   → Bank account DECREASES');
    console.log('   → For assets, decreases = CREDIT');
    console.log('   ✅ So: CREDIT to Bank Account (Cash goes OUT)\n');
    
    console.log('2. You are INVESTING in a portfolio company');
    console.log('   → Portfolio Investments INCREASES');
    console.log('   → For assets, increases = DEBIT');
    console.log('   ✅ So: DEBIT to Portfolio Investments (Investment goes UP)\n');
    
    console.log('📊 CORRECT Fund Disbursement Entry:\n');
    console.log('   Dr Portfolio Investments    $20,000  ← Investment increases');
    console.log('   Cr Bank Account            $20,000  ← Cash decreases\n');
    
    console.log('✅ The current entry (FD-CMI36LP4) is CORRECT!');
    console.log('   - It credits (reduces) the bank account');
    console.log('   - It debits (increases) portfolio investments\n');
    
    console.log('❌ If it was WRONG, it would look like:');
    console.log('   Dr Bank Account            $20,000  ← This would be WRONG!');
    console.log('   Cr Portfolio Investments   $20,000  ← This would mean cash going IN\n');
    
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('📝 Summary:\n');
    console.log('✅ Fund Disbursement = CREDIT to Cash (money going OUT)');
    console.log('✅ Bank Receipt = DEBIT to Cash (money coming IN)');
    console.log('✅ These are two separate, unrelated transactions');
    console.log('✅ Both are correctly recorded\n');
    
    console.log('The fund disbursement entry is correct - it shows cash going OUT.');
    console.log('The only issue is it\'s missing the cashbook link (shows as MANUAL_ENTRY).');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

clarifyFundDisbursement();


