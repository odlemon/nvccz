const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    console.log('🔍 Debugging GL vs Income Statement Query Differences\n');
    
    // Get USD currency
    const usdCurrency = await prisma.currency.findFirst({
      where: { code: 'USD', isActive: true }
    });
    
    if (!usdCurrency) {
      console.error('❌ USD currency not found');
      return;
    }
    
    console.log(`✅ Found USD currency: ${usdCurrency.id}\n`);
    
    // Get account 4000
    const account4000 = await prisma.chartOfAccounts.findFirst({
      where: { accountNo: '4000', isActive: true }
    });
    
    if (!account4000) {
      console.error('❌ Account 4000 not found');
      return;
    }
    
    console.log(`✅ Found Account 4000: ${account4000.accountName} (${account4000.id})\n`);
    
    // Query 1: How Income Statement queries (direct journal entries)
    console.log('📊 Query 1: Income Statement Method (Direct Journal Entries)');
    console.log('-'.repeat(80));
    
    const isJournalEntries = await prisma.journalEntry.findMany({
      where: {
        transactionDate: {
          gte: new Date('2025-01-01'),
          lte: new Date('2025-12-31')
        },
        status: "POSTED",
        currencyId: usdCurrency.id,
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
              not: { startsWith: 'VR-' }
            }
          },
          {
            referenceNumber: {
              not: { startsWith: 'REV-' }
            }
          }
        ]
      },
      include: {
        journalEntryLines: {
          where: {
            chartOfAccountId: account4000.id
          }
        }
      }
    });
    
    console.log(`   Found ${isJournalEntries.length} journal entries`);
    
    let isTotalDebits = 0;
    let isTotalCredits = 0;
    
    for (const je of isJournalEntries) {
      for (const line of je.journalEntryLines) {
        isTotalDebits += parseFloat(line.debitAmount || 0);
        isTotalCredits += parseFloat(line.creditAmount || 0);
      }
    }
    
    const isNet = isTotalCredits - isTotalDebits; // Revenue: Credits - Debits
    console.log(`   Total Debits: $${isTotalDebits.toFixed(2)}`);
    console.log(`   Total Credits: $${isTotalCredits.toFixed(2)}`);
    console.log(`   Net (Credits - Debits): $${isNet.toFixed(2)}\n`);
    
    // Query 2: How GL Detail queries (journal entry lines)
    console.log('📊 Query 2: GL Detail Method (Journal Entry Lines)');
    console.log('-'.repeat(80));
    
    const glJournalEntryWhere = {
      transactionDate: {
        gte: new Date('2025-01-01'),
        lte: new Date('2025-12-31')
      },
      status: 'POSTED',
      currencyId: usdCurrency.id,
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
            not: { startsWith: 'VR-' }
          }
        },
        {
          referenceNumber: {
            not: { startsWith: 'REV-' }
          }
        }
      ]
    };
    
    const glLines = await prisma.journalEntryLine.findMany({
      where: {
        chartOfAccountId: account4000.id,
        journalEntry: glJournalEntryWhere
      },
      include: {
        journalEntry: {
          select: {
            id: true,
            currencyId: true,
            transactionDate: true,
            status: true,
            referenceNumber: true
          }
        }
      }
    });
    
    console.log(`   Found ${glLines.length} journal entry lines`);
    
    // Filter out entries with null currency (as GL Detail does)
    const glLinesFiltered = glLines.filter(line => line.journalEntry.currencyId !== null);
    console.log(`   After filtering null currency: ${glLinesFiltered.length} lines`);
    
    let glTotalDebits = 0;
    let glTotalCredits = 0;
    
    for (const line of glLinesFiltered) {
      glTotalDebits += parseFloat(line.debitAmount || 0);
      glTotalCredits += parseFloat(line.creditAmount || 0);
    }
    
    const glNet = glTotalCredits - glTotalDebits; // Revenue: Credits - Debits
    console.log(`   Total Debits: $${glTotalDebits.toFixed(2)}`);
    console.log(`   Total Credits: $${glTotalCredits.toFixed(2)}`);
    console.log(`   Net (Credits - Debits): $${glNet.toFixed(2)}\n`);
    
    // Compare
    console.log('📊 COMPARISON:');
    console.log('-'.repeat(80));
    console.log(`   Income Statement Net: $${isNet.toFixed(2)}`);
    console.log(`   GL Detail Net: $${glNet.toFixed(2)}`);
    console.log(`   Difference: $${Math.abs(isNet - glNet).toFixed(2)}`);
    console.log(`   ${Math.abs(isNet - glNet) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}\n`);
    
    // Check for null currency entries
    const nullCurrencyLines = glLines.filter(line => line.journalEntry.currencyId === null);
    if (nullCurrencyLines.length > 0) {
      console.log(`⚠️  Found ${nullCurrencyLines.length} lines with null currencyId that GL Detail filters out`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();

