import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixPayrollJournalEntryDate() {
  try {
    console.log('🔧 Fixing Payroll Journal Entry Date\n');

    // Find payroll journal entries with future dates
    const today = new Date();
    today.setHours(23, 59, 59, 999);

    const futurePayrollEntries = await prisma.journalEntry.findMany({
      where: {
        description: {
          contains: 'Payroll'
        },
        transactionDate: {
          gt: today
        }
      },
      select: {
        id: true,
        referenceNumber: true,
        description: true,
        transactionDate: true,
        status: true
      }
    });

    console.log(`Found ${futurePayrollEntries.length} payroll journal entry/entries with future dates:\n`);

    if (futurePayrollEntries.length === 0) {
      console.log('✅ No entries need fixing.');
      return;
    }

    for (const entry of futurePayrollEntries) {
      console.log(`   ${entry.referenceNumber}`);
      console.log(`   Current Date: ${entry.transactionDate.toISOString()}`);
      console.log(`   Status: ${entry.status}`);

      // Update to today's date (or use the payroll run's start date if available)
      const newDate = new Date();
      newDate.setHours(12, 0, 0, 0); // Set to noon for consistency

      await prisma.journalEntry.update({
        where: { id: entry.id },
        data: {
          transactionDate: newDate
        }
      });

      console.log(`   ✅ Updated to: ${newDate.toISOString()}\n`);
    }

    console.log('✅ All payroll journal entries have been updated!');
    console.log('\n📋 Verification:');
    console.log('   The entries should now appear in the Journal view.');
    console.log('   They will still appear in Trial Balance when generated with appropriate dates.');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

fixPayrollJournalEntryDate();

