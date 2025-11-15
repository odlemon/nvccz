const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function checkPendingEntries() {
  let token = '';

  console.log('🔍 CHECKING PENDING ENTRIES DIFFERENCE\n');
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

  const yearStart = '2025-01-01';
  const yearEnd = '2025-12-31';

  // Check journal entries by status
  try {
    const { PrismaClient } = require('@prisma/client');
    const prisma = new PrismaClient();

    console.log('Checking journal entries by status...\n');

    // Count POSTED entries
    const postedCount = await prisma.journalEntry.count({
      where: {
        transactionDate: {
          gte: new Date(yearStart),
          lte: new Date(yearEnd)
        },
        status: 'POSTED'
      }
    });

    // Count PENDING entries
    const pendingCount = await prisma.journalEntry.count({
      where: {
        transactionDate: {
          gte: new Date(yearStart),
          lte: new Date(yearEnd)
        },
        status: 'PENDING'
      }
    });

    console.log(`POSTED entries: ${postedCount}`);
    console.log(`PENDING entries: ${pendingCount}\n`);

    // Get totals for POSTED entries
    const postedLines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          transactionDate: {
            gte: new Date(yearStart),
            lte: new Date(yearEnd)
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
    postedLines.forEach(line => {
      postedDebits += parseFloat(line.debitAmount.toString());
      postedCredits += parseFloat(line.creditAmount.toString());
    });

    console.log('POSTED entries totals:');
    console.log(`   Total Debits: ${postedDebits.toFixed(2)}`);
    console.log(`   Total Credits: ${postedCredits.toFixed(2)}\n`);

    // Get totals for PENDING entries
    const pendingLines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          transactionDate: {
            gte: new Date(yearStart),
            lte: new Date(yearEnd)
          },
          status: 'PENDING'
        }
      },
      select: {
        debitAmount: true,
        creditAmount: true
      }
    });

    let pendingDebits = 0;
    let pendingCredits = 0;
    pendingLines.forEach(line => {
      pendingDebits += parseFloat(line.debitAmount.toString());
      pendingCredits += parseFloat(line.creditAmount.toString());
    });

    console.log('PENDING entries totals:');
    console.log(`   Total Debits: ${pendingDebits.toFixed(2)}`);
    console.log(`   Total Credits: ${pendingCredits.toFixed(2)}\n`);

    console.log('Combined (POSTED + PENDING):');
    console.log(`   Total Debits: ${(postedDebits + pendingDebits).toFixed(2)}`);
    console.log(`   Total Credits: ${(postedCredits + pendingCredits).toFixed(2)}\n`);

    console.log('Difference (PENDING only):');
    console.log(`   Debit Difference: ${pendingDebits.toFixed(2)}`);
    console.log(`   Credit Difference: ${pendingCredits.toFixed(2)}\n`);

    // Check specific accounts with differences
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Checking Account 1000 (Cash) - PENDING entries...\n');

    const cashAccount = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: '1000' }
    });

    if (cashAccount) {
      const cashPendingLines = await prisma.journalEntryLine.findMany({
        where: {
          chartOfAccountId: cashAccount.id,
          journalEntry: {
            transactionDate: {
              gte: new Date(yearStart),
              lte: new Date(yearEnd)
            },
            status: 'PENDING'
          }
        },
        select: {
          debitAmount: true,
          creditAmount: true,
          journalEntry: {
            select: {
              referenceNumber: true,
              transactionDate: true,
              status: true
            }
          }
        }
      });

      let cashPendingDebits = 0;
      let cashPendingCredits = 0;
      cashPendingLines.forEach(line => {
        cashPendingDebits += parseFloat(line.debitAmount.toString());
        cashPendingCredits += parseFloat(line.creditAmount.toString());
      });

      console.log(`Account 1000 PENDING entries: ${cashPendingLines.length}`);
      console.log(`   Debits: ${cashPendingDebits.toFixed(2)}`);
      console.log(`   Credits: ${cashPendingCredits.toFixed(2)}\n`);

      if (cashPendingLines.length > 0) {
        console.log('Sample PENDING entries:');
        cashPendingLines.slice(0, 5).forEach(line => {
          console.log(`   ${line.journalEntry.referenceNumber} - ${line.journalEntry.transactionDate.toISOString().split('T')[0]}`);
          console.log(`      Debit: ${line.debitAmount.toString()}, Credit: ${line.creditAmount.toString()}`);
        });
      }
    }

    await prisma.$disconnect();

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

checkPendingEntries();

