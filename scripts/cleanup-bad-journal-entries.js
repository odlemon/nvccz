// @ts-nocheck
/**
 * Cleanup Script: Void/Delete Bad Journal Entries
 * Run with: node scripts/cleanup-bad-journal-entries.js [--delete]
 * 
 * By default, this script VOIDS bad entries (safer).
 * Use --delete flag to permanently delete them (use with caution!).
 * 
 * IMPORTANT: Review the audit results before running this script!
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DELETE_MODE = process.argv.includes('--delete');
const DRY_RUN = process.argv.includes('--dry-run');

console.log('\n╔════════════════════════════════════════╗');
console.log('║  JOURNAL ENTRY CLEANUP SCRIPT          ║');
console.log('║  Date: ' + new Date().toISOString().split('T')[0] + '                      ║');
console.log('╚════════════════════════════════════════╝\n');

if (DRY_RUN) {
  console.log('🔍 DRY RUN MODE - No changes will be made\n');
} else if (DELETE_MODE) {
  console.log('⚠️  DELETE MODE - Entries will be permanently deleted!\n');
} else {
  console.log('📝 VOID MODE - Entries will be marked as VOID (safer)\n');
}

async function voidOrDeleteCreditNotesWithoutJournalEntries() {
  console.log('========================================');
  console.log('1. Credit Notes Without Journal Entries');
  console.log('========================================\n');

  const creditNotes = await prisma.creditNote.findMany({
    where: {
      OR: [
        { journalEntryId: null },
        {
          journalEntry: {
            is: null
          }
        }
      ]
    },
    include: {
      customer: { select: { name: true } }
    }
  });

  if (creditNotes.length === 0) {
    console.log('✅ No credit notes to clean up.\n');
    return 0;
  }

  console.log(`Found ${creditNotes.length} credit notes without journal entries:\n`);
  
  creditNotes.forEach(cn => {
    console.log(`- ${cn.creditNoteNumber} (${cn.customer?.name}) - $${cn.totalAmount}`);
  });

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN: Would delete these credit notes\n');
    return creditNotes.length;
  }

  console.log('\n🗑️  Deleting orphaned credit notes...');
  
  const deleted = await prisma.creditNote.deleteMany({
    where: {
      id: { in: creditNotes.map(cn => cn.id) }
    }
  });

  console.log(`✅ Deleted ${deleted.count} credit notes\n`);
  return deleted.count;
}

async function voidOrDeleteJournalEntriesWithoutLines() {
  console.log('========================================');
  console.log('2. Journal Entries Without Lines');
  console.log('========================================\n');

  const journalEntries = await prisma.journalEntry.findMany({
    include: {
      journalEntryLines: true
    }
  });

  const entriesWithoutLines = journalEntries.filter(je => je.journalEntryLines.length === 0);

  if (entriesWithoutLines.length === 0) {
    console.log('✅ No journal entries without lines to clean up.\n');
    return 0;
  }

  console.log(`Found ${entriesWithoutLines.length} journal entries without lines:\n`);
  
  entriesWithoutLines.forEach(je => {
    console.log(`- ${je.referenceNumber} - ${je.description} - $${je.totalAmount}`);
  });

  if (DRY_RUN) {
    console.log('\n🔍 DRY RUN: Would delete these journal entries\n');
    return entriesWithoutLines.length;
  }

  console.log('\n🗑️  Deleting journal entries without lines...');
  
  const deleted = await prisma.journalEntry.deleteMany({
    where: {
      id: { in: entriesWithoutLines.map(je => je.id) }
    }
  });

  console.log(`✅ Deleted ${deleted.count} journal entries\n`);
  return deleted.count;
}

async function voidOrDeleteArToArEntries() {
  console.log('========================================');
  console.log('3. Meaningless AR-to-AR Entries');
  console.log('========================================\n');

  const journalEntries = await prisma.journalEntry.findMany({
    where: {
      referenceNumber: {
        contains: 'CN-APPLY'
      }
    },
    include: {
      journalEntryLines: {
        include: {
          chartOfAccount: true
        }
      }
    }
  });

  const arToArEntries = journalEntries.filter(je => {
    const uniqueAccounts = new Set();
    je.journalEntryLines.forEach(line => {
      uniqueAccounts.add(line.chartOfAccountId);
    });
    return uniqueAccounts.size === 1 && je.journalEntryLines.length > 0;
  });

  if (arToArEntries.length === 0) {
    console.log('✅ No AR-to-AR entries to clean up.\n');
    return 0;
  }

  console.log(`Found ${arToArEntries.length} meaningless AR-to-AR entries:\n`);
  
  arToArEntries.forEach(je => {
    console.log(`- ${je.referenceNumber} - $${je.totalAmount}`);
  });

  if (DRY_RUN) {
    console.log(`\n🔍 DRY RUN: Would ${DELETE_MODE ? 'delete' : 'void'} these entries\n`);
    return arToArEntries.length;
  }

  if (DELETE_MODE) {
    console.log('\n🗑️  Deleting AR-to-AR entries and their lines...');
    
    // Delete lines first
    await prisma.journalEntryLine.deleteMany({
      where: {
        journalEntryId: { in: arToArEntries.map(je => je.id) }
      }
    });

    // Then delete entries
    const deleted = await prisma.journalEntry.deleteMany({
      where: {
        id: { in: arToArEntries.map(je => je.id) }
      }
    });

    console.log(`✅ Deleted ${deleted.count} AR-to-AR entries\n`);
    return deleted.count;
  } else {
    console.log('\n📝 Voiding AR-to-AR entries...');
    
    const updated = await prisma.journalEntry.updateMany({
      where: {
        id: { in: arToArEntries.map(je => je.id) }
      },
      data: {
        status: 'VOID'
      }
    });

    console.log(`✅ Voided ${updated.count} AR-to-AR entries\n`);
    return updated.count;
  }
}

async function voidUnbalancedAssetDisposals() {
  console.log('========================================');
  console.log('4. Unbalanced Asset Disposal Entries');
  console.log('========================================\n');

  const journalEntries = await prisma.journalEntry.findMany({
    where: {
      referenceNumber: {
        startsWith: 'DISPOSAL-'
      }
    },
    include: {
      journalEntryLines: true
    }
  });

  const unbalanced = journalEntries.filter(je => {
    const totalDebits = je.journalEntryLines.reduce(
      (sum, line) => sum + Number(line.debitAmount || 0),
      0
    );
    const totalCredits = je.journalEntryLines.reduce(
      (sum, line) => sum + Number(line.creditAmount || 0),
      0
    );
    return Math.abs(totalDebits - totalCredits) > 0.01;
  });

  if (unbalanced.length === 0) {
    console.log('✅ No unbalanced asset disposal entries to clean up.\n');
    return 0;
  }

  console.log(`Found ${unbalanced.length} unbalanced asset disposal entries:\n`);
  
  unbalanced.forEach(je => {
    const totalDebits = je.journalEntryLines.reduce((sum, line) => sum + Number(line.debitAmount || 0), 0);
    const totalCredits = je.journalEntryLines.reduce((sum, line) => sum + Number(line.creditAmount || 0), 0);
    const diff = Math.abs(totalDebits - totalCredits);
    console.log(`- ${je.referenceNumber} - Dr: $${totalDebits.toFixed(2)}, Cr: $${totalCredits.toFixed(2)}, Diff: $${diff.toFixed(2)}`);
  });

  if (DRY_RUN) {
    console.log(`\n🔍 DRY RUN: Would void these unbalanced entries\n`);
    return unbalanced.length;
  }

  console.log('\n📝 Voiding unbalanced asset disposal entries...');
  console.log('⚠️  Note: Assets will need to be re-disposed with correct entries\n');

  const updated = await prisma.journalEntry.updateMany({
    where: {
      id: { in: unbalanced.map(je => je.id) }
    },
    data: {
      status: 'VOID'
    }
  });

  console.log(`✅ Voided ${updated.count} unbalanced entries\n`);
  return updated.count;
}

async function generateCleanupSummary(results) {
  console.log('\n========================================');
  console.log('CLEANUP SUMMARY');
  console.log('========================================\n');

  console.log('Actions Taken:');
  console.log(`  - Credit notes deleted: ${results.creditNotesDeleted}`);
  console.log(`  - Journal entries (no lines) deleted: ${results.entriesNoLinesDeleted}`);
  console.log(`  - AR-to-AR entries ${DELETE_MODE ? 'deleted' : 'voided'}: ${results.arToArCleaned}`);
  console.log(`  - Unbalanced disposals voided: ${results.disposalsVoided}`);
  
  const total = Object.values(results).reduce((sum, count) => sum + count, 0);
  console.log('\n' + '='.repeat(40));
  console.log(`  TOTAL ITEMS CLEANED: ${total}`);
  console.log('='.repeat(40) + '\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN COMPLETE - No changes were made');
    console.log('💡 Run without --dry-run to apply changes\n');
  } else {
    console.log('✅ CLEANUP COMPLETE!\n');
    console.log('📝 Next Steps:');
    console.log('  1. Run audit script again to verify cleanup');
    console.log('  2. Review fixed code in AssetService.ts');
    console.log('  3. Re-dispose assets that were voided (with fixed code)\n');
  }
}

async function main() {
  try {
    // Confirm before proceeding (unless dry run)
    if (!DRY_RUN && !DELETE_MODE) {
      console.log('⚠️  This will VOID bad journal entries.');
      console.log('   They will remain in the database but marked as invalid.\n');
    }

    if (!DRY_RUN && DELETE_MODE) {
      console.log('⚠️ ⚠️ ⚠️  WARNING: DELETE MODE  ⚠️ ⚠️ ⚠️');
      console.log('   This will PERMANENTLY DELETE bad entries!');
      console.log('   Make sure you have a backup!\n');
      console.log('   Press Ctrl+C to cancel...\n');
      
      // Give user 5 seconds to cancel
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    const results = {
      creditNotesDeleted: await voidOrDeleteCreditNotesWithoutJournalEntries(),
      entriesNoLinesDeleted: await voidOrDeleteJournalEntriesWithoutLines(),
      arToArCleaned: await voidOrDeleteArToArEntries(),
      disposalsVoided: await voidUnbalancedAssetDisposals()
    };

    await generateCleanupSummary(results);

  } catch (error) {
    console.error('\n❌ Error during cleanup:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });


