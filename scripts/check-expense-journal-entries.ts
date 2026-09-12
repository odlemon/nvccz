import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkExpenseJournalEntries(eventId: string) {
  try {
    console.log(`\n🔍 Checking journal entries for event expenses: ${eventId}\n`);

    // Get event details
    const event = await prisma.event.findUnique({
      where: { id: eventId },
      include: {
        author: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!event) {
      console.error(`❌ Event not found: ${eventId}`);
      return;
    }

    console.log(`📅 Event: ${event.title}`);
    console.log(`👤 Organizer: ${event.author.firstName} ${event.author.lastName}`);
    console.log(`\n`);

    // Get all expenses for this event
    const expenses = await prisma.eventExpense.findMany({
      where: { eventId },
      include: {
        event: {
          select: {
            title: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (expenses.length === 0) {
      console.log(`ℹ️  No expenses found for this event\n`);
      return;
    }

    console.log(`📋 Found ${expenses.length} expense(s):\n`);

    for (const expense of expenses) {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`💰 Expense: ${expense.description}`);
      console.log(`   ID: ${expense.id}`);
      console.log(`   Amount: $${expense.amount}`);
      console.log(`   Category: ${expense.category}`);
      console.log(`   Status: ${expense.status}`);
      console.log(`   Vendor: ${expense.vendor || 'N/A'}`);
      console.log(`   Payment Method: ${expense.paymentMethod || 'N/A'}`);
      console.log(`   Created: ${expense.createdAt.toISOString()}`);
      console.log(`\n`);

      // Search for journal entries related to this expense
      // Journal entries for expenses typically have reference numbers like EXP-timestamp-receiptNumber
      // or descriptions containing the expense description
      const journalEntries = await prisma.journalEntry.findMany({
        where: {
          OR: [
            {
              description: {
                contains: expense.description
              }
            },
            {
              description: {
                contains: `Event Expense`
              }
            }
          ]
        },
        include: {
          journalEntryLines: {
            include: {
              chartOfAccount: {
                select: {
                  accountNo: true,
                  accountName: true,
                  accountType: true
                }
              }
            }
          },
          currency: {
            select: {
              code: true,
              symbol: true
            }
          },
          createdBy: {
            select: {
              firstName: true,
              lastName: true,
              email: true
            }
          }
        },
        orderBy: {
          transactionDate: 'desc'
        }
      });

      // Filter to find entries that match this expense (by description and amount)
      const matchingEntries = journalEntries.filter(entry => {
        const entryAmount = Number(entry.totalAmount);
        const expenseAmount = Number(expense.amount);
        // Check if description contains expense description and amounts are close
        return entry.description.includes(expense.description) || 
               (entry.description.includes('Event Expense') && 
                Math.abs(entryAmount - expenseAmount) < 1000); // Allow for VAT difference
      });

      if (matchingEntries.length === 0) {
        console.log(`   ⚠️  No journal entries found for this expense\n`);
        continue;
      }

      console.log(`   📝 Found ${matchingEntries.length} journal entry/entries:\n`);

      matchingEntries.forEach((entry, index) => {
        console.log(`   Journal Entry #${index + 1}:`);
        console.log(`      Reference Number: ${entry.referenceNumber}`);
        console.log(`      Description: ${entry.description}`);
        console.log(`      Transaction Date: ${entry.transactionDate.toISOString()}`);
        console.log(`      Total Amount: ${entry.currency.symbol}${entry.totalAmount}`);
        console.log(`      Status: ${entry.status}`);
        console.log(`      Created By: ${entry.createdBy.firstName} ${entry.createdBy.lastName}`);
        console.log(`\n      📋 Journal Entry Lines (${entry.journalEntryLines.length}):\n`);

        entry.journalEntryLines.forEach((line, lineIndex) => {
          console.log(`      Line ${lineIndex + 1}:`);
          console.log(`         Account: ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName} (${line.chartOfAccount.accountType})`);
          console.log(`         Debit: ${entry.currency.symbol}${line.debitAmount}`);
          console.log(`         Credit: ${entry.currency.symbol}${line.creditAmount}`);
          console.log(`         Description: ${line.description}`);
          console.log(`         VAT: ${entry.currency.symbol}${line.vatAmount}`);
          console.log(``);
        });

        // Verify balance
        const totalDebits = entry.journalEntryLines.reduce((sum, line) => sum + Number(line.debitAmount), 0);
        const totalCredits = entry.journalEntryLines.reduce((sum, line) => sum + Number(line.creditAmount), 0);
        
        console.log(`      📊 Balance Check:`);
        console.log(`         Total Debits: ${entry.currency.symbol}${totalDebits.toFixed(2)}`);
        console.log(`         Total Credits: ${entry.currency.symbol}${totalCredits.toFixed(2)}`);
        
        if (Math.abs(totalDebits - totalCredits) < 0.01) {
          console.log(`         ✅ Balanced (Debits = Credits)\n`);
        } else {
          console.log(`         ❌ NOT BALANCED! Difference: ${entry.currency.symbol}${Math.abs(totalDebits - totalCredits).toFixed(2)}\n`);
        }
      });

      console.log(`\n`);
    }

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  } catch (error: any) {
    console.error('❌ Error checking journal entries:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get event ID from command line argument
const eventId = process.argv[2];

if (!eventId) {
  console.error('❌ Please provide an event ID');
  console.log('Usage: npx ts-node scripts/check-expense-journal-entries.ts <eventId>');
  process.exit(1);
}

checkExpenseJournalEntries(eventId);

