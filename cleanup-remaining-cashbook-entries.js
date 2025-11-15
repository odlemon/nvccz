const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanupRemainingCashbookEntries() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧹 CLEANING UP REMAINING CASHBOOK ENTRIES WITH ISSUES');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Find cashbook entries that still have journalEntryId set (shouldn't exist after cleanup)
    const cashbookEntriesWithJE = await prisma.cashbookEntry.findMany({
      where: {
        journalEntryId: { not: null }
      },
      select: {
        id: true,
        reference: true,
        description: true,
        journalEntryId: true,
        originalTransactionId: true
      }
    });

    console.log(`📋 Found ${cashbookEntriesWithJE.length} cashbook entries with journal entry IDs\n`);

    if (cashbookEntriesWithJE.length > 0) {
      console.log('Cleaning up these entries...\n');
      
      for (const entry of cashbookEntriesWithJE) {
        try {
          console.log(`Processing: ${entry.reference || entry.id}`);
          console.log(`   Description: ${entry.description}`);
          
          // Check if this entry has reversals
          const reversals = await prisma.cashbookEntry.findMany({
            where: { originalTransactionId: entry.id }
          });
          
          if (reversals.length > 0) {
            console.log(`   🔄 Found ${reversals.length} reversal(s) - deleting reversals first...`);
            for (const reversal of reversals) {
              // Clear journal entry link from reversal first
              if (reversal.journalEntryId) {
                await prisma.cashbookEntry.update({
                  where: { id: reversal.id },
                  data: { journalEntryId: null }
                });
              }
              // Delete the reversal
              await prisma.cashbookEntry.delete({
                where: { id: reversal.id }
              });
            }
            console.log(`   ✅ Deleted ${reversals.length} reversal(s)`);
          }
          
          // Now clear the journal entry link from the original entry
          await prisma.cashbookEntry.update({
            where: { id: entry.id },
            data: { journalEntryId: null }
          });
          
          console.log(`   ✅ Cleared journal entry link\n`);
        } catch (error) {
          console.error(`   ❌ Error processing ${entry.id}: ${error.message}\n`);
        }
      }
    }

    // Also check for any orphaned cashbook entries (entries that reference non-existent journal entries)
    console.log('Checking for orphaned cashbook entries...\n');
    
    const allCashbookEntries = await prisma.cashbookEntry.findMany({
      where: {
        journalEntryId: { not: null }
      },
      select: {
        id: true,
        journalEntryId: true
      }
    });

    let orphanedCount = 0;
    for (const entry of allCashbookEntries) {
      const journalEntry = await prisma.journalEntry.findUnique({
        where: { id: entry.journalEntryId }
      });
      
      if (!journalEntry) {
        orphanedCount++;
        await prisma.cashbookEntry.update({
          where: { id: entry.id },
          data: { journalEntryId: null }
        });
      }
    }

    if (orphanedCount > 0) {
      console.log(`✅ Cleared ${orphanedCount} orphaned journal entry reference(s)\n`);
    } else {
      console.log(`✅ No orphaned references found\n`);
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 CLEANUP SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`✅ Processed ${cashbookEntriesWithJE.length} cashbook entries`);
    console.log(`✅ Cleared ${orphanedCount} orphaned references`);
    console.log('\n✅ Cleanup completed successfully!');

  } catch (error) {
    console.error('❌ Fatal error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

cleanupRemainingCashbookEntries()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

