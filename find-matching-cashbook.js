const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('decimal.js');
const prisma = new PrismaClient();

async function findMatchingCashbook() {
  try {
    console.log('🔍 Searching for Matching Cashbook Entry...\n');

    const journalEntry = await prisma.journalEntry.findFirst({
      where: {
        referenceNumber: 'FD-CMI36LP4-1763386415023'
      }
    });

    if (!journalEntry) {
      console.log('❌ Journal entry not found');
      return;
    }

    console.log(`Journal Entry Date: ${journalEntry.transactionDate.toISOString().split('T')[0]}`);
    console.log(`Journal Entry Amount: $${journalEntry.totalAmount}`);
    console.log(`Description: ${journalEntry.description}\n`);

    // Search for cashbook entries around the same date with similar amount
    const cashbookEntries = await prisma.cashbookEntry.findMany({
      where: {
        transactionDate: journalEntry.transactionDate,
        type: 'PAYMENT',
        status: 'POSTED',
        amount: {
          gte: new Decimal(19999),
          lte: new Decimal(20001)
        }
      },
      include: {
        journalEntry: true,
        bank: {
          include: {
            glAccount: true
          }
        }
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    console.log(`Found ${cashbookEntries.length} cashbook payment(s) on the same date with $20,000:\n`);

    cashbookEntries.forEach((cb, index) => {
      console.log(`${index + 1}. Cashbook Entry:`);
      console.log(`   ID: ${cb.id}`);
      console.log(`   Reference: ${cb.reference}`);
      console.log(`   Description: ${cb.description}`);
      console.log(`   Amount: $${cb.amount}`);
      console.log(`   Date: ${cb.transactionDate.toISOString().split('T')[0]}`);
      console.log(`   Bank: ${cb.bank?.name || 'N/A'}`);
      console.log(`   GL Account: ${cb.glAccountId || 'N/A'}`);
      console.log(`   Journal Entry ID: ${cb.journalEntryId || 'NONE'}`);
      
      if (cb.journalEntry) {
        console.log(`   Linked Journal Entry: ${cb.journalEntry.referenceNumber}`);
        if (cb.journalEntry.id === journalEntry.id) {
          console.log(`   ✅ This IS linked to our journal entry!`);
        } else {
          console.log(`   ❌ Linked to different journal entry: ${cb.journalEntry.referenceNumber}`);
        }
      } else {
        console.log(`   ⚠️  No journal entry linked - this could be the missing link!`);
      }
      console.log('');
    });

    // Also check fund disbursements
    const fundDisbursement = await prisma.fundDisbursement.findFirst({
      where: {
        id: { startsWith: 'CMI36LP4' }
      },
      include: {
        cashbookEntry: {
          include: {
            journalEntry: true
          }
        }
      }
    });

    if (fundDisbursement) {
      console.log('\n💰 Fund Disbursement:');
      console.log(`   ID: ${fundDisbursement.id}`);
      console.log(`   Amount: $${fundDisbursement.amount}`);
      console.log(`   Status: ${fundDisbursement.status}`);
      console.log(`   Cashbook Entry ID: ${fundDisbursement.cashbookEntryId || 'NONE'}`);
      
      if (fundDisbursement.cashbookEntry) {
        console.log(`   ✅ Has cashbook entry: ${fundDisbursement.cashbookEntry.reference}`);
        if (fundDisbursement.cashbookEntry.journalEntry) {
          console.log(`   Journal Entry: ${fundDisbursement.cashbookEntry.journalEntry.referenceNumber}`);
          if (fundDisbursement.cashbookEntry.journalEntry.id === journalEntry.id) {
            console.log(`   ✅ This cashbook entry IS linked to our journal entry!`);
            console.log(`\n   🔧 SOLUTION: The cashbook entry exists but the journal entry doesn't have it in its cashbookEntries relation.`);
            console.log(`   This is a data integrity issue - the link exists in cashbookEntry.journalEntryId but not in journalEntry.cashbookEntries.`);
          } else {
            console.log(`   ❌ This cashbook entry is linked to a DIFFERENT journal entry`);
          }
        }
      } else {
        console.log(`   ❌ No cashbook entry linked`);
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

findMatchingCashbook();


