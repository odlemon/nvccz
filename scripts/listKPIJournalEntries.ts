import { prisma } from '../src/utils/database';

async function listKPIJournalEntries() {
  const entries = await prisma.journalEntry.findMany({
    where: {
      description: {
        contains: 'KPI Achievement'
      }
    },
    select: {
      id: true,
      description: true,
      transactionDate: true,
      status: true,
      totalAmount: true,
      journalEntryLines: {
        select: {
          chartOfAccount: {
            select: {
              accountNo: true,
              accountName: true
            }
          },
          debitAmount: true,
          creditAmount: true
        }
      }
    }
  });

  console.log(JSON.stringify(entries, null, 2));
}

listKPIJournalEntries()
  .catch((error) => {
    console.error('Failed to list KPI journal entries', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

