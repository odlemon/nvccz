const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function investigateAccount1000() {
  let token = '';

  console.log('🔍 INVESTIGATING ACCOUNT 1000 (Cash and Cash Equivalents)\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Login
  try {
    const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    token = loginRes.data.token;
    console.log('✅ Login successful\n');
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    return;
  }

  // Get Account 1000 details
  console.log('═══════════════════════════════════════════════════════════');
  console.log('STEP 1: Account Details');
  console.log('═══════════════════════════════════════════════════════════\n');

  const account = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: '1000' }
  });

  if (!account) {
    console.error('❌ Account 1000 not found!');
    await prisma.$disconnect();
    return;
  }

  console.log(`Account Number: ${account.accountNo}`);
  console.log(`Account Name: ${account.accountName}`);
  console.log(`Account Type: ${account.accountType}`);
  console.log(`Is Active: ${account.isActive}\n`);

  // Get all journal entry lines for this account
  console.log('═══════════════════════════════════════════════════════════');
  console.log('STEP 2: All Journal Entry Lines for Account 1000');
  console.log('═══════════════════════════════════════════════════════════\n');

  const allLinesRaw = await prisma.journalEntryLine.findMany({
    where: {
      chartOfAccountId: account.id
    },
    select: {
      id: true,
      debitAmount: true,
      creditAmount: true,
      journalEntry: {
        select: {
          id: true,
          referenceNumber: true,
          transactionDate: true,
          status: true,
          description: true,
          currencyId: true,
          cashbookEntries: {
            select: {
              id: true,
              type: true,
              status: true,
              reversedAt: true,
              amount: true,
              description: true
            }
          }
        }
      }
    },
    orderBy: {
      journalEntry: {
        transactionDate: 'asc'
      }
    }
  });

  // Filter out entries with null currency
  const allLines = allLinesRaw.filter(line => line.journalEntry.currencyId !== null);

  console.log(`Total Journal Entry Lines (with currency): ${allLines.length}`);
  console.log(`Total Journal Entry Lines (all): ${allLinesRaw.length}\n`);

  let totalDebits = 0;
  let totalCredits = 0;
  let postedDebits = 0;
  let postedCredits = 0;
  let pendingDebits = 0;
  let pendingCredits = 0;
  let voidedDebits = 0;
  let voidedCredits = 0;

  const largeTransactions = [];
  const voidedTransactions = [];
  const reversedTransactions = [];

  allLines.forEach(line => {
    const debit = parseFloat(line.debitAmount.toString());
    const credit = parseFloat(line.creditAmount.toString());
    
    totalDebits += debit;
    totalCredits += credit;

    const je = line.journalEntry;
    const status = je.status;
    const hasVoidedCashbook = je.cashbookEntries && je.cashbookEntries.some(cb => cb.status === 'VOIDED' || cb.reversedAt !== null);
    const isReversal = je.referenceNumber?.startsWith('VR-') || je.referenceNumber?.startsWith('REV-');

    if (status === 'POSTED') {
      postedDebits += debit;
      postedCredits += credit;
    } else if (status === 'PENDING') {
      pendingDebits += debit;
      pendingCredits += credit;
    } else if (status === 'VOID') {
      voidedDebits += debit;
      voidedCredits += credit;
    }

    // Track large transactions (> 1M)
    if (debit > 1000000 || credit > 1000000) {
      largeTransactions.push({
        date: je.transactionDate,
        ref: je.referenceNumber,
        description: je.description,
        status: je.status,
        currencyId: je.currencyId || 'N/A',
        debit: debit,
        credit: credit,
        hasVoidedCashbook: hasVoidedCashbook,
        isReversal: isReversal,
        cashbookEntries: je.cashbookEntries.length
      });
    }

    // Track voided transactions
    if (hasVoidedCashbook || status === 'VOID') {
      voidedTransactions.push({
        date: je.transactionDate,
        ref: je.referenceNumber,
        description: je.description,
        status: je.status,
        debit: debit,
        credit: credit,
        cashbookStatus: je.cashbookEntries.map(cb => cb.status).join(', ')
      });
    }

    // Track reversal transactions
    if (isReversal) {
      reversedTransactions.push({
        date: je.transactionDate,
        ref: je.referenceNumber,
        description: je.description,
        status: je.status,
        debit: debit,
        credit: credit
      });
    }
  });

  console.log('Summary:');
  console.log(`   Total Debits: ${totalDebits.toFixed(2)}`);
  console.log(`   Total Credits: ${totalCredits.toFixed(2)}`);
  console.log(`   Net Balance: ${(totalDebits - totalCredits).toFixed(2)}\n`);

  console.log('By Status:');
  console.log(`   POSTED - Debits: ${postedDebits.toFixed(2)}, Credits: ${postedCredits.toFixed(2)}, Net: ${(postedDebits - postedCredits).toFixed(2)}`);
  console.log(`   PENDING - Debits: ${pendingDebits.toFixed(2)}, Credits: ${pendingCredits.toFixed(2)}, Net: ${(pendingDebits - pendingCredits).toFixed(2)}`);
  console.log(`   VOID - Debits: ${voidedDebits.toFixed(2)}, Credits: ${voidedCredits.toFixed(2)}, Net: ${(voidedDebits - voidedCredits).toFixed(2)}\n`);

  // Show large transactions
  if (largeTransactions.length > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`STEP 3: Large Transactions (> 1M) - ${largeTransactions.length} found`);
    console.log('═══════════════════════════════════════════════════════════\n');

    largeTransactions.sort((a, b) => {
      const aAmount = Math.max(a.debit, a.credit);
      const bAmount = Math.max(b.debit, b.credit);
      return bAmount - aAmount;
    });

    largeTransactions.forEach((txn, idx) => {
      console.log(`${idx + 1}. ${txn.date.toISOString().split('T')[0]} - ${txn.ref}`);
      console.log(`   Description: ${txn.description}`);
      console.log(`   Status: ${txn.status} | Currency ID: ${txn.currencyId || 'N/A'}`);
      console.log(`   Debit: ${txn.debit.toFixed(2)} | Credit: ${txn.credit.toFixed(2)}`);
      console.log(`   Has Voided Cashbook: ${txn.hasVoidedCashbook} | Is Reversal: ${txn.isReversal}`);
      console.log(`   Cashbook Entries: ${txn.cashbookEntries}`);
      console.log('');
    });
  }

  // Show voided transactions
  if (voidedTransactions.length > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`STEP 4: Voided/Reversed Transactions - ${voidedTransactions.length} found`);
    console.log('═══════════════════════════════════════════════════════════\n');

    voidedTransactions.slice(0, 10).forEach((txn, idx) => {
      console.log(`${idx + 1}. ${txn.date.toISOString().split('T')[0]} - ${txn.ref}`);
      console.log(`   Description: ${txn.description}`);
      console.log(`   Status: ${txn.status} | Cashbook Status: ${txn.cashbookStatus}`);
      console.log(`   Debit: ${txn.debit.toFixed(2)} | Credit: ${txn.credit.toFixed(2)}`);
      console.log('');
    });
    if (voidedTransactions.length > 10) {
      console.log(`... and ${voidedTransactions.length - 10} more voided transactions\n`);
    }
  }

  // Show reversal transactions
  if (reversedTransactions.length > 0) {
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`STEP 5: Reversal Transactions (VR-/REV-) - ${reversedTransactions.length} found`);
    console.log('═══════════════════════════════════════════════════════════\n');

    reversedTransactions.slice(0, 10).forEach((txn, idx) => {
      console.log(`${idx + 1}. ${txn.date.toISOString().split('T')[0]} - ${txn.ref}`);
      console.log(`   Description: ${txn.description}`);
      console.log(`   Status: ${txn.status}`);
      console.log(`   Debit: ${txn.debit.toFixed(2)} | Credit: ${txn.credit.toFixed(2)}`);
      console.log('');
    });
    if (reversedTransactions.length > 10) {
      console.log(`... and ${reversedTransactions.length - 10} more reversal transactions\n`);
    }
  }

  // Get filtered totals (matching Trial Balance filters)
  console.log('═══════════════════════════════════════════════════════════');
  console.log('STEP 6: Filtered Totals (Trial Balance Filters)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const filteredLines = await prisma.journalEntryLine.findMany({
    where: {
      chartOfAccountId: account.id,
      journalEntry: {
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
        referenceNumber: {
          not: {
            startsWith: 'VR-'
          }
        }
      }
    },
    select: {
      debitAmount: true,
      creditAmount: true,
      journalEntry: {
        select: {
          transactionDate: true,
          referenceNumber: true,
          description: true,
          status: true
        }
      }
    }
  });

  let filteredDebits = 0;
  let filteredCredits = 0;
  filteredLines.forEach(line => {
    filteredDebits += parseFloat(line.debitAmount.toString());
    filteredCredits += parseFloat(line.creditAmount.toString());
  });

  console.log(`Filtered Journal Entry Lines: ${filteredLines.length}`);
  console.log(`   Total Debits: ${filteredDebits.toFixed(2)}`);
  console.log(`   Total Credits: ${filteredCredits.toFixed(2)}`);
  console.log(`   Net Balance: ${(filteredDebits - filteredCredits).toFixed(2)}\n`);

  // Show recent transactions
  console.log('═══════════════════════════════════════════════════════════');
  console.log('STEP 7: Recent Transactions (Last 20)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const recentLines = allLines.slice(-20).reverse();
  recentLines.forEach((line, idx) => {
    const je = line.journalEntry;
    const debit = parseFloat(line.debitAmount.toString());
    const credit = parseFloat(line.creditAmount.toString());
    const hasVoidedCashbook = je.cashbookEntries.some(cb => cb.status === 'VOIDED' || cb.reversedAt !== null);
    const isReversal = je.referenceNumber?.startsWith('VR-') || je.referenceNumber?.startsWith('REV-');

    console.log(`${idx + 1}. ${je.transactionDate.toISOString().split('T')[0]} - ${je.referenceNumber}`);
    console.log(`   Description: ${je.description}`);
    console.log(`   Status: ${je.status} | Currency: ${je.currency?.code || 'N/A'}`);
    console.log(`   Debit: ${debit.toFixed(2)} | Credit: ${credit.toFixed(2)}`);
    console.log(`   Voided Cashbook: ${hasVoidedCashbook} | Is Reversal: ${isReversal}`);
    console.log('');
  });

  await prisma.$disconnect();

  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ INVESTIGATION COMPLETE');
  console.log('═══════════════════════════════════════════════════════════\n');
}

investigateAccount1000();

