import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function debugJournalVsTrialBalance() {
  try {
    console.log('🔍 Debugging Journal View vs Trial Balance\n');

    // Step 1: Get the payroll journal entry
    const payrollEntry = await prisma.journalEntry.findFirst({
      where: {
        description: {
          contains: 'Payroll'
        }
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        }
      }
    });

    if (!payrollEntry) {
      console.log('❌ No payroll journal entry found');
      return;
    }

    console.log('📋 Payroll Journal Entry:');
    console.log(`   ID: ${payrollEntry.id}`);
    console.log(`   Reference: ${payrollEntry.referenceNumber}`);
    console.log(`   Description: ${payrollEntry.description}`);
    console.log(`   Date: ${payrollEntry.transactionDate.toISOString()}`);
    console.log(`   Status: ${payrollEntry.status}`);
    console.log(`   Amount: $${payrollEntry.totalAmount.toString()}\n`);

    // Step 2: Check what Journal view would see
    console.log('Step 2: Checking Journal View filters...');
    const today = new Date();
    const defaultStartDate = new Date('2020-01-01');
    const defaultEndDate = new Date();
    defaultEndDate.setHours(23, 59, 59, 999);

    console.log(`   Default start date: ${defaultStartDate.toISOString()}`);
    console.log(`   Default end date: ${defaultEndDate.toISOString()}`);
    console.log(`   Entry date: ${payrollEntry.transactionDate.toISOString()}`);
    console.log(`   Entry date within range: ${payrollEntry.transactionDate >= defaultStartDate && payrollEntry.transactionDate <= defaultEndDate}`);

    // Check if entry would be filtered by Journal view
    const journalViewFilter = {
      transactionDate: {
        gte: defaultStartDate,
        lte: defaultEndDate
      },
      status: {
        in: ['POSTED', 'PENDING']
      },
      cashbookEntries: {
        none: {
          OR: [
            { status: 'VOIDED' },
            { reversedAt: { not: null } }
          ]
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

    const journalViewEntries = await prisma.journalEntry.findMany({
      where: journalViewFilter,
      select: {
        id: true,
        referenceNumber: true,
        description: true,
        transactionDate: true,
        status: true
      }
    });

    console.log(`\n   Journal View would show: ${journalViewEntries.length} entries`);
    const payrollInJournal = journalViewEntries.find(e => e.id === payrollEntry.id);
    console.log(`   Payroll entry in Journal view: ${payrollInJournal ? '✅ YES' : '❌ NO'}`);

    if (!payrollInJournal) {
      console.log('\n   ⚠️ REASON:');
      if (payrollEntry.transactionDate < defaultStartDate) {
        console.log('      - Entry date is before default start date');
      }
      if (payrollEntry.transactionDate > defaultEndDate) {
        console.log('      - Entry date is after default end date');
      }
      if (payrollEntry.status !== 'POSTED' && payrollEntry.status !== 'PENDING') {
        console.log(`      - Entry status is ${payrollEntry.status} (not POSTED or PENDING)`);
      }
      if (payrollEntry.referenceNumber.startsWith('VR-') || payrollEntry.referenceNumber.startsWith('REV-')) {
        console.log('      - Entry is a reversal entry');
      }
    }

    // Step 3: Check what Trial Balance would see
    console.log('\n\nStep 3: Checking Trial Balance filters...');
    const trialBalanceDate = new Date(); // Usually uses current date or specified date
    trialBalanceDate.setHours(23, 59, 59, 999);

    console.log(`   Trial Balance date: ${trialBalanceDate.toISOString()}`);
    console.log(`   Entry date <= Trial Balance date: ${payrollEntry.transactionDate <= trialBalanceDate}`);

    const trialBalanceFilter = {
      journalEntry: {
        transactionDate: {
          lte: trialBalanceDate
        },
        status: 'POSTED',
        cashbookEntries: {
          none: {
            OR: [
              { status: 'VOIDED' },
              { reversedAt: { not: null } }
            ]
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
    };

    const trialBalanceLines = await prisma.journalEntryLine.findMany({
      where: trialBalanceFilter,
      select: {
        id: true,
        journalEntry: {
          select: {
            id: true,
            referenceNumber: true,
            description: true,
            transactionDate: true,
            status: true
          }
        }
      }
    });

    const uniqueTrialBalanceEntries = new Set(trialBalanceLines.map(l => l.journalEntry.id));
    console.log(`\n   Trial Balance would see: ${uniqueTrialBalanceEntries.size} unique journal entries`);
    const payrollInTrialBalance = uniqueTrialBalanceEntries.has(payrollEntry.id);
    console.log(`   Payroll entry in Trial Balance: ${payrollInTrialBalance ? '✅ YES' : '❌ NO'}`);

    // Step 4: Summary
    console.log('\n\n═══════════════════════════════════════════════════════════');
    console.log('📊 DIAGNOSIS');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (payrollInTrialBalance && !payrollInJournal) {
      console.log('🔴 ISSUE IDENTIFIED:');
      console.log('   Payroll entry appears in Trial Balance but NOT in Journal view');
      console.log('\n   Possible causes:');
      console.log('   1. Date range filter in Journal view excludes the entry');
      console.log('   2. Journal view uses different date defaults than Trial Balance');
      console.log('   3. Frontend is filtering by a different date range');
    } else if (payrollInTrialBalance && payrollInJournal) {
      console.log('✅ Both views should show the entry');
      console.log('   If it\'s not showing in Journal view, the issue is likely:');
      console.log('   - Frontend date filter');
      console.log('   - Frontend status filter');
      console.log('   - API endpoint being called incorrectly');
    } else {
      console.log('⚠️ Entry not found in either view - check filters');
    }

    // Step 5: Check all journal entries to compare
    console.log('\n\nStep 5: All Journal Entries Summary:');
    const allEntries = await prisma.journalEntry.findMany({
      select: {
        id: true,
        referenceNumber: true,
        description: true,
        transactionDate: true,
        status: true
      },
      orderBy: {
        transactionDate: 'desc'
      }
    });

    console.log(`   Total entries: ${allEntries.length}`);
    allEntries.forEach((entry, index) => {
      const inJournal = journalViewEntries.some(e => e.id === entry.id);
      const inTrialBalance = uniqueTrialBalanceEntries.has(entry.id);
      console.log(`   ${index + 1}. ${entry.referenceNumber} - ${entry.status} - Journal: ${inJournal ? '✅' : '❌'} Trial: ${inTrialBalance ? '✅' : '❌'}`);
    });

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debugJournalVsTrialBalance();

