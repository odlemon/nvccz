import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkEventBudgetJournalEntries(eventId: string) {
  try {
    console.log(`\n🔍 Checking journal entries for event: ${eventId}\n`);

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
    console.log(`💰 Approved Budget: ${event.approvedBudget || 'Not set'}`);
    console.log(`📊 Budget Status: ${event.budgetStatus}`);
    console.log(`✅ Budget Approved At: ${event.budgetApprovedAt || 'Not approved'}`);
    console.log(`\n`);

    // Search for journal entries with reference number starting with "BUDGET-" and containing event ID
    const journalEntries = await prisma.journalEntry.findMany({
      where: {
        referenceNumber: {
          startsWith: `BUDGET-${eventId}`
        }
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

    if (journalEntries.length === 0) {
      console.log(`❌ No journal entries found for this event's budget approval.\n`);
      console.log(`⚠️  This could mean:`);
      console.log(`   1. Budget approval journal entry creation failed`);
      console.log(`   2. Budget was not approved yet`);
      console.log(`   3. Journal entry was created with a different reference format\n`);
      return;
    }

    console.log(`✅ Found ${journalEntries.length} journal entry/entries:\n`);

    journalEntries.forEach((entry, index) => {
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📝 Journal Entry #${index + 1}`);
      console.log(`   Reference Number: ${entry.referenceNumber}`);
      console.log(`   Description: ${entry.description}`);
      console.log(`   Transaction Date: ${entry.transactionDate.toISOString()}`);
      console.log(`   Total Amount: ${entry.currency.symbol}${entry.totalAmount}`);
      console.log(`   Status: ${entry.status}`);
      console.log(`   Created By: ${entry.createdBy.firstName} ${entry.createdBy.lastName} (${entry.createdBy.email})`);
      console.log(`\n   📋 Journal Entry Lines (${entry.journalEntryLines.length}):\n`);

      entry.journalEntryLines.forEach((line, lineIndex) => {
        console.log(`   Line ${lineIndex + 1}:`);
        console.log(`      Account: ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName} (${line.chartOfAccount.accountType})`);
        console.log(`      Debit: ${entry.currency.symbol}${line.debitAmount}`);
        console.log(`      Credit: ${entry.currency.symbol}${line.creditAmount}`);
        console.log(`      Description: ${line.description}`);
        console.log(``);
      });
    });

    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    // Verify the accounting equation
    journalEntries.forEach((entry, index) => {
      const totalDebits = entry.journalEntryLines.reduce((sum, line) => sum + Number(line.debitAmount), 0);
      const totalCredits = entry.journalEntryLines.reduce((sum, line) => sum + Number(line.creditAmount), 0);
      
      console.log(`📊 Journal Entry #${index + 1} Balance Check:`);
      console.log(`   Total Debits: ${entry.currency.symbol}${totalDebits.toFixed(2)}`);
      console.log(`   Total Credits: ${entry.currency.symbol}${totalCredits.toFixed(2)}`);
      
      if (Math.abs(totalDebits - totalCredits) < 0.01) {
        console.log(`   ✅ Balanced (Debits = Credits)\n`);
      } else {
        console.log(`   ❌ NOT BALANCED! Difference: ${entry.currency.symbol}${Math.abs(totalDebits - totalCredits).toFixed(2)}\n`);
      }
    });

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
  console.log('Usage: ts-node scripts/check-event-budget-journal-entries.ts <eventId>');
  process.exit(1);
}

checkEventBudgetJournalEntries(eventId);

