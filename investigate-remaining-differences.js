const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function investigateRemainingDifferences() {
  let token = '';

  console.log('🔍 INVESTIGATING REMAINING DIFFERENCES\n');
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

  const today = new Date();
  const asOfDate = today.toISOString().split('T')[0];
  const yearStart = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
  const yearEnd = new Date(today.getFullYear(), 11, 31).toISOString().split('T')[0];

  // Get currencies
  let currencyId = null;
  try {
    const currenciesRes = await axios.get(`${BASE_URL}/api/accounting/currencies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const currencies = currenciesRes.data.data || [];
    const defaultCurrency = currencies.find(c => c.isDefault) || currencies[0];
    currencyId = defaultCurrency.id;
    console.log(`💱 Using currency: ${defaultCurrency.code} (ID: ${currencyId})\n`);
  } catch (error) {
    console.error('⚠️  Could not get currencies:', error.message);
    return;
  }

  // Compare date ranges
  console.log('═══════════════════════════════════════════════════════════');
  console.log('STEP 1: Date Range Comparison');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log(`Trial Balance uses: asOfDate = ${asOfDate} (includes ALL entries up to today)`);
  console.log(`General Ledger uses: startDate = ${yearStart}, endDate = ${yearEnd} (only entries within year)\n`);

  // Check entries before year start
  const entriesBeforeYear = await prisma.journalEntryLine.count({
    where: {
      journalEntry: {
        transactionDate: {
          lt: new Date(yearStart)
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
    }
  });

  console.log(`Entries before ${yearStart}: ${entriesBeforeYear}`);
  console.log(`These are included in Trial Balance but NOT in General Ledger\n`);

  // Get totals for entries before year start
  const linesBeforeYear = await prisma.journalEntryLine.findMany({
    where: {
      journalEntry: {
        transactionDate: {
          lt: new Date(yearStart)
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

  let beforeYearDebits = 0;
  let beforeYearCredits = 0;
  linesBeforeYear.forEach(line => {
    beforeYearDebits += parseFloat(line.debitAmount.toString());
    beforeYearCredits += parseFloat(line.creditAmount.toString());
  });

  console.log(`Totals for entries before ${yearStart}:`);
  console.log(`   Debits: ${beforeYearDebits.toFixed(2)}`);
  console.log(`   Credits: ${beforeYearCredits.toFixed(2)}`);
  console.log(`   Net: ${(beforeYearDebits - beforeYearCredits).toFixed(2)}\n`);

  // Check cash accounts specifically
  console.log('═══════════════════════════════════════════════════════════');
  console.log('STEP 2: Cash Account Differences');
  console.log('═══════════════════════════════════════════════════════════\n');

  const account1000 = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: '1000' }
  });

  if (account1000) {
    // Trial Balance filter (lte asOfDate)
    const tbLines = await prisma.journalEntryLine.findMany({
      where: {
        chartOfAccountId: account1000.id,
        journalEntry: {
          transactionDate: {
            lte: new Date(today.setHours(23, 59, 59, 999))
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

    let tbDebits = 0;
    let tbCredits = 0;
    tbLines.forEach(line => {
      tbDebits += parseFloat(line.debitAmount.toString());
      tbCredits += parseFloat(line.creditAmount.toString());
    });

    // GL Detail filter (gte yearStart, lte yearEnd)
    const glLines = await prisma.journalEntryLine.findMany({
      where: {
        chartOfAccountId: account1000.id,
        journalEntry: {
          transactionDate: {
            gte: new Date(yearStart),
            lte: new Date(yearEnd)
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

    let glDebits = 0;
    let glCredits = 0;
    glLines.forEach(line => {
      glDebits += parseFloat(line.debitAmount.toString());
      glCredits += parseFloat(line.creditAmount.toString());
    });

    console.log('Account 1000 (Cash and Cash Equivalents):');
    console.log(`   Trial Balance (up to ${asOfDate}):`);
    console.log(`      Debits: ${tbDebits.toFixed(2)}, Credits: ${tbCredits.toFixed(2)}, Net: ${(tbDebits - tbCredits).toFixed(2)}`);
    console.log(`   General Ledger (${yearStart} to ${yearEnd}):`);
    console.log(`      Debits: ${glDebits.toFixed(2)}, Credits: ${glCredits.toFixed(2)}, Net: ${(glDebits - glCredits).toFixed(2)}`);
    console.log(`   Difference: ${((tbDebits - tbCredits) - (glDebits - glCredits)).toFixed(2)}\n`);

    // Check Balance Sheet filter
    const bsLines = await prisma.journalEntryLine.findMany({
      where: {
        chartOfAccountId: account1000.id,
        journalEntry: {
          transactionDate: {
            lte: new Date(today.setHours(23, 59, 59, 999))
          },
          status: 'POSTED',
          currencyId: currencyId, // Balance Sheet filters by currency!
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

    let bsDebits = 0;
    let bsCredits = 0;
    bsLines.forEach(line => {
      bsDebits += parseFloat(line.debitAmount.toString());
      bsCredits += parseFloat(line.creditAmount.toString());
    });

    console.log(`   Balance Sheet (up to ${asOfDate}, currency ${currencyId}):`);
    console.log(`      Debits: ${bsDebits.toFixed(2)}, Credits: ${bsCredits.toFixed(2)}, Net: ${(bsDebits - bsCredits).toFixed(2)}\n`);

    console.log('Key Differences:');
    console.log(`   TB vs GL: ${((tbDebits - tbCredits) - (glDebits - glCredits)).toFixed(2)} (date range difference)`);
    console.log(`   TB vs BS: ${((tbDebits - tbCredits) - (bsDebits - bsCredits)).toFixed(2)} (currency filter difference)`);
    console.log(`   GL vs BS: ${((glDebits - glCredits) - (bsDebits - bsCredits)).toFixed(2)} (date range + currency filter difference)\n`);
  }

  await prisma.$disconnect();
}

investigateRemainingDifferences();

