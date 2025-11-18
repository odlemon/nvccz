const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function findCashbookForDisbursement() {
  try {
    console.log('🔍 Searching for Fund Disbursement: $40,000 for "Brighter Days"...\n');

    // Find the disbursement - search by amount first
    const disbursement = await prisma.fundDisbursement.findFirst({
      where: {
        amount: 40000
      },
      include: {
        investmentImplementation: {
          include: {
            portfolioCompany: {
              select: {
                name: true
              }
            }
          }
        },
        fund: {
          select: {
            name: true
          }
        }
      }
    });

    if (!disbursement) {
      console.log('❌ Disbursement not found. Searching all disbursements...\n');
      
      const allDisbursements = await prisma.fundDisbursement.findMany({
        include: {
          investmentImplementation: {
            include: {
              portfolioCompany: {
                select: {
                  name: true
                }
              }
            }
          },
          fund: {
            select: {
              name: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        },
        take: 10
      });

      console.log(`Found ${allDisbursements.length} recent disbursements:\n`);
      allDisbursements.forEach(d => {
        console.log(`- ID: ${d.id.substring(0, 8)}...`);
        console.log(`  Company: ${d.investmentImplementation?.portfolioCompany?.name || 'N/A'}`);
        console.log(`  Amount: $${Number(d.amount).toLocaleString()}`);
        console.log(`  Status: ${d.status}`);
        console.log(`  Date: ${d.disbursementDate.toISOString().split('T')[0]}`);
        console.log('');
      });
      return;
    }

    console.log('✅ Found Disbursement:');
    console.log(`   ID: ${disbursement.id}`);
    console.log(`   Company: ${disbursement.investmentImplementation?.portfolioCompany?.name}`);
    console.log(`   Amount: $${Number(disbursement.amount).toLocaleString()}`);
    console.log(`   Status: ${disbursement.status}`);
    console.log(`   Date: ${disbursement.disbursementDate.toISOString().split('T')[0]}`);
    console.log(`   Reference Pattern: FD-${disbursement.id.substring(0, 8).toUpperCase()}\n`);

    // Search for cashbook entry by reference
    const referencePattern = `FD-${disbursement.id.substring(0, 8).toUpperCase()}`;
    console.log(`🔍 Searching for cashbook entry with reference: ${referencePattern}...\n`);

    const cashbookEntry = await prisma.cashbookEntry.findFirst({
      where: {
        OR: [
          { reference: referencePattern },
          { reference: { contains: disbursement.id.substring(0, 8) } },
          { 
            description: { 
              contains: disbursement.investmentImplementation?.portfolioCompany?.name || ''
            }
          },
          {
            description: {
              contains: 'Fund Disbursement'
            },
            amount: disbursement.amount,
            transactionDate: disbursement.disbursementDate
          }
        ]
      },
      include: {
        bank: {
          include: {
            glAccount: true,
            currency: true
          }
        },
        glAccount: true,
        journalEntry: {
          include: {
            journalEntryLines: {
              include: {
                chartOfAccount: true
              }
            }
          }
        }
      }
    });

    if (cashbookEntry) {
      console.log('✅ FOUND CASHBOOK ENTRY:');
      console.log(`   ID: ${cashbookEntry.id}`);
      console.log(`   Reference: ${cashbookEntry.reference || 'N/A'}`);
      console.log(`   Description: ${cashbookEntry.description}`);
      console.log(`   Amount: $${Number(cashbookEntry.amount).toLocaleString()}`);
      console.log(`   Date: ${cashbookEntry.transactionDate.toISOString().split('T')[0]}`);
      console.log(`   Status: ${cashbookEntry.status}`);
      console.log(`   Type: ${cashbookEntry.type}`);
      console.log(`   Bank: ${cashbookEntry.bank?.name || 'N/A'}`);
      
      if (cashbookEntry.journalEntry) {
        console.log(`\n   📝 Linked Journal Entry:`);
        console.log(`      ID: ${cashbookEntry.journalEntry.id}`);
        console.log(`      Reference: ${cashbookEntry.journalEntry.referenceNumber}`);
        console.log(`      Status: ${cashbookEntry.journalEntry.status}`);
        console.log(`      Lines:`);
        cashbookEntry.journalEntry.journalEntryLines.forEach(line => {
          const debit = Number(line.debitAmount);
          const credit = Number(line.creditAmount);
          if (debit > 0) {
            console.log(`         Dr. ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}: $${debit.toLocaleString()}`);
          }
          if (credit > 0) {
            console.log(`         Cr. ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}: $${credit.toLocaleString()}`);
          }
        });
      } else {
        console.log(`\n   ⚠️  No journal entry linked to this cashbook entry!`);
      }
    } else {
      console.log('❌ CASHBOOK ENTRY NOT FOUND!');
      console.log('\n   Searching for any cashbook entries around the disbursement date...\n');
      
      // Search by date and amount
      const dateFrom = new Date(disbursement.disbursementDate);
      dateFrom.setDate(dateFrom.getDate() - 1);
      const dateTo = new Date(disbursement.disbursementDate);
      dateTo.setDate(dateTo.getDate() + 1);

      const nearbyEntries = await prisma.cashbookEntry.findMany({
        where: {
          transactionDate: {
            gte: dateFrom,
            lte: dateTo
          },
          amount: {
            gte: disbursement.amount.minus(1),
            lte: disbursement.amount.plus(1)
          },
          type: 'PAYMENT'
        },
        include: {
          bank: true,
          journalEntry: true
        },
        orderBy: {
          transactionDate: 'desc'
        },
        take: 5
      });

      if (nearbyEntries.length > 0) {
        console.log(`   Found ${nearbyEntries.length} nearby cashbook entries:\n`);
        nearbyEntries.forEach(entry => {
          console.log(`   - ID: ${entry.id.substring(0, 8)}...`);
          console.log(`     Description: ${entry.description}`);
          console.log(`     Amount: $${Number(entry.amount).toLocaleString()}`);
          console.log(`     Date: ${entry.transactionDate.toISOString().split('T')[0]}`);
          console.log(`     Has Journal Entry: ${entry.journalEntry ? 'Yes' : 'No'}`);
          console.log('');
        });
      } else {
        console.log('   No nearby cashbook entries found.\n');
      }

      // Check if journal entry exists
      console.log('🔍 Checking for journal entry...\n');
      const journalEntry = await prisma.journalEntry.findFirst({
        where: {
          OR: [
            { referenceNumber: { contains: 'FD-' } },
            { 
              description: { 
                contains: disbursement.investmentImplementation?.portfolioCompany?.name || ''
              }
            },
            {
              description: {
                contains: 'Fund Disbursement'
              },
              totalAmount: disbursement.amount,
              transactionDate: disbursement.disbursementDate
            }
          ]
        },
        include: {
          journalEntryLines: {
            include: {
              chartOfAccount: true
            }
          }
        }
      });

      if (journalEntry) {
        console.log('✅ FOUND JOURNAL ENTRY (but no cashbook entry):');
        console.log(`   ID: ${journalEntry.id}`);
        console.log(`   Reference: ${journalEntry.referenceNumber}`);
        console.log(`   Description: ${journalEntry.description}`);
        console.log(`   Amount: $${Number(journalEntry.totalAmount).toLocaleString()}`);
        console.log(`   Date: ${journalEntry.transactionDate.toISOString().split('T')[0]}`);
        console.log(`   Status: ${journalEntry.status}`);
        console.log(`   Lines:`);
        journalEntry.journalEntryLines.forEach(line => {
          const debit = Number(line.debitAmount);
          const credit = Number(line.creditAmount);
          if (debit > 0) {
            console.log(`      Dr. ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}: $${debit.toLocaleString()}`);
          }
          if (credit > 0) {
            console.log(`      Cr. ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}: $${credit.toLocaleString()}`);
          }
        });
        console.log('\n   ⚠️  ISSUE: Journal entry exists but cashbook entry is missing!');
        console.log('   This suggests the journal entry was created directly, not through cashbook.');
      } else {
        console.log('❌ No journal entry found either.');
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

findCashbookForDisbursement();

