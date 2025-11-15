const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function investigateDifference() {
  try {
    console.log('🔍 Investigating Trial Balance vs General Ledger Difference\n');

    const startDate = new Date('2025-01-01');
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date('2025-12-31');
    endDate.setHours(23, 59, 59, 999);

    console.log(`📅 Date Range: ${startDate.toISOString()} to ${endDate.toISOString()}\n`);

    // Get all accounts
    const accounts = await prisma.chartOfAccounts.findMany({
      where: { isActive: true },
      orderBy: { accountNo: 'asc' }
    });

    console.log(`✅ Found ${accounts.length} accounts\n`);

    // Check journal entry filtering for both services
    const journalEntryWhere = {
      transactionDate: {
        gte: startDate,
        lte: endDate
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

    // Get all journal entry lines matching TB filter
    const tbLines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: journalEntryWhere
      },
      select: {
        chartOfAccountId: true,
        debitAmount: true,
        creditAmount: true,
        journalEntry: {
          select: {
            currencyId: true
          }
        }
      }
    });

    // Filter out null currency
    const tbLinesFiltered = tbLines.filter(line => line.journalEntry.currencyId !== null);

    console.log(`📊 Trial Balance Method:`);
    console.log(`   Total Lines: ${tbLinesFiltered.length}`);
    
    let tbTotalDebits = 0;
    let tbTotalCredits = 0;
    for (const line of tbLinesFiltered) {
      tbTotalDebits += parseFloat(line.debitAmount.toString());
      tbTotalCredits += parseFloat(line.creditAmount.toString());
    }
    console.log(`   Total Debits: ${tbTotalDebits.toFixed(2)}`);
    console.log(`   Total Credits: ${tbTotalCredits.toFixed(2)}\n`);

    // Now check GL Detail method - account by account
    console.log(`📋 General Ledger Method (account by account):`);
    
    let glTotalDebits = 0;
    let glTotalCredits = 0;
    let accountsWithDifferences = [];

    for (const account of accounts) {
      const glLines = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: account.id,
          journalEntry: journalEntryWhere
        },
        select: {
          debitAmount: true,
          creditAmount: true,
          journalEntry: {
            select: {
              currencyId: true
            }
          }
        }
      });

      // Filter out null currency
      const glLinesFiltered = glLines.filter(line => line.journalEntry.currencyId !== null);

      let accountDebits = 0;
      let accountCredits = 0;
      for (const line of glLinesFiltered) {
        accountDebits += parseFloat(line.debitAmount.toString());
        accountCredits += parseFloat(line.creditAmount.toString());
      }

      glTotalDebits += accountDebits;
      glTotalCredits += accountCredits;

      // Check if this account has transactions in TB
      const tbAccountLines = tbLinesFiltered.filter(line => line.chartOfAccountId === account.id);
      let tbAccountDebits = 0;
      let tbAccountCredits = 0;
      for (const line of tbAccountLines) {
        tbAccountDebits += parseFloat(line.debitAmount.toString());
        tbAccountCredits += parseFloat(line.creditAmount.toString());
      }

      if (Math.abs(accountDebits - tbAccountDebits) > 0.01 || Math.abs(accountCredits - tbAccountCredits) > 0.01) {
        accountsWithDifferences.push({
          accountNo: account.accountNo,
          accountName: account.accountName,
          glDebits: accountDebits,
          glCredits: accountCredits,
          tbDebits: tbAccountDebits,
          tbCredits: tbAccountCredits,
          debitDiff: accountDebits - tbAccountDebits,
          creditDiff: accountCredits - tbAccountCredits
        });
      }
    }

    console.log(`   Total Debits: ${glTotalDebits.toFixed(2)}`);
    console.log(`   Total Credits: ${glTotalCredits.toFixed(2)}\n`);

    console.log(`🔍 DIFFERENCE ANALYSIS:`);
    console.log(`   TB Total Debits: ${tbTotalDebits.toFixed(2)}`);
    console.log(`   GL Total Debits: ${glTotalDebits.toFixed(2)}`);
    console.log(`   Difference: ${(glTotalDebits - tbTotalDebits).toFixed(2)}\n`);

    if (accountsWithDifferences.length > 0) {
      console.log(`⚠️  Found ${accountsWithDifferences.length} accounts with differences:\n`);
      for (const diff of accountsWithDifferences.slice(0, 10)) {
        console.log(`   Account ${diff.accountNo} (${diff.accountName}):`);
        console.log(`     GL Debits: ${diff.glDebits.toFixed(2)}, TB Debits: ${diff.tbDebits.toFixed(2)}, Diff: ${diff.debitDiff.toFixed(2)}`);
        console.log(`     GL Credits: ${diff.glCredits.toFixed(2)}, TB Credits: ${diff.tbCredits.toFixed(2)}, Diff: ${diff.creditDiff.toFixed(2)}\n`);
      }
      if (accountsWithDifferences.length > 10) {
        console.log(`   ... and ${accountsWithDifferences.length - 10} more accounts\n`);
      }
    } else {
      console.log(`✅ No account-level differences found\n`);
    }

    // Check for duplicate counting
    console.log(`🔍 Checking for duplicate counting...`);
    const allLineIds = new Set();
    const duplicateLines = [];
    
    for (const line of tbLinesFiltered) {
      const lineId = `${line.chartOfAccountId}-${line.journalEntry.currencyId}`;
      if (allLineIds.has(lineId)) {
        duplicateLines.push(lineId);
      }
      allLineIds.add(lineId);
    }
    
    if (duplicateLines.length > 0) {
      console.log(`   ⚠️  Found ${duplicateLines.length} potential duplicate lines\n`);
    } else {
      console.log(`   ✅ No duplicate lines found\n`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

investigateDifference();
