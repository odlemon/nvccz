import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

async function fixIncompleteJournalEntry(eventId: string) {
  try {
    console.log(`\n🔧 Fixing incomplete journal entry for event: ${eventId}\n`);

    // Get event details
    const event = await prisma.event.findUnique({
      where: { id: eventId }
    });

    if (!event) {
      console.error(`❌ Event not found: ${eventId}`);
      return;
    }

    if (!event.approvedBudget) {
      console.error(`❌ Event budget not approved yet`);
      return;
    }

    // Find the journal entry
    const journalEntry = await prisma.journalEntry.findFirst({
      where: {
        referenceNumber: {
          startsWith: `BUDGET-${eventId}`
        }
      },
      include: {
        journalEntryLines: true
      }
    });

    if (!journalEntry) {
      console.error(`❌ Journal entry not found`);
      return;
    }

    console.log(`📝 Found journal entry: ${journalEntry.referenceNumber}`);
    console.log(`   Current lines: ${journalEntry.journalEntryLines.length}`);
    console.log(`   Approved budget: ${event.approvedBudget}\n`);

    if (journalEntry.journalEntryLines.length > 0) {
      console.log(`✅ Journal entry already has lines. No fix needed.\n`);
      return;
    }

    // Get or create accounts
    let eventBudgetAccount = await prisma.chartOfAccounts.findFirst({
      where: { 
        accountName: 'Event Budget Allocation',
        accountType: 'ASSET'
      }
    });

    if (!eventBudgetAccount) {
      eventBudgetAccount = await prisma.chartOfAccounts.create({
        data: {
          accountNo: 'EBA-001',
          accountName: 'Event Budget Allocation',
          accountType: 'ASSET',
          financialStatement: 'BALANCE_SHEET',
          notes: 'Allocated budget for events',
          isActive: true
        }
      });
      console.log(`✅ Created Event Budget Allocation account`);
    }

    let cashAccount = await prisma.chartOfAccounts.findFirst({
      where: { 
        accountName: 'Cash',
        accountType: 'ASSET'
      }
    });

    if (!cashAccount) {
      cashAccount = await prisma.chartOfAccounts.create({
        data: {
          accountNo: 'CASH-001',
          accountName: 'Cash',
          accountType: 'ASSET',
          financialStatement: 'BALANCE_SHEET',
          notes: 'Cash on hand',
          isActive: true
        }
      });
      console.log(`✅ Created Cash account`);
    }

    const approvedBudget = Number(event.approvedBudget);

    // Create journal entry lines
    console.log(`\n📋 Creating journal entry lines...\n`);

    // 1. Debit Event Budget Account
    const line1 = await prisma.journalEntryLine.create({
      data: {
        journalEntryId: journalEntry.id,
        chartOfAccountId: eventBudgetAccount.id,
        debitAmount: new Decimal(approvedBudget),
        creditAmount: new Decimal(0),
        description: `Event Budget Allocation: ${event.title}`,
        vatAmount: new Decimal(0)
      }
    });
    console.log(`✅ Created Line 1: Debit Event Budget Allocation - $${approvedBudget}`);

    // 2. Credit Cash Account
    const line2 = await prisma.journalEntryLine.create({
      data: {
        journalEntryId: journalEntry.id,
        chartOfAccountId: cashAccount.id,
        debitAmount: new Decimal(0),
        creditAmount: new Decimal(approvedBudget),
        description: `Budget allocation from cash/bank for event: ${event.title}`,
        vatAmount: new Decimal(0)
      }
    });
    console.log(`✅ Created Line 2: Credit Cash - $${approvedBudget}`);

    console.log(`\n✨ Journal entry fixed successfully!\n`);
    console.log(`   Total Debits: $${approvedBudget}`);
    console.log(`   Total Credits: $${approvedBudget}`);
    console.log(`   ✅ Balanced\n`);

  } catch (error: any) {
    console.error('❌ Error fixing journal entry:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get event ID from command line argument
const eventId = process.argv[2];

if (!eventId) {
  console.error('❌ Please provide an event ID');
  console.log('Usage: npx ts-node scripts/fix-incomplete-journal-entry.ts <eventId>');
  process.exit(1);
}

fixIncompleteJournalEntry(eventId);

