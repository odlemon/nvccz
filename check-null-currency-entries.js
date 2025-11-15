const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkNullCurrencyEntries() {
  console.log('🔍 CHECKING ENTRIES WITH NULL CURRENCY\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  const yearStart = new Date('2025-01-01');
  yearStart.setHours(0, 0, 0, 0);
  const yearEnd = new Date('2025-12-31');
  yearEnd.setHours(23, 59, 59, 999);

  // Get accounts with differences
  const account1000 = await prisma.chartOfAccounts.findFirst({ where: { accountNo: '1000' } });
  const account1100 = await prisma.chartOfAccounts.findFirst({ where: { accountNo: '1100' } });

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
    ],
    currencyId: null // Entries with NULL currency
  };

  // Check Account 1000
  console.log('Account 1000 (Cash and Cash Equivalents) - NULL Currency Entries:\n');
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
          currencyId: true
        }
      }
    }
  });

  if (lines1000.length > 0) {
    let totalDebits = 0;
    let totalCredits = 0;
    
    lines1000.forEach(line => {
      const debit = parseFloat(line.debitAmount.toString());
      const credit = parseFloat(line.creditAmount.toString());
      totalDebits += debit;
      totalCredits += credit;
      
      console.log(`${line.journalEntry.transactionDate.toISOString().split('T')[0]} - ${line.journalEntry.referenceNumber}`);
      console.log(`   ${line.journalEntry.description}`);
      console.log(`   Debit: ${debit.toFixed(2)}, Credit: ${credit.toFixed(2)}`);
      console.log('');
    });
    
    console.log(`Total: Debits ${totalDebits.toFixed(2)}, Credits ${totalCredits.toFixed(2)}\n`);
  } else {
    console.log('✅ No entries with NULL currency found\n');
  }

  // Check Account 1100
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Account 1100 (Office Equipment) - NULL Currency Entries:\n');
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
          currencyId: true
        }
      }
    }
  });

  if (lines1100.length > 0) {
    let totalDebits = 0;
    let totalCredits = 0;
    
    lines1100.forEach(line => {
      const debit = parseFloat(line.debitAmount.toString());
      const credit = parseFloat(line.creditAmount.toString());
      totalDebits += debit;
      totalCredits += credit;
      
      console.log(`${line.journalEntry.transactionDate.toISOString().split('T')[0]} - ${line.journalEntry.referenceNumber}`);
      console.log(`   ${line.journalEntry.description}`);
      console.log(`   Debit: ${debit.toFixed(2)}, Credit: ${credit.toFixed(2)}`);
      console.log('');
    });
    
    console.log(`Total: Debits ${totalDebits.toFixed(2)}, Credits ${totalCredits.toFixed(2)}\n`);
  } else {
    console.log('✅ No entries with NULL currency found\n');
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('SUMMARY:');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('Trial Balance includes entries with NULL currency');
  console.log('General Ledger Detail EXCLUDES entries with NULL currency');
  console.log('\nThis is why there is a difference!\n');

  await prisma.$disconnect();
}

checkNullCurrencyEntries();

