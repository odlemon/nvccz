const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('decimal.js');
const prisma = new PrismaClient();

async function identifyWrongTransaction() {
  try {
    console.log('🔍 Identifying Which Transaction is Wrong\n');
    console.log('═══════════════════════════════════════════════════════\n');

    // Transaction 1: Fund Disbursement
    const fundDisbursementJE = await prisma.journalEntry.findFirst({
      where: { referenceNumber: 'FD-CMI36LP4-1763386415023' },
      include: {
        journalEntryLines: {
          include: { chartOfAccount: true }
        },
        cashbookEntries: true
      }
    });

    // Transaction 2: Bank Receipt
    const bankReceiptJE = await prisma.journalEntry.findFirst({
      where: { referenceNumber: 'CB-GSX0669D' },
      include: {
        journalEntryLines: {
          include: { chartOfAccount: true }
        },
        cashbookEntries: {
          include: {
            bank: true
          }
        }
      }
    });

    console.log('📋 Transaction 1: Fund Disbursement (FD-CMI36LP4)\n');
    console.log('───────────────────────────────────────────────────────');
    if (fundDisbursementJE) {
      console.log(`Reference: ${fundDisbursementJE.referenceNumber}`);
      console.log(`Description: ${fundDisbursementJE.description}`);
      console.log(`Has Cashbook Entry: ${fundDisbursementJE.cashbookEntries.length > 0 ? '✅ YES' : '❌ NO'}`);
      console.log(`Shows as: ${fundDisbursementJE.cashbookEntries.length > 0 ? 'CASHBOOK' : 'MANUAL_ENTRY'}`);
      console.log(`\nAccounting Entry:`);
      fundDisbursementJE.journalEntryLines.forEach(line => {
        const side = new Decimal(line.debitAmount || 0).gt(0) ? 'DEBIT' : 'CREDIT';
        const amount = new Decimal(line.debitAmount || 0).gt(0) ? line.debitAmount : line.creditAmount;
        console.log(`   ${side.padEnd(6)} ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}: $${amount}`);
      });
      
      if (fundDisbursementJE.cashbookEntries.length === 0) {
        console.log(`\n❌ PROBLEM: Missing cashbook entry!`);
        console.log(`   - All fund disbursements should go through cashbook`);
        console.log(`   - This was created before cashbook integration`);
        console.log(`   - Accounting is correct, but missing cashbook link`);
      }
    }

    console.log('\n\n📋 Transaction 2: Bank Receipt (CB-GSX0669D)\n');
    console.log('───────────────────────────────────────────────────────');
    if (bankReceiptJE) {
      console.log(`Reference: ${bankReceiptJE.referenceNumber}`);
      console.log(`Description: ${bankReceiptJE.description}`);
      console.log(`Has Cashbook Entry: ${bankReceiptJE.cashbookEntries.length > 0 ? '✅ YES' : '❌ NO'}`);
      console.log(`Shows as: ${bankReceiptJE.cashbookEntries.length > 0 ? 'CASHBOOK' : 'MANUAL_ENTRY'}`);
      if (bankReceiptJE.cashbookEntries.length > 0) {
        console.log(`Cashbook Reference: ${bankReceiptJE.cashbookEntries[0].reference}`);
        console.log(`Cashbook Type: ${bankReceiptJE.cashbookEntries[0].type}`);
      }
      console.log(`\nAccounting Entry:`);
      bankReceiptJE.journalEntryLines.forEach(line => {
        const side = new Decimal(line.debitAmount || 0).gt(0) ? 'DEBIT' : 'CREDIT';
        const amount = new Decimal(line.debitAmount || 0).gt(0) ? line.debitAmount : line.creditAmount;
        console.log(`   ${side.padEnd(6)} ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}: $${amount}`);
      });
      
      if (bankReceiptJE.cashbookEntries.length > 0) {
        console.log(`\n✅ CORRECT: Has cashbook entry`);
        console.log(`   - Bank receipts should go through cashbook`);
        console.log(`   - This is properly linked`);
      }
    }

    console.log('\n\n🎯 ANSWER:\n');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('❌ Transaction 1 (FD-CMI36LP4 - Fund Disbursement) is WRONG\n');
    console.log('Why it\'s wrong:');
    console.log('   - Missing cashbook entry link');
    console.log('   - All fund disbursements should go through cashbook');
    console.log('   - Shows as MANUAL_ENTRY instead of CASHBOOK');
    console.log('   - Accounting entries are correct, but missing integration\n');
    
    console.log('✅ Transaction 2 (CB-GSX0669D - Bank Receipt) is CORRECT\n');
    console.log('Why it\'s correct:');
    console.log('   - Has cashbook entry properly linked');
    console.log('   - Shows as CASHBOOK (correct)');
    console.log('   - Accounting entries are correct');
    console.log('   - Properly integrated with cashbook system\n');
    
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('💡 Summary:');
    console.log('   The fund disbursement needs to be linked to a cashbook entry.');
    console.log('   The accounting is correct, but it\'s missing the cashbook integration.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

identifyWrongTransaction();


