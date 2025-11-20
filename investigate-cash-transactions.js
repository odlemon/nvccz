const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('decimal.js');
const prisma = new PrismaClient();

async function investigateTransactions() {
  try {
    console.log('🔍 Investigating Cash Account Transactions...\n');

    // Find the two journal entries
    const je1 = await prisma.journalEntry.findFirst({
      where: {
        OR: [
          { referenceNumber: 'FD-CMI36LP4-1763386415023' },
          { referenceNumber: { contains: 'FD-CMI36LP4' } }
        ]
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        },
        cashbookEntries: {
          include: {
            bank: true
          }
        }
      }
    });

    const je2 = await prisma.journalEntry.findFirst({
      where: {
        OR: [
          { referenceNumber: 'CB-GSX0669D' },
          { referenceNumber: { contains: 'GSX0669D' } }
        ]
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        },
        cashbookEntries: {
          include: {
            bank: true
          }
        }
      }
    });

    console.log('📋 Transaction 1: Fund Disbursement (FD-CMI36LP4)');
    console.log('═══════════════════════════════════════════════════════');
    if (je1) {
      console.log(`Reference: ${je1.referenceNumber}`);
      console.log(`Description: ${je1.description}`);
      console.log(`Date: ${je1.transactionDate.toISOString().split('T')[0]}`);
      console.log(`Status: ${je1.status}`);
      console.log(`\nJournal Entry Lines:`);
      je1.journalEntryLines.forEach((line, index) => {
        console.log(`\n  ${index + 1}. Account: ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}`);
        console.log(`     Type: ${line.chartOfAccount.accountType}`);
        console.log(`     Debit: $${line.debitAmount}`);
        console.log(`     Credit: $${line.creditAmount}`);
      });
      if (je1.cashbookEntries && je1.cashbookEntries.length > 0) {
        console.log(`\nLinked Cashbook Entries: ${je1.cashbookEntries.length}`);
        je1.cashbookEntries.forEach(cb => {
          console.log(`  - ${cb.reference}: ${cb.description} (${cb.type})`);
        });
      } else {
        console.log(`\nNo linked cashbook entries`);
      }
    } else {
      console.log('❌ Not found');
    }

    console.log('\n\n📋 Transaction 2: Bank Receipt (CB-GSX0669D)');
    console.log('═══════════════════════════════════════════════════════');
    if (je2) {
      console.log(`Reference: ${je2.referenceNumber}`);
      console.log(`Description: ${je2.description}`);
      console.log(`Date: ${je2.transactionDate.toISOString().split('T')[0]}`);
      console.log(`Status: ${je2.status}`);
      console.log(`\nJournal Entry Lines:`);
      je2.journalEntryLines.forEach((line, index) => {
        console.log(`\n  ${index + 1}. Account: ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}`);
        console.log(`     Type: ${line.chartOfAccount.accountType}`);
        console.log(`     Debit: $${line.debitAmount}`);
        console.log(`     Credit: $${line.creditAmount}`);
      });
      if (je2.cashbookEntries && je2.cashbookEntries.length > 0) {
        console.log(`\nLinked Cashbook Entries: ${je2.cashbookEntries.length}`);
        je2.cashbookEntries.forEach(cb => {
          console.log(`  - ${cb.reference}: ${cb.description} (${cb.type})`);
          console.log(`    Bank: ${cb.bank?.name || 'N/A'}`);
          console.log(`    Amount: $${cb.amount}`);
          console.log(`    GL Account: ${cb.glAccountId || 'N/A'}`);
        });
      } else {
        console.log(`\nNo linked cashbook entries`);
      }
    } else {
      console.log('❌ Not found');
    }

    // Check if they're related
    console.log('\n\n🔗 Relationship Analysis:');
    console.log('═══════════════════════════════════════════════════════');
    if (je1 && je2) {
      const sameDate = je1.transactionDate.toISOString().split('T')[0] === je2.transactionDate.toISOString().split('T')[0];
      const sameAmount = je1.journalEntryLines.some(line => 
        line.debitAmount === '20000' || line.creditAmount === '20000'
      ) && je2.journalEntryLines.some(line => 
        line.debitAmount === '20000' || line.creditAmount === '20000'
      );
      
      console.log(`Same Date: ${sameDate ? '✅ YES' : '❌ NO'}`);
      console.log(`Same Amount ($20,000): ${sameAmount ? '✅ YES' : '❌ NO'}`);
      console.log(`Both affect Cash account: ${je1.journalEntryLines.some(l => l.chartOfAccount.accountName.toLowerCase().includes('cash')) && je2.journalEntryLines.some(l => l.chartOfAccount.accountName.toLowerCase().includes('cash')) ? '✅ YES' : '❌ NO'}`);
      
      // Check if one is the reversal or opposite of the other
      const je1CashLine = je1.journalEntryLines.find(l => l.chartOfAccount.accountName.toLowerCase().includes('cash') || l.chartOfAccount.accountName.toLowerCase().includes('bank'));
      const je2CashLine = je2.journalEntryLines.find(l => l.chartOfAccount.accountName.toLowerCase().includes('cash') || l.chartOfAccount.accountName.toLowerCase().includes('bank'));
      
      if (je1CashLine && je2CashLine) {
        const opposite = (je1CashLine.debitAmount !== '0' && je2CashLine.creditAmount !== '0') || 
                         (je1CashLine.creditAmount !== '0' && je2CashLine.debitAmount !== '0');
        console.log(`Opposite entries (one debit, one credit): ${opposite ? '✅ YES' : '❌ NO'}`);
      }
    }

    // Check for fund disbursement
    console.log('\n\n💰 Fund Disbursement Check:');
    console.log('═══════════════════════════════════════════════════════');
    if (je1) {
      const fundDisbursement = await prisma.fundDisbursement.findFirst({
        where: {
          transactionReference: { contains: 'CMI36LP4' }
        },
        include: {
          investmentImplementation: {
            include: {
              portfolioCompany: {
                select: { name: true }
              }
            }
          },
          cashbookEntry: true
        }
      });
      
      if (fundDisbursement) {
        console.log(`Found Fund Disbursement:`);
        console.log(`  Amount: $${fundDisbursement.amount}`);
        console.log(`  Portfolio Company: ${fundDisbursement.investmentImplementation?.portfolioCompany?.name || 'N/A'}`);
        console.log(`  Date: ${fundDisbursement.disbursementDate.toISOString().split('T')[0]}`);
        console.log(`  Status: ${fundDisbursement.status}`);
        console.log(`  Has Cashbook Entry: ${fundDisbursement.cashbookEntry ? '✅ YES' : '❌ NO'}`);
        if (fundDisbursement.cashbookEntry) {
          console.log(`  Cashbook Reference: ${fundDisbursement.cashbookEntry.reference}`);
        }
      } else {
        console.log('No fund disbursement found with this reference');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

investigateTransactions();


