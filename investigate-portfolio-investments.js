const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('decimal.js');
const prisma = new PrismaClient();

async function investigatePortfolioInvestments() {
  try {
    console.log('🔍 Investigating Portfolio Investments\n');
    console.log('═══════════════════════════════════════════════════════\n');

    // Get Portfolio Investments account (1501)
    const portfolioAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        OR: [
          { accountNo: '1501' },
          { accountName: { contains: 'Portfolio Investment' } }
        ],
        isActive: true
      }
    });

    if (!portfolioAccount) {
      console.log('❌ Portfolio Investments account not found');
      return;
    }

    console.log(`📊 Portfolio Investments Account (${portfolioAccount.accountNo}):`);
    console.log(`   Name: ${portfolioAccount.accountName}`);
    console.log(`   Type: ${portfolioAccount.accountType}\n`);

    // Get all journal entry lines for Portfolio Investments
    const journalLines = await prisma.journalEntryLine.findMany({
      where: {
        chartOfAccountId: portfolioAccount.id
      },
      include: {
        journalEntry: {
          include: {
            cashbookEntries: {
              include: {
                bank: true
              }
            }
          }
        },
        chartOfAccount: true
      },
      orderBy: {
        journalEntry: {
          transactionDate: 'asc'
        }
      }
    });

    console.log(`📋 Found ${journalLines.length} journal entry line(s) for Portfolio Investments:\n`);

    let totalDebits = new Decimal(0);
    let totalCredits = new Decimal(0);

    journalLines.forEach((line, index) => {
      const debitAmt = new Decimal(line.debitAmount || 0);
      const creditAmt = new Decimal(line.creditAmount || 0);
      totalDebits = totalDebits.plus(debitAmt);
      totalCredits = totalCredits.plus(creditAmt);

      const netAmount = debitAmt.minus(creditAmt);
      const sign = netAmount.gt(0) ? '+' : '';
      
      console.log(`${index + 1}. Journal Entry: ${line.journalEntry.referenceNumber}`);
      console.log(`   Date: ${line.journalEntry.transactionDate.toISOString().split('T')[0]}`);
      console.log(`   Description: ${line.journalEntry.description}`);
      console.log(`   Debit: $${debitAmt.toString()}`);
      console.log(`   Credit: $${creditAmt.toString()}`);
      console.log(`   Net: ${sign}$${netAmount.toString()}`);
      console.log(`   Has Cashbook Entry: ${line.journalEntry.cashbookEntries.length > 0 ? '✅ YES' : '❌ NO'}`);
      if (line.journalEntry.cashbookEntries.length > 0) {
        line.journalEntry.cashbookEntries.forEach(cb => {
          console.log(`      - ${cb.reference}: ${cb.description} (${cb.type})`);
        });
      }
      console.log('');
    });

    const netBalance = totalDebits.minus(totalCredits);
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`📊 Portfolio Investments Summary:`);
    console.log(`   Total Debits: $${totalDebits.toString()}`);
    console.log(`   Total Credits: $${totalCredits.toString()}`);
    console.log(`   Net Balance: $${netBalance.toString()}\n`);

    // Check the bank receipt transaction
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('🔍 Checking Bank Receipt (CB-GSX0669D):\n');
    
    const bankReceiptJE = await prisma.journalEntry.findFirst({
      where: {
        referenceNumber: 'CB-GSX0669D'
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        },
        cashbookEntries: true
      }
    });

    if (bankReceiptJE) {
      console.log(`Reference: ${bankReceiptJE.referenceNumber}`);
      console.log(`Description: ${bankReceiptJE.description}`);
      console.log(`Date: ${bankReceiptJE.transactionDate.toISOString().split('T')[0]}\n`);
      console.log('Journal Entry Lines:');
      bankReceiptJE.journalEntryLines.forEach((line, index) => {
        console.log(`\n  ${index + 1}. Account: ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}`);
        console.log(`     Type: ${line.chartOfAccount.accountType}`);
        console.log(`     Debit: $${line.debitAmount}`);
        console.log(`     Credit: $${line.creditAmount}`);
      });

      const hasPortfolioLine = bankReceiptJE.journalEntryLines.some(l => 
        l.chartOfAccount.accountNo === '1501' || 
        l.chartOfAccount.accountName.toLowerCase().includes('portfolio')
      );

      console.log(`\n\n💡 Explanation:\n`);
      console.log('═══════════════════════════════════════════════════════\n');
      
      if (hasPortfolioLine) {
        console.log('❌ PROBLEM: This bank receipt affects Portfolio Investments!');
        console.log('   This is WRONG - a bank receipt should NOT affect investments.\n');
      } else {
        console.log('✅ CORRECT: This bank receipt does NOT affect Portfolio Investments');
        console.log('   It affects:');
        console.log('   - Bank Account (debit - cash coming in)');
        console.log('   - Management Fees Income (credit - revenue earned)\n');
        console.log('This is a REVENUE transaction, not an INVESTMENT transaction.\n');
        console.log('❓ Why you might be confused:');
        console.log('   - The $20k fund disbursement (FD-CMI36LP4) we deleted was the INVESTMENT');
        console.log('   - That one would have shown in Portfolio Investments');
        console.log('   - But we deleted it because it was missing the cashbook link');
        console.log('   - This bank receipt (CB-GSX0669D) is a different transaction (income)\n');
      }
    }

    // Check fund disbursements
    console.log('═══════════════════════════════════════════════════════\n');
    console.log('💰 Checking Fund Disbursements:\n');
    
    const fundDisbursements = await prisma.fundDisbursement.findMany({
      where: {
        status: { in: ['APPROVED', 'DISBURSED'] }
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
            journalEntry: true
          }
        }
      },
      orderBy: {
        disbursementDate: 'asc'
      }
    });

    console.log(`Found ${fundDisbursements.length} approved/disbursed fund disbursement(s):\n`);
    
    fundDisbursements.forEach((fd, index) => {
      console.log(`${index + 1}. Fund Disbursement:`);
      console.log(`   ID: ${fd.id.substring(0, 8)}...`);
      console.log(`   Amount: $${fd.amount}`);
      console.log(`   Date: ${fd.disbursementDate.toISOString().split('T')[0]}`);
      console.log(`   Status: ${fd.status}`);
      console.log(`   Portfolio Company: ${fd.investmentImplementation?.portfolioCompany?.name || 'N/A'}`);
      console.log(`   Has Cashbook Entry: ${fd.cashbookEntry ? '✅ YES' : '❌ NO'}`);
      if (fd.cashbookEntry) {
        console.log(`   Cashbook Reference: ${fd.cashbookEntry.reference}`);
        if (fd.cashbookEntry.journalEntry) {
          console.log(`   Journal Entry: ${fd.cashbookEntry.journalEntry.referenceNumber}`);
        }
      }
      console.log('');
    });

    // Check if there's a $20k disbursement missing
    const missing20k = fundDisbursements.find(fd => 
      Number(fd.amount) === 20000 && 
      fd.investmentImplementation?.portfolioCompany?.name?.toLowerCase().includes('thread')
    );

    if (!missing20k) {
      console.log('⚠️  NOTE: The $20k disbursement to "Threaded Numbers" was deleted');
      console.log('   because it was missing the cashbook link.');
      console.log('   This is why it\'s not showing in Portfolio Investments.\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

investigatePortfolioInvestments();


