const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('decimal.js');
const prisma = new PrismaClient();

async function deleteOrphanedDisbursement() {
  try {
    console.log('🗑️  Deleting Orphaned Fund Disbursement\n');
    console.log('═══════════════════════════════════════════════════════\n');

    // Step 1: Find the fund disbursement
    const fundDisbursement = await prisma.fundDisbursement.findFirst({
      where: {
        id: { startsWith: 'CMI36LP4' }
      },
      include: {
        investmentImplementation: {
          include: {
            portfolioCompany: {
              select: { name: true }
            }
          }
        }
      }
    });

    if (!fundDisbursement) {
      console.log('❌ Fund disbursement not found');
      return;
    }

    console.log('📋 Found Fund Disbursement:');
    console.log(`   ID: ${fundDisbursement.id}`);
    console.log(`   Amount: $${fundDisbursement.amount}`);
    console.log(`   Date: ${fundDisbursement.disbursementDate.toISOString().split('T')[0]}`);
    console.log(`   Status: ${fundDisbursement.status}`);
    console.log(`   Portfolio Company: ${fundDisbursement.investmentImplementation?.portfolioCompany?.name || 'N/A'}`);
    console.log(`   Has Cashbook Entry ID: ${fundDisbursement.cashbookEntryId ? 'YES' : 'NO'}\n`);

    // Step 2: Find the journal entry
    const journalEntry = await prisma.journalEntry.findFirst({
      where: {
        referenceNumber: 'FD-CMI36LP4-1763386415023'
      },
      include: {
        journalEntryLines: true,
        cashbookEntries: true
      }
    });

    if (!journalEntry) {
      console.log('❌ Journal entry not found');
      return;
    }

    console.log('📋 Found Journal Entry:');
    console.log(`   ID: ${journalEntry.id}`);
    console.log(`   Reference: ${journalEntry.referenceNumber}`);
    console.log(`   Description: ${journalEntry.description}`);
    console.log(`   Journal Entry Lines: ${journalEntry.journalEntryLines.length}`);
    console.log(`   Linked Cashbook Entries: ${journalEntry.cashbookEntries.length}\n`);

    // Step 3: Verify it's safe to delete
    if (journalEntry.cashbookEntries.length > 0) {
      console.log('⚠️  WARNING: This journal entry has linked cashbook entries!');
      console.log('   This should not be deleted. Aborting...');
      return;
    }

    if (fundDisbursement.cashbookEntryId) {
      console.log('⚠️  WARNING: This fund disbursement has a cashbook entry ID!');
      console.log('   This should not be deleted. Aborting...');
      return;
    }

    console.log('✅ Safe to delete - no cashbook entries linked\n');
    console.log('🗑️  Proceeding with deletion...\n');

    // Step 4: Delete in correct order (to avoid foreign key constraints)
    // Delete sequentially to avoid transaction timeout
    
    // 4a. Delete journal entry lines first
    console.log('1. Deleting journal entry lines...');
    const deletedLines = await prisma.journalEntryLine.deleteMany({
      where: {
        journalEntryId: journalEntry.id
      }
    });
    console.log(`   ✅ Deleted ${deletedLines.count} journal entry line(s)\n`);

    // 4b. Delete journal entry
    console.log('2. Deleting journal entry...');
    await prisma.journalEntry.delete({
      where: {
        id: journalEntry.id
      }
    });
    console.log(`   ✅ Deleted journal entry: ${journalEntry.referenceNumber}\n`);

    // 4c. Get fund info before updating
    const fund = await prisma.fund.findUnique({
      where: { id: fundDisbursement.fundId }
    });
    
    // 4d. Update fund remaining amount (add back the disbursed amount)
    if (fund) {
      console.log('3. Reversing fund remaining amount...');
      const oldAmount = fund.remainingAmount;
      const newRemainingAmount = new Decimal(fund.remainingAmount).plus(fundDisbursement.amount);
      await prisma.fund.update({
        where: { id: fundDisbursement.fundId },
        data: {
          remainingAmount: newRemainingAmount,
          updatedAt: new Date()
        }
      });
      console.log(`   ✅ Updated fund remaining amount: $${oldAmount} → $${newRemainingAmount.toString()}\n`);
    }

    // 4e. Delete fund disbursement
    console.log('4. Deleting fund disbursement...');
    await prisma.fundDisbursement.delete({
      where: {
        id: fundDisbursement.id
      }
    });
    console.log(`   ✅ Deleted fund disbursement: ${fundDisbursement.id}\n`);

    console.log('═══════════════════════════════════════════════════════\n');
    console.log('✅ SUCCESS: All related records deleted!\n');
    console.log('Deleted:');
    console.log('   - Journal entry lines');
    console.log('   - Journal entry (FD-CMI36LP4-1763386415023)');
    console.log('   - Fund disbursement record');
    console.log('   - Fund remaining amount reversed\n');
    console.log('The orphaned fund disbursement has been cleaned up.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

deleteOrphanedDisbursement();

