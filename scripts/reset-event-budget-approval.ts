import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function resetEventBudgetApproval(eventId: string) {
  try {
    console.log(`\n🔄 Resetting budget approval for event: ${eventId}\n`);

    // Get event details
    const event = await prisma.event.findUnique({
      where: { id: eventId }
    });

    if (!event) {
      console.error(`❌ Event not found: ${eventId}`);
      return;
    }

    console.log(`📅 Event: ${event.title}`);
    console.log(`📊 Current Budget Status: ${event.budgetStatus}`);
    console.log(`💰 Approved Budget: ${event.approvedBudget || 'Not set'}`);
    console.log(`\n`);

    // Find and delete journal entries related to this event's budget
    const journalEntries = await prisma.journalEntry.findMany({
      where: {
        referenceNumber: {
          startsWith: `BUDGET-${eventId}`
        }
      },
      include: {
        journalEntryLines: true
      }
    });

    if (journalEntries.length > 0) {
      console.log(`🗑️  Found ${journalEntries.length} journal entry/entries to delete:\n`);

      for (const entry of journalEntries) {
        console.log(`   - ${entry.referenceNumber} (${entry.journalEntryLines.length} lines)`);
        
        // Delete journal entry lines first (foreign key constraint)
        if (entry.journalEntryLines.length > 0) {
          await prisma.journalEntryLine.deleteMany({
            where: {
              journalEntryId: entry.id
            }
          });
          console.log(`     ✅ Deleted ${entry.journalEntryLines.length} journal entry lines`);
        }

        // Delete journal entry
        await prisma.journalEntry.delete({
          where: { id: entry.id }
        });
        console.log(`     ✅ Deleted journal entry: ${entry.referenceNumber}`);
      }
      console.log(`\n`);
    } else {
      console.log(`ℹ️  No journal entries found to delete\n`);
    }

    // Reset event budget approval status
    console.log(`🔄 Resetting event budget approval status...\n`);

    const updatedEvent = await prisma.event.update({
      where: { id: eventId },
      data: {
        budgetStatus: 'SUBMITTED', // Reset to SUBMITTED so it can be approved again
        status: 'BUDGET_PENDING', // Reset event status
        approvedBudget: null,
        budgetApprovedBy: null,
        budgetApprovedAt: null
      }
    });

    console.log(`✅ Event budget approval reset successfully!\n`);
    console.log(`📊 New Budget Status: ${updatedEvent.budgetStatus}`);
    console.log(`📅 New Event Status: ${updatedEvent.status}`);
    console.log(`💰 Approved Budget: ${updatedEvent.approvedBudget || 'Cleared'}`);
    console.log(`\n✨ You can now approve the budget again!\n`);

  } catch (error: any) {
    console.error('❌ Error resetting budget approval:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get event ID from command line argument
const eventId = process.argv[2];

if (!eventId) {
  console.error('❌ Please provide an event ID');
  console.log('Usage: npx ts-node scripts/reset-event-budget-approval.ts <eventId>');
  process.exit(1);
}

resetEventBudgetApproval(eventId);

