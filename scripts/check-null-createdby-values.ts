import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkNullCreatedByValues() {
  try {
    console.log('🔍 Checking for null createdById values in database...\n');

    // Check Journal Entries
    console.log('📊 JOURNAL ENTRIES:');
    const journalEntriesWithNull = await prisma.journalEntry.findMany({
      where: {
        createdById: null
      },
      select: {
        id: true,
        description: true,
        totalAmount: true,
        status: true,
        createdAt: true
      }
    });

    console.log(`   Found ${journalEntriesWithNull.length} journal entries with null createdById`);
    if (journalEntriesWithNull.length > 0) {
      console.log('   Sample entries:');
      journalEntriesWithNull.slice(0, 5).forEach((entry, index) => {
        console.log(`   ${index + 1}. ${entry.description} - $${entry.totalAmount} (${entry.status})`);
      });
    }

    // Check Cashbook Entries
    console.log('\n💰 CASHBOOK ENTRIES:');
    const cashbookEntriesWithNull = await prisma.cashbookEntry.findMany({
      where: {
        createdById: null
      },
      select: {
        id: true,
        description: true,
        amount: true,
        type: true,
        status: true,
        createdAt: true
      }
    });

    console.log(`   Found ${cashbookEntriesWithNull.length} cashbook entries with null createdById`);
    if (cashbookEntriesWithNull.length > 0) {
      console.log('   Sample entries:');
      cashbookEntriesWithNull.slice(0, 5).forEach((entry, index) => {
        console.log(`   ${index + 1}. ${entry.description} - $${entry.amount} (${entry.type})`);
      });
    }

    // Check total counts
    console.log('\n📈 TOTAL COUNTS:');
    const totalJournalEntries = await prisma.journalEntry.count();
    const totalCashbookEntries = await prisma.cashbookEntry.count();
    
    console.log(`   Total Journal Entries: ${totalJournalEntries}`);
    console.log(`   Total Cashbook Entries: ${totalCashbookEntries}`);
    console.log(`   Journal Entries with null createdById: ${journalEntriesWithNull.length}`);
    console.log(`   Cashbook Entries with null createdById: ${cashbookEntriesWithNull.length}`);

    // Check if there are any users to assign these to
    console.log('\n👥 AVAILABLE USERS:');
    const users = await prisma.user.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true
      },
      take: 5
    });

    console.log(`   Found ${users.length} active users`);
    if (users.length > 0) {
      console.log('   Sample users:');
      users.forEach((user, index) => {
        console.log(`   ${index + 1}. ${user.firstName} ${user.lastName} (${user.email})`);
      });
    }

    // Summary
    console.log('\n📋 SUMMARY:');
    if (journalEntriesWithNull.length === 0 && cashbookEntriesWithNull.length === 0) {
      console.log('✅ No null createdById values found!');
    } else {
      console.log('❌ Found null createdById values:');
      if (journalEntriesWithNull.length > 0) {
        console.log(`   - ${journalEntriesWithNull.length} Journal Entries`);
      }
      if (cashbookEntriesWithNull.length > 0) {
        console.log(`   - ${cashbookEntriesWithNull.length} Cashbook Entries`);
      }
      console.log('\n💡 Recommendation: Run the fix script to assign these to a user');
    }

  } catch (error) {
    console.error('❌ Error checking null createdById values:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkNullCreatedByValues();
