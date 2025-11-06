import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function verifyJournalEntry() {
  try {
    console.log('🔍 Verifying journal entries for fund disbursements...\n');

    // Find the most recent journal entry related to fund disbursement
    const journalEntry = await prisma.journalEntry.findFirst({
      where: {
        referenceNumber: {
          startsWith: 'FD-'
        }
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: {
              select: {
                accountNo: true,
                accountName: true,
                accountType: true
              }
            }
          },
          orderBy: {
            createdAt: 'asc'
          }
        },
        createdBy: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!journalEntry) {
      console.log('❌ No journal entry found with reference starting with "FD-"');
      await prisma.$disconnect();
      return;
    }

    console.log('✅ Journal Entry Found:');
    console.log(`   Reference Number: ${journalEntry.referenceNumber}`);
    console.log(`   Description: ${journalEntry.description}`);
    console.log(`   Transaction Date: ${journalEntry.transactionDate}`);
    console.log(`   Status: ${journalEntry.status}`);
    console.log(`   Total Amount: $${Number(journalEntry.totalAmount).toLocaleString()}`);
    console.log(`   Created By: ${journalEntry.createdBy?.firstName} ${journalEntry.createdBy?.lastName} (${journalEntry.createdBy?.email})`);
    console.log(`   Created At: ${journalEntry.createdAt}`);
    console.log('');

    console.log('📊 Journal Entry Lines:');
    console.log('─'.repeat(80));

    let totalDebits = 0;
    let totalCredits = 0;

    for (const line of journalEntry.journalEntryLines) {
      const debit = Number(line.debitAmount);
      const credit = Number(line.creditAmount);
      totalDebits += debit;
      totalCredits += credit;

      if (debit > 0) {
        console.log(`   DR ${line.chartOfAccount.accountNo.padEnd(6)} - ${line.chartOfAccount.accountName.padEnd(40)} $${debit.toLocaleString().padStart(15)}`);
        console.log(`      Account Type: ${line.chartOfAccount.accountType}`);
        console.log(`      Description: ${line.description || 'N/A'}`);
      }
      if (credit > 0) {
        console.log(`   CR ${line.chartOfAccount.accountNo.padEnd(6)} - ${line.chartOfAccount.accountName.padEnd(40)} $${credit.toLocaleString().padStart(15)}`);
        console.log(`      Account Type: ${line.chartOfAccount.accountType}`);
        console.log(`      Description: ${line.description || 'N/A'}`);
      }
      console.log('');
    }

    console.log('─'.repeat(80));
    console.log('📊 Balance Summary:');
    console.log(`   Total Debits:  $${totalDebits.toLocaleString().padStart(15)}`);
    console.log(`   Total Credits: $${totalCredits.toLocaleString().padStart(15)}`);
    console.log(`   Difference:    $${Math.abs(totalDebits - totalCredits).toLocaleString().padStart(15)}`);
    console.log('');

    // Verify balance
    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;
    
    if (isBalanced) {
      console.log('✅ Journal entry is BALANCED!');
      console.log('   Debit = Credit ✓');
    } else {
      console.log('❌ Journal entry is NOT balanced!');
      console.log(`   Difference: $${Math.abs(totalDebits - totalCredits).toLocaleString()}`);
    }

    console.log('');

    // Verify accounts used
    console.log('🔍 Account Verification:');
    const portfolioAccount = journalEntry.journalEntryLines.find(
      line => line.chartOfAccount.accountNo === '1501' || 
              line.chartOfAccount.accountName.includes('Portfolio Investment')
    );
    const bankAccount = journalEntry.journalEntryLines.find(
      line => line.chartOfAccount.accountNo === '1010' || 
              line.chartOfAccount.accountName.includes('Main Bank Account')
    );

    if (portfolioAccount) {
      console.log(`   ✅ Portfolio Investments Account Found:`);
      console.log(`      Account No: ${portfolioAccount.chartOfAccount.accountNo}`);
      console.log(`      Account Name: ${portfolioAccount.chartOfAccount.accountName}`);
      console.log(`      Debit Amount: $${Number(portfolioAccount.debitAmount).toLocaleString()}`);
    } else {
      console.log(`   ❌ Portfolio Investments Account (1501) NOT found in journal entry`);
    }

    if (bankAccount) {
      console.log(`   ✅ Main Bank Account Found:`);
      console.log(`      Account No: ${bankAccount.chartOfAccount.accountNo}`);
      console.log(`      Account Name: ${bankAccount.chartOfAccount.accountName}`);
      console.log(`      Credit Amount: $${Number(bankAccount.creditAmount).toLocaleString()}`);
    } else {
      console.log(`   ❌ Main Bank Account (1010) NOT found in journal entry`);
    }

    console.log('');

    // Check if there are multiple fund disbursement journal entries
    const allDisbursementEntries = await prisma.journalEntry.findMany({
      where: {
        referenceNumber: {
          startsWith: 'FD-'
        }
      },
      include: {
        journalEntryLines: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    console.log(`📋 Total Fund Disbursement Journal Entries: ${allDisbursementEntries.length}`);
    
    if (allDisbursementEntries.length > 1) {
      console.log('\n📊 All Fund Disbursement Journal Entries:');
      for (const entry of allDisbursementEntries) {
        const entryDebits = entry.journalEntryLines.reduce((sum, line) => sum + Number(line.debitAmount), 0);
        const entryCredits = entry.journalEntryLines.reduce((sum, line) => sum + Number(line.creditAmount), 0);
        const entryBalanced = Math.abs(entryDebits - entryCredits) < 0.01;
        
        console.log(`   ${entry.referenceNumber}: $${entryDebits.toLocaleString()} - ${entryBalanced ? '✅ Balanced' : '❌ Not Balanced'}`);
      }
    }

    console.log('');
    console.log('🎉 Verification complete!');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

verifyJournalEntry();

