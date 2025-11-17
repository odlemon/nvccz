const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testDirectQuery() {
  try {
    console.log('🔍 Testing Direct Prisma Query\n');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Test the exact query the balance sheet uses
    const startDate = new Date(0);
    const endDate = new Date('2025-11-17');
    endDate.setHours(23, 59, 59, 999);

    console.log(`Date Range: ${startDate.toISOString()} to ${endDate.toISOString()}\n`);

    const journalEntryWhere = {
      transactionDate: {
        gte: startDate,
        lte: endDate
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
        },
        {
          OR: [
            {
              cashbookEntries: {
                none: {}
              }
            },
            {
              cashbookEntries: {
                every: {
                  AND: [
                    { status: { not: 'VOIDED' } },
                    { reversedAt: null }
                  ]
                }
              }
            }
          ]
        }
      ]
    };

    console.log('Query Structure:');
    console.log(JSON.stringify(journalEntryWhere, null, 2));
    console.log('');

    // Test 1: Find the asset journal entry
    console.log('Test 1: Finding asset journal entry...');
    const assetJE = await prisma.journalEntry.findFirst({
      where: {
        referenceNumber: {
          contains: 'ASSET-23933'
        }
      },
      include: {
        cashbookEntries: true
      }
    });

    if (assetJE) {
      console.log(`✅ Found journal entry: ${assetJE.referenceNumber}`);
      console.log(`   Status: ${assetJE.status}`);
      console.log(`   Date: ${assetJE.transactionDate}`);
      console.log(`   Cashbook entries: ${assetJE.cashbookEntries.length}`);
      console.log('');
    } else {
      console.log('❌ Journal entry not found');
      console.log('');
    }

    // Test 2: Check if it matches the filter
    console.log('Test 2: Checking if it matches the balance sheet filter...');
    const matchesFilter = await prisma.journalEntry.findFirst({
      where: {
        ...journalEntryWhere,
        referenceNumber: {
          contains: 'ASSET-23933'
        }
      }
    });

    if (matchesFilter) {
      console.log('✅ Journal entry MATCHES the filter');
    } else {
      console.log('❌ Journal entry does NOT match the filter');
      console.log('   This means the query is excluding it');
    }
    console.log('');

    // Test 3: Get journal entry lines for account 1100
    console.log('Test 3: Getting journal entry lines for account 1100...');
    const account1100 = await prisma.chartOfAccounts.findFirst({
      where: {
        accountNo: '1100'
      }
    });

    if (!account1100) {
      console.log('❌ Account 1100 not found');
      return;
    }

    console.log(`Account: ${account1100.accountNo} - ${account1100.accountName}`);
    console.log('');

    const journalLines = await prisma.journalEntryLine.findMany({
      where: {
        chartOfAccountId: account1100.id,
        journalEntry: {
          is: journalEntryWhere
        }
      },
      include: {
        journalEntry: {
          select: {
            referenceNumber: true,
            description: true,
            transactionDate: true,
            status: true
          }
        }
      }
    });

    console.log(`Found ${journalLines.length} journal entry line(s) for account 1100`);
    if (journalLines.length > 0) {
      journalLines.forEach((line, index) => {
        console.log(`\n  Line ${index + 1}:`);
        console.log(`    Journal Entry: ${line.journalEntry.referenceNumber}`);
        console.log(`    Description: ${line.journalEntry.description}`);
        console.log(`    Date: ${line.journalEntry.transactionDate}`);
        console.log(`    Debit: $${line.debitAmount}`);
        console.log(`    Credit: $${line.creditAmount}`);
      });
    } else {
      console.log('❌ No journal entry lines found - this is why the asset is not appearing!');
    }

    console.log('\n════════════════════════════════════════════════════════════════');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

testDirectQuery();

