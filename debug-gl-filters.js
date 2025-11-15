const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function debugGLFilters() {
  let token = '';

  console.log('🔍 DEBUGGING GL DETAIL FILTERS\n');
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

  const yearStart = new Date('2025-01-01');
  const yearEnd = new Date('2025-12-31');

  console.log('Testing different filter combinations...\n');

  // Test 1: All entries (no filters)
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST 1: All entries (no filters)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const allEntries = await prisma.journalEntryLine.findMany({
    where: {
      journalEntry: {
        transactionDate: {
          gte: yearStart,
          lte: yearEnd
        }
      }
    },
    select: {
      debitAmount: true,
      creditAmount: true
    }
  });

  let allDebits = 0;
  let allCredits = 0;
  allEntries.forEach(line => {
    allDebits += parseFloat(line.debitAmount.toString());
    allCredits += parseFloat(line.creditAmount.toString());
  });

  console.log(`Total Entries: ${allEntries.length}`);
  console.log(`Total Debits: ${allDebits.toFixed(2)}`);
  console.log(`Total Credits: ${allCredits.toFixed(2)}\n`);

  // Test 2: Only POSTED
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST 2: Only POSTED entries');
  console.log('═══════════════════════════════════════════════════════════\n');

  const postedEntries = await prisma.journalEntryLine.findMany({
    where: {
      journalEntry: {
        transactionDate: {
          gte: yearStart,
          lte: yearEnd
        },
        status: 'POSTED'
      }
    },
    select: {
      debitAmount: true,
      creditAmount: true
    }
  });

  let postedDebits = 0;
  let postedCredits = 0;
  postedEntries.forEach(line => {
    postedDebits += parseFloat(line.debitAmount.toString());
    postedCredits += parseFloat(line.creditAmount.toString());
  });

  console.log(`POSTED Entries: ${postedEntries.length}`);
  console.log(`Total Debits: ${postedDebits.toFixed(2)}`);
  console.log(`Total Credits: ${postedCredits.toFixed(2)}\n`);

  // Test 3: POSTED + exclude VR- and REV-
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST 3: POSTED + exclude VR- and REV-');
  console.log('═══════════════════════════════════════════════════════════\n');

  const noReversalEntries = await prisma.journalEntryLine.findMany({
    where: {
      journalEntry: {
        transactionDate: {
          gte: yearStart,
          lte: yearEnd
        },
        status: 'POSTED',
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
      }
    },
    select: {
      debitAmount: true,
      creditAmount: true
    }
  });

  let noReversalDebits = 0;
  let noReversalCredits = 0;
  noReversalEntries.forEach(line => {
    noReversalDebits += parseFloat(line.debitAmount.toString());
    noReversalCredits += parseFloat(line.creditAmount.toString());
  });

  console.log(`No Reversal Entries: ${noReversalEntries.length}`);
  console.log(`Total Debits: ${noReversalDebits.toFixed(2)}`);
  console.log(`Total Credits: ${noReversalCredits.toFixed(2)}\n`);

  // Test 4: POSTED + exclude voided/reversed cashbook
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST 4: POSTED + exclude voided/reversed cashbook');
  console.log('═══════════════════════════════════════════════════════════\n');

  const noVoidedCashbookEntries = await prisma.journalEntryLine.findMany({
    where: {
      journalEntry: {
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
        }
      }
    },
    select: {
      debitAmount: true,
      creditAmount: true
    }
  });

  let noVoidedDebits = 0;
  let noVoidedCredits = 0;
  noVoidedCashbookEntries.forEach(line => {
    noVoidedDebits += parseFloat(line.debitAmount.toString());
    noVoidedCredits += parseFloat(line.creditAmount.toString());
  });

  console.log(`No Voided Cashbook Entries: ${noVoidedCashbookEntries.length}`);
  console.log(`Total Debits: ${noVoidedDebits.toFixed(2)}`);
  console.log(`Total Credits: ${noVoidedCredits.toFixed(2)}\n`);

  // Test 5: All filters combined (what GL Detail uses now)
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST 5: All filters combined (GL Detail current)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const allFiltersEntries = await prisma.journalEntryLine.findMany({
    where: {
      journalEntry: {
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
      }
    },
    select: {
      debitAmount: true,
      creditAmount: true
    }
  });

  let allFiltersDebits = 0;
  let allFiltersCredits = 0;
  allFiltersEntries.forEach(line => {
    allFiltersDebits += parseFloat(line.debitAmount.toString());
    allFiltersCredits += parseFloat(line.creditAmount.toString());
  });

  console.log(`All Filters Entries: ${allFiltersEntries.length}`);
  console.log(`Total Debits: ${allFiltersDebits.toFixed(2)}`);
  console.log(`Total Credits: ${allFiltersCredits.toFixed(2)}\n`);

  // Test 6: Trial Balance filter (lte endOfDay, not gte startDate)
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST 6: Trial Balance filter (lte endOfDay only)');
  console.log('═══════════════════════════════════════════════════════════\n');

  const endOfDay = new Date(yearEnd);
  endOfDay.setHours(23, 59, 59, 999);

  const tbFilterEntries = await prisma.journalEntryLine.findMany({
    where: {
      journalEntry: {
        transactionDate: {
          lte: endOfDay
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
        referenceNumber: {
          not: {
            startsWith: 'VR-'
          }
        }
      }
    },
    select: {
      debitAmount: true,
      creditAmount: true
    }
  });

  let tbDebits = 0;
  let tbCredits = 0;
  tbFilterEntries.forEach(line => {
    tbDebits += parseFloat(line.debitAmount.toString());
    tbCredits += parseFloat(line.creditAmount.toString());
  });

  console.log(`Trial Balance Filter Entries: ${tbFilterEntries.length}`);
  console.log(`Total Debits: ${tbDebits.toFixed(2)}`);
  console.log(`Total Credits: ${tbCredits.toFixed(2)}\n`);

  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('Difference from All Entries:');
  console.log(`   POSTED only: ${(allDebits - postedDebits).toFixed(2)} debits excluded`);
  console.log(`   No Reversals: ${(postedDebits - noReversalDebits).toFixed(2)} debits excluded`);
  console.log(`   No Voided Cashbook: ${(postedDebits - noVoidedDebits).toFixed(2)} debits excluded`);
  console.log(`   All Filters: ${(allDebits - allFiltersDebits).toFixed(2)} debits excluded`);
  console.log(`   TB Filter: ${(allDebits - tbDebits).toFixed(2)} debits excluded\n`);

  await prisma.$disconnect();
}

debugGLFilters();

