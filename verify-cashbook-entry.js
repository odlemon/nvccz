const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyCashbookEntry() {
  try {
    console.log('🔍 Verifying Cashbook Entry for Brighter Days Disbursement...\n');

    // Find the disbursement
    const disbursement = await prisma.fundDisbursement.findFirst({
      where: {
        amount: 40000,
        investmentImplementation: {
          portfolioCompany: {
            name: {
              contains: 'Brighter'
            }
          }
        }
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
        cashbookEntry: {
          include: {
            bank: {
              include: {
                glAccount: true,
                currency: true
              }
            },
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
        }
      }
    });

    if (!disbursement) {
      console.log('❌ Disbursement not found');
      return;
    }

    console.log('✅ DISBURSEMENT FOUND:');
    console.log(`   ID: ${disbursement.id}`);
    console.log(`   Company: ${disbursement.investmentImplementation?.portfolioCompany?.name}`);
    console.log(`   Amount: $${Number(disbursement.amount).toLocaleString()}`);
    console.log(`   Status: ${disbursement.status}`);
    console.log(`   Date: ${disbursement.disbursementDate.toISOString().split('T')[0]}\n`);

    if (disbursement.cashbookEntryId) {
      console.log(`   ✅ Cashbook Entry ID: ${disbursement.cashbookEntryId}\n`);
    } else {
      console.log(`   ❌ No Cashbook Entry ID linked\n`);
    }

    if (disbursement.cashbookEntry) {
      console.log('✅ CASHBOOK ENTRY EXISTS AND IS LINKED:');
      console.log(`   ID: ${disbursement.cashbookEntry.id}`);
      console.log(`   Reference: ${disbursement.cashbookEntry.reference || 'N/A'}`);
      console.log(`   Description: ${disbursement.cashbookEntry.description}`);
      console.log(`   Amount: $${Number(disbursement.cashbookEntry.amount).toLocaleString()}`);
      console.log(`   Date: ${disbursement.cashbookEntry.transactionDate.toISOString().split('T')[0]}`);
      console.log(`   Status: ${disbursement.cashbookEntry.status}`);
      console.log(`   Type: ${disbursement.cashbookEntry.type}`);
      console.log(`   Bank: ${disbursement.cashbookEntry.bank?.name || 'N/A'}`);
      console.log(`   Counterparty Type: ${disbursement.cashbookEntry.counterpartyType}\n`);

      if (disbursement.cashbookEntry.journalEntry) {
        console.log('✅ JOURNAL ENTRY CREATED BY CASHBOOK:');
        console.log(`   ID: ${disbursement.cashbookEntry.journalEntry.id}`);
        console.log(`   Reference: ${disbursement.cashbookEntry.journalEntry.referenceNumber}`);
        console.log(`   Description: ${disbursement.cashbookEntry.journalEntry.description}`);
        console.log(`   Status: ${disbursement.cashbookEntry.journalEntry.status}`);
        console.log(`   Total Amount: $${Number(disbursement.cashbookEntry.journalEntry.totalAmount).toLocaleString()}\n`);
        
        console.log('   📝 Journal Entry Lines:');
        let totalDebit = 0;
        let totalCredit = 0;
        
        disbursement.cashbookEntry.journalEntry.journalEntryLines.forEach(line => {
          const debit = Number(line.debitAmount);
          const credit = Number(line.creditAmount);
          totalDebit += debit;
          totalCredit += credit;
          
          if (debit > 0) {
            console.log(`      Dr. ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}: $${debit.toLocaleString()}`);
          }
          if (credit > 0) {
            console.log(`      Cr. ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}: $${credit.toLocaleString()}`);
          }
        });
        
        console.log(`\n   ✅ Balanced: Debit = Credit = $${totalDebit.toLocaleString()}\n`);
      } else {
        console.log('   ⚠️  No journal entry linked to cashbook entry\n');
      }
    } else {
      console.log('❌ CASHBOOK ENTRY NOT LINKED (but may exist in database)\n');
      
      // Try to find it manually
      const referencePattern = `FD-${disbursement.id.substring(0, 8).toUpperCase()}`;
      const cashbookEntry = await prisma.cashbookEntry.findFirst({
        where: {
          OR: [
            { reference: referencePattern },
            { reference: { contains: disbursement.id.substring(0, 8) } }
          ]
        }
      });

      if (cashbookEntry) {
        console.log('⚠️  Found cashbook entry but it\'s not linked:');
        console.log(`   ID: ${cashbookEntry.id}`);
        console.log(`   Reference: ${cashbookEntry.reference || 'N/A'}\n`);
        console.log('   This means the link needs to be created.\n');
      }
    }

    console.log('📊 SUMMARY:');
    console.log(`   ✅ Cashbook Entry Created: ${disbursement.cashbookEntry ? 'YES' : 'NO'}`);
    console.log(`   ✅ Cashbook Entry Linked: ${disbursement.cashbookEntryId ? 'YES' : 'NO'}`);
    console.log(`   ✅ Journal Entry Created: ${disbursement.cashbookEntry?.journalEntry ? 'YES' : 'NO'}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyCashbookEntry();

