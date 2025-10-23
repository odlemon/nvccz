// @ts-nocheck
/**
 * Clear Journal Entries
 * 
 * This script clears all existing journal entries and related data
 * to allow for fresh testing of accounting scenarios.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function clearJournalEntries() {
  console.log('🧹 Clearing Journal Entries...');
  console.log('=' .repeat(40));

  try {
    // Get counts before deletion
    const journalEntryLinesCount = await prisma.journalEntryLine.count();
    const journalEntriesCount = await prisma.journalEntry.count();

    console.log(`📊 Found ${journalEntryLinesCount} journal entry lines`);
    console.log(`📊 Found ${journalEntriesCount} journal entries`);

    if (journalEntryLinesCount === 0 && journalEntriesCount === 0) {
      console.log('✅ No journal entries to clear');
      return;
    }

    // Delete in correct order (foreign key constraints)
    console.log('\n🗑️ Deleting journal entry lines...');
    const deletedLines = await prisma.journalEntryLine.deleteMany({});
    console.log(`   ✅ Deleted ${deletedLines.count} journal entry lines`);

    console.log('🗑️ Deleting journal entries...');
    const deletedEntries = await prisma.journalEntry.deleteMany({});
    console.log(`   ✅ Deleted ${deletedEntries.count} journal entries`);

    console.log('\n🎉 Journal entries cleared successfully!');
    console.log('\n💡 You can now run the accounting scenarios seeder:');
    console.log('   npx ts-node scripts/seed-accounting-scenarios.ts');

  } catch (error) {
    console.error('❌ Error clearing journal entries:', error);
    throw error;
  }
}

async function main() {
  try {
    await clearJournalEntries();
  } catch (error) {
    console.error('❌ Operation failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
