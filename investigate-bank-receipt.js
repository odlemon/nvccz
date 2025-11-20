const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('decimal.js');
const prisma = new PrismaClient();

async function investigateBankReceipt() {
  try {
    console.log('🔍 Investigating Bank Receipt Transaction\n');
    console.log('═══════════════════════════════════════════════════════\n');

    // Get the cashbook entry
    const cashbookEntry = await prisma.cashbookEntry.findFirst({
      where: {
        reference: 'REF3',
        description: { contains: 'Threading numbers' }
      },
      include: {
        bank: true,
        glAccount: true,
        customer: true,
        vendor: true,
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

    if (!cashbookEntry) {
      console.log('❌ Cashbook entry not found');
      return;
    }

    console.log('📋 Cashbook Entry Details:\n');
    console.log(`Reference: ${cashbookEntry.reference}`);
    console.log(`Description: ${cashbookEntry.description}`);
    console.log(`Type: ${cashbookEntry.type}`);
    console.log(`Amount: $${cashbookEntry.amount}`);
    console.log(`Date: ${cashbookEntry.transactionDate.toISOString().split('T')[0]}`);
    console.log(`Status: ${cashbookEntry.status}`);
    console.log(`Counterparty Type: ${cashbookEntry.counterpartyType}`);
    console.log(`Bank: ${cashbookEntry.bank?.name || 'N/A'}`);
    console.log(`GL Account: ${cashbookEntry.glAccount?.accountName || 'N/A'}`);
    console.log(`Customer: ${cashbookEntry.customer?.name || 'N/A'}`);
    console.log(`Vendor: ${cashbookEntry.vendor?.name || 'N/A'}\n`);

    console.log('📋 Journal Entry Created by Cashbook:\n');
    if (cashbookEntry.journalEntry) {
      console.log(`Reference: ${cashbookEntry.journalEntry.referenceNumber}`);
      console.log(`Description: ${cashbookEntry.journalEntry.description}\n`);
      console.log('Journal Entry Lines:');
      cashbookEntry.journalEntry.journalEntryLines.forEach((line, index) => {
        console.log(`\n  ${index + 1}. Account: ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}`);
        console.log(`     Type: ${line.chartOfAccount.accountType}`);
        console.log(`     Debit: $${line.debitAmount}`);
        console.log(`     Credit: $${line.creditAmount}`);
      });
    }

    console.log('\n\n💡 Analysis:\n');
    console.log('═══════════════════════════════════════════════════════\n');
    
    if (cashbookEntry.type === 'RECEIPT') {
      console.log('This is a RECEIPT (money coming IN to your bank).\n');
      console.log('What it means:');
      console.log('   - You RECEIVED $20,000');
      console.log('   - It went INTO your bank account (debit)');
      console.log('   - It was credited to Management Fees Income\n');
      
      if (cashbookEntry.counterpartyType === 'GL') {
        console.log('⚠️  ISSUE: This is a GL receipt but it\'s crediting Management Fees Income');
        console.log('   This suggests it might have been incorrectly categorized.\n');
        
        if (cashbookEntry.glAccount) {
          console.log(`   The GL account used: ${cashbookEntry.glAccount.accountName}`);
          console.log(`   Account No: ${cashbookEntry.glAccount.accountNo}`);
          
          if (cashbookEntry.glAccount.accountNo === '1500' || cashbookEntry.glAccount.accountNo === '1501') {
            console.log('\n   ❌ PROBLEM: This receipt was credited to Portfolio Investments!');
            console.log('   This is WRONG - a receipt should not credit investments.');
            console.log('   It should credit income or reduce a liability.\n');
          } else if (cashbookEntry.glAccount.accountNo === '4000') {
            console.log('\n   ✅ This is crediting Management Fees Income (4000)');
            console.log('   This means you RECEIVED $20k as income/revenue.\n');
          }
        }
      }
    }

    // Check if there's a fund disbursement that should match this
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('🔍 Checking for Related Fund Disbursement:\n');
    
    const fundDisbursements = await prisma.fundDisbursement.findMany({
      where: {
        disbursementDate: cashbookEntry.transactionDate,
        amount: cashbookEntry.amount
      },
      include: {
        investmentImplementation: {
          include: {
            portfolioCompany: {
              select: { name: true }
            }
          }
        }
      }
    });

    if (fundDisbursements.length > 0) {
      console.log(`Found ${fundDisbursements.length} fund disbursement(s) with same date/amount:\n`);
      fundDisbursements.forEach((fd, index) => {
        console.log(`${index + 1}. Fund Disbursement:`);
        console.log(`   Amount: $${fd.amount}`);
        console.log(`   Date: ${fd.disbursementDate.toISOString().split('T')[0]}`);
        console.log(`   Portfolio Company: ${fd.investmentImplementation?.portfolioCompany?.name || 'N/A'}`);
        console.log(`   Status: ${fd.status}`);
        console.log('');
      });
    } else {
      console.log('No fund disbursements found with matching date/amount.\n');
    }

    console.log('═══════════════════════════════════════════════════════\n');
    console.log('❓ The Question:\n');
    console.log('───────────────────────────────────────────────────────\n');
    console.log('You said: "How is it income if we gave money to the company?"\n');
    console.log('This suggests the transaction might be WRONG.\n');
    console.log('If you PAID $20k to Threaded Numbers (fund disbursement),');
    console.log('then this bank receipt might be incorrectly recorded.\n');
    console.log('Possible scenarios:');
    console.log('   1. This receipt was created by mistake');
    console.log('   2. This receipt is for something else (not the fund disbursement)');
    console.log('   3. The GL account was incorrectly set to Management Fees Income');
    console.log('   4. This should have been a PAYMENT, not a RECEIPT\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

investigateBankReceipt();


