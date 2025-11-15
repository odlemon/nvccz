const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findDifferenceTransactions() {
  console.log('🔍 FINDING SPECIFIC TRANSACTIONS CAUSING DIFFERENCES\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  const yearStart = new Date('2025-01-01');
  yearStart.setHours(0, 0, 0, 0);
  const yearEnd = new Date('2025-12-31');
  yearEnd.setHours(23, 59, 59, 999);

  // Get the accounts with differences
  const account1000 = await prisma.chartOfAccounts.findFirst({ where: { accountNo: '1000' } });
  const account1100 = await prisma.chartOfAccounts.findFirst({ where: { accountNo: '1100' } });
  const account1300 = await prisma.chartOfAccounts.findFirst({ where: { accountNo: '1300' } });
  const account5010 = await prisma.chartOfAccounts.findFirst({ where: { accountNo: '5010' } });

  // Common filter
  const commonFilter = {
    transactionDate: {
      gte: yearStart,
      lte: yearEnd
    },
    status: 'POSTED',
    NOT: {
      cashbookEntries: {
        some: {
          OR: [
            { status: 'VOIDED' },
            { reversedAt: { not: null } }
          ]
        }
      }
    },
    AND: [
      {
        referenceNumber: {
          not: {
            startsWith: 'VR-'
          }
        }
      },
      {
        referenceNumber: {
          not: {
            startsWith: 'REV-'
          }
        }
      }
    ]
  };

  // Get all lines for Account 1000
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Account 1000 (Cash and Cash Equivalents) - All Transactions');
  console.log('═══════════════════════════════════════════════════════════\n');

  const lines1000 = await prisma.journalEntryLine.findMany({
    where: {
      chartOfAccountId: account1000.id,
      journalEntry: commonFilter
    },
    include: {
      journalEntry: {
        select: {
          id: true,
          referenceNumber: true,
          transactionDate: true,
          description: true,
          status: true,
          currencyId: true
        }
      }
    },
    orderBy: {
      journalEntry: {
        transactionDate: 'asc'
      }
    }
  });

  let tb1000Credits = 0;
  lines1000.forEach(line => {
    const credit = parseFloat(line.creditAmount.toString());
    if (credit > 0) {
      tb1000Credits += credit;
      console.log(`${line.journalEntry.transactionDate.toISOString().split('T')[0]} - ${line.journalEntry.referenceNumber}`);
      console.log(`   ${line.journalEntry.description}`);
      console.log(`   Credit: ${credit.toFixed(2)}`);
      console.log('');
    }
  });

  console.log(`Total Credits (TB method): ${tb1000Credits.toFixed(2)}\n`);

  // Get all lines for Account 1100
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Account 1100 (Office Equipment) - All Transactions');
  console.log('═══════════════════════════════════════════════════════════\n');

  const lines1100 = await prisma.journalEntryLine.findMany({
    where: {
      chartOfAccountId: account1100.id,
      journalEntry: commonFilter
    },
    include: {
      journalEntry: {
        select: {
          id: true,
          referenceNumber: true,
          transactionDate: true,
          description: true,
          status: true,
          currencyId: true
        }
      }
    },
    orderBy: {
      journalEntry: {
        transactionDate: 'asc'
      }
    }
  });

  let tb1100Debits = 0;
  lines1100.forEach(line => {
    const debit = parseFloat(line.debitAmount.toString());
    if (debit > 0) {
      tb1100Debits += debit;
      console.log(`${line.journalEntry.transactionDate.toISOString().split('T')[0]} - ${line.journalEntry.referenceNumber}`);
      console.log(`   ${line.journalEntry.description}`);
      console.log(`   Debit: ${debit.toFixed(2)}`);
      console.log('');
    }
  });

  console.log(`Total Debits (TB method): ${tb1100Debits.toFixed(2)}\n`);

  // Check for currency filtering differences
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Checking for Currency Filter Differences');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Check if GL Detail filters by currency
  const lines1000WithCurrency = await prisma.journalEntryLine.findMany({
    where: {
      chartOfAccountId: account1000.id,
      journalEntry: {
        ...commonFilter,
        currencyId: {
          not: null
        }
      }
    },
    include: {
      journalEntry: {
        select: {
          currencyId: true,
          referenceNumber: true
        }
      }
    }
  });

  const lines1000WithoutCurrency = await prisma.journalEntryLine.findMany({
    where: {
      chartOfAccountId: account1000.id,
      journalEntry: {
        ...commonFilter,
        currencyId: null
      }
    },
    include: {
      journalEntry: {
        select: {
          currencyId: true,
          referenceNumber: true
        }
      }
    }
  });

  console.log(`Account 1000 lines with currency: ${lines1000WithCurrency.length}`);
  console.log(`Account 1000 lines without currency: ${lines1000WithoutCurrency.length}\n`);

  if (lines1000WithoutCurrency.length > 0) {
    console.log('⚠️  Found entries with NULL currency:');
    lines1000WithoutCurrency.forEach(line => {
      const credit = parseFloat(line.creditAmount.toString());
      const debit = parseFloat(line.debitAmount.toString());
      console.log(`   ${line.journalEntry.referenceNumber}: Debit ${debit.toFixed(2)}, Credit ${credit.toFixed(2)}`);
    });
    console.log('');
  }

  // Check for entries that might be filtered differently
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Checking for Entries with NULL Currency');
  console.log('═══════════════════════════════════════════════════════════\n');

  const nullCurrencyEntries = await prisma.journalEntry.findMany({
    where: {
      ...commonFilter,
      currencyId: null
    },
    include: {
      journalEntryLines: {
        where: {
          chartOfAccountId: {
            in: [account1000.id, account1100.id, account1300.id, account5010.id]
          }
        },
        include: {
          chartOfAccount: {
            select: {
              accountNo: true,
              accountName: true
            }
          }
        }
      }
    }
  });

  if (nullCurrencyEntries.length > 0) {
    console.log(`Found ${nullCurrencyEntries.length} entries with NULL currency affecting these accounts:\n`);
    nullCurrencyEntries.forEach(je => {
      console.log(`${je.referenceNumber} - ${je.description}`);
      je.journalEntryLines.forEach(line => {
        const debit = parseFloat(line.debitAmount.toString());
        const credit = parseFloat(line.creditAmount.toString());
        console.log(`   ${line.chartOfAccount.accountNo} (${line.chartOfAccount.accountName}): Debit ${debit.toFixed(2)}, Credit ${credit.toFixed(2)}`);
      });
      console.log('');
    });
  } else {
    console.log('✅ No entries with NULL currency found\n');
  }

  await prisma.$disconnect();
}

findDifferenceTransactions();

