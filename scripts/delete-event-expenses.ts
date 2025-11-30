import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteEventExpenses(eventId: string, expenseIds?: string[]) {
  try {
    console.log(`\n🗑️  Deleting expenses for event: ${eventId}\n`);

    // Get event details
    const event = await prisma.event.findUnique({
      where: { id: eventId }
    });

    if (!event) {
      console.error(`❌ Event not found: ${eventId}`);
      return;
    }

    console.log(`📅 Event: ${event.title}\n`);

    // If specific expense IDs provided, delete only those
    if (expenseIds && expenseIds.length > 0) {
      console.log(`🎯 Deleting specific expenses: ${expenseIds.length}\n`);

      for (const expenseId of expenseIds) {
        try {
          const expense = await prisma.eventExpense.findUnique({
            where: { id: expenseId },
            include: {
              event: {
                select: { id: true, title: true }
              }
            }
          });

          if (!expense) {
            console.log(`   ⚠️  Expense ${expenseId} not found`);
            continue;
          }

          if (expense.eventId !== eventId) {
            console.log(`   ⚠️  Expense ${expenseId} does not belong to this event`);
            continue;
          }

          console.log(`   📝 Deleting: ${expense.description} (${expense.status}) - $${expense.amount}`);
          
          await prisma.eventExpense.delete({
            where: { id: expenseId }
          });

          console.log(`   ✅ Deleted expense: ${expenseId}\n`);
        } catch (error: any) {
          console.error(`   ❌ Error deleting expense ${expenseId}:`, error.message);
        }
      }
    } else {
      // Delete all expenses for the event
      console.log(`🗑️  Deleting ALL expenses for this event...\n`);

      const expenses = await prisma.eventExpense.findMany({
        where: { eventId },
        select: {
          id: true,
          description: true,
          amount: true,
          status: true
        }
      });

      if (expenses.length === 0) {
        console.log(`ℹ️  No expenses found for this event\n`);
        return;
      }

      console.log(`Found ${expenses.length} expense(s):\n`);

      for (const expense of expenses) {
        try {
          console.log(`   📝 Deleting: ${expense.description} (${expense.status}) - $${expense.amount}`);
          
          await prisma.eventExpense.delete({
            where: { id: expense.id }
          });

          console.log(`   ✅ Deleted expense: ${expense.id}\n`);
        } catch (error: any) {
          console.error(`   ❌ Error deleting expense ${expense.id}:`, error.message);
        }
      }
    }

    console.log(`✨ Done!\n`);

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get event ID and optional expense IDs from command line arguments
const eventId = process.argv[2];
const expenseIds = process.argv.slice(3);

if (!eventId) {
  console.error('❌ Please provide an event ID');
  console.log('Usage: npx ts-node scripts/delete-event-expenses.ts <eventId> [expenseId1] [expenseId2] ...');
  console.log('Example: npx ts-node scripts/delete-event-expenses.ts event-id expense-id-1 expense-id-2');
  process.exit(1);
}

deleteEventExpenses(eventId, expenseIds.length > 0 ? expenseIds : undefined);

