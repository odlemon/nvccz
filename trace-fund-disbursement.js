const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('decimal.js');
const prisma = new PrismaClient();

async function traceFundDisbursement() {
  try {
    console.log('🔍 Tracing Fund Disbursement Transaction...\n');

    // Find the journal entry
    const journalEntry = await prisma.journalEntry.findFirst({
      where: {
        referenceNumber: 'FD-CMI36LP4-1763386415023'
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        },
        cashbookEntries: {
          include: {
            bank: true,
            glAccount: true
          }
        }
      }
    });

    if (!journalEntry) {
      console.log('❌ Journal entry not found');
      return;
    }

    console.log('📋 Journal Entry Details:');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`ID: ${journalEntry.id}`);
    console.log(`Reference: ${journalEntry.referenceNumber}`);
    console.log(`Description: ${journalEntry.description}`);
    console.log(`Date: ${journalEntry.transactionDate.toISOString().split('T')[0]}`);
    console.log(`Status: ${journalEntry.status}`);
    console.log(`\nLinked Cashbook Entries: ${journalEntry.cashbookEntries.length}`);
    
    if (journalEntry.cashbookEntries.length === 0) {
      console.log('❌ NO CASHBOOK ENTRIES LINKED!');
      console.log('\nThis is why it shows as MANUAL_ENTRY');
    } else {
      journalEntry.cashbookEntries.forEach((cb, index) => {
        console.log(`\n  ${index + 1}. Cashbook Entry:`);
        console.log(`     ID: ${cb.id}`);
        console.log(`     Reference: ${cb.reference}`);
        console.log(`     Description: ${cb.description}`);
        console.log(`     Type: ${cb.type}`);
        console.log(`     Amount: $${cb.amount}`);
        console.log(`     Status: ${cb.status}`);
        console.log(`     Bank: ${cb.bank?.name || 'N/A'}`);
        console.log(`     GL Account: ${cb.glAccount?.accountName || 'N/A'}`);
      });
    }

    // Check for fund disbursement
    console.log('\n\n💰 Fund Disbursement Check:');
    console.log('═══════════════════════════════════════════════════════');
    
    // Try to find by the reference pattern
    const disbursementId = 'CMI36LP4';
    const fundDisbursement = await prisma.fundDisbursement.findFirst({
      where: {
        id: { startsWith: disbursementId }
      },
      include: {
        investmentImplementation: {
          include: {
            portfolioCompany: {
              select: { name: true }
            }
          }
        },
        cashbookEntry: {
          include: {
            bank: true
          }
        }
      }
    });

    if (fundDisbursement) {
      console.log(`✅ Found Fund Disbursement:`);
      console.log(`   ID: ${fundDisbursement.id}`);
      console.log(`   Amount: $${fundDisbursement.amount}`);
      console.log(`   Date: ${fundDisbursement.disbursementDate.toISOString().split('T')[0]}`);
      console.log(`   Status: ${fundDisbursement.status}`);
      console.log(`   Portfolio Company: ${fundDisbursement.investmentImplementation?.portfolioCompany?.name || 'N/A'}`);
      console.log(`   Has Cashbook Entry ID: ${fundDisbursement.cashbookEntryId ? '✅ YES' : '❌ NO'}`);
      
      if (fundDisbursement.cashbookEntryId) {
        console.log(`   Cashbook Entry ID: ${fundDisbursement.cashbookEntryId}`);
        
        // Check if this cashbook entry is linked to the journal entry
        const linkedCashbook = journalEntry.cashbookEntries.find(cb => cb.id === fundDisbursement.cashbookEntryId);
        if (linkedCashbook) {
          console.log(`   ✅ Cashbook entry IS linked to this journal entry`);
        } else {
          console.log(`   ❌ Cashbook entry is NOT linked to this journal entry!`);
          console.log(`   This is the problem - the cashbook entry exists but isn't linked to the journal entry`);
          
          // Get the cashbook entry details
          const cashbookEntry = await prisma.cashbookEntry.findUnique({
            where: { id: fundDisbursement.cashbookEntryId },
            include: {
              journalEntry: true,
              bank: true
            }
          });
          
          if (cashbookEntry) {
            console.log(`\n   Cashbook Entry Details:`);
            console.log(`     Reference: ${cashbookEntry.reference}`);
            console.log(`     Description: ${cashbookEntry.description}`);
            console.log(`     Journal Entry ID: ${cashbookEntry.journalEntryId || 'NONE'}`);
            if (cashbookEntry.journalEntry) {
              console.log(`     Linked Journal Entry: ${cashbookEntry.journalEntry.referenceNumber}`);
              if (cashbookEntry.journalEntry.id !== journalEntry.id) {
                console.log(`     ⚠️  WARNING: Cashbook entry is linked to a DIFFERENT journal entry!`);
              }
            }
          }
        }
      } else {
        console.log(`   ❌ No cashbook entry ID stored in fund disbursement`);
      }
    } else {
      console.log('❌ No fund disbursement found');
      
      // Try to find by searching all disbursements
      const allDisbursements = await prisma.fundDisbursement.findMany({
        where: {
          transactionDate: journalEntry.transactionDate,
          amount: journalEntry.totalAmount
        },
        include: {
          investmentImplementation: {
            include: {
              portfolioCompany: {
                select: { name: true }
              }
            }
          }
        },
        take: 5
      });
      
      if (allDisbursements.length > 0) {
        console.log(`\n   Found ${allDisbursements.length} disbursement(s) with same date/amount:`);
        allDisbursements.forEach((fd, index) => {
          console.log(`\n   ${index + 1}. ID: ${fd.id.substring(0, 8)}...`);
          console.log(`      Amount: $${fd.amount}`);
          console.log(`      Status: ${fd.status}`);
          console.log(`      Company: ${fd.investmentImplementation?.portfolioCompany?.name || 'N/A'}`);
        });
      }
    }

    // Check for cashbook entries with similar reference
    console.log('\n\n🔍 Searching for Related Cashbook Entries:');
    console.log('═══════════════════════════════════════════════════════');
    
    const cashbookEntries = await prisma.cashbookEntry.findMany({
      where: {
        OR: [
          { reference: { contains: 'FD-CMI36LP4' } },
          { reference: { contains: 'CMI36LP4' } },
          { 
            description: { contains: 'Threaded Numbers' },
            transactionDate: journalEntry.transactionDate
          }
        ]
      },
      include: {
        journalEntry: true,
        bank: true
      }
    });

    if (cashbookEntries.length > 0) {
      console.log(`Found ${cashbookEntries.length} related cashbook entry/entries:`);
      cashbookEntries.forEach((cb, index) => {
        console.log(`\n  ${index + 1}. Reference: ${cb.reference}`);
        console.log(`     Description: ${cb.description}`);
        console.log(`     Type: ${cb.type}`);
        console.log(`     Amount: $${cb.amount}`);
        console.log(`     Journal Entry ID: ${cb.journalEntryId || 'NONE'}`);
        if (cb.journalEntry) {
          console.log(`     Linked Journal Entry: ${cb.journalEntry.referenceNumber}`);
          if (cb.journalEntry.id === journalEntry.id) {
            console.log(`     ✅ This IS linked to our journal entry!`);
          } else {
            console.log(`     ❌ This is linked to a DIFFERENT journal entry`);
          }
        }
      });
    } else {
      console.log('❌ No related cashbook entries found');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

traceFundDisbursement();


