import { PrismaClient } from '@prisma/client';
import { InvestmentImplementationService } from '../src/services/InvestmentImplementationService';

const prisma = new PrismaClient();

async function testFundDisbursementJournalEntry() {
  try {
    console.log('🔍 Finding an application with investment implementation...\n');

    // Find any investment implementation
    const implementation = await prisma.investmentImplementation.findFirst({
      include: {
        application: {
          select: {
            id: true,
            businessName: true,
            applicantName: true,
            applicantEmail: true,
            currentStage: true
          }
        },
        portfolioCompany: {
          select: {
            id: true,
            name: true
          }
        },
        fund: {
          select: {
            id: true,
            name: true,
            remainingAmount: true
          }
        },
        fundDisbursements: {
          orderBy: { createdAt: 'desc' }
        }
      }
    }) as any;

    if (!implementation) {
      console.log('❌ No investment implementation found');
      await prisma.$disconnect();
      return;
    }

    const application = implementation.application;
    console.log('✅ Found application with investment implementation:');
    console.log(`   Application ID: ${application.id}`);
    console.log(`   Business Name: ${application.businessName}`);
    console.log(`   Applicant: ${application.applicantName}`);
    console.log(`   Email: ${application.applicantEmail}`);
    console.log(`   Current Stage: ${application.currentStage}`);
    console.log('');

    console.log('✅ Investment Implementation found:');
    console.log(`   Implementation ID: ${implementation.id}`);
    console.log(`   Status: ${implementation.status}`);
    console.log(`   Portfolio Company: ${implementation.portfolioCompany?.name || 'N/A'}`);
    console.log(`   Fund: ${implementation.fund?.name || 'N/A'}`);
    console.log(`   Fund Remaining: $${Number(implementation.fund?.remainingAmount || 0).toLocaleString()}`);
    console.log('');

    // Check for existing disbursements
    const existingDisbursements = implementation.fundDisbursements || [];
    console.log(`📊 Existing Disbursements: ${existingDisbursements.length}`);
    
    if (existingDisbursements.length > 0) {
      console.log('   Existing disbursements:');
      for (const d of existingDisbursements) {
        console.log(`     - ${d.id.substring(0, 8)}: $${Number((d as any).amount).toLocaleString()} - Status: ${(d as any).status}`);
      }
      console.log('');
    }
    
    let disbursementToApprove = existingDisbursements.find((d: any) => d.status === 'PENDING');
    
    if (!disbursementToApprove) {
      console.log('   No PENDING disbursement found. Creating a new one...\n');
      
      // Use a smaller amount that fits within the fund's remaining balance
      const fundRemaining = Number(implementation.fund?.remainingAmount || 0);
      const testAmount = fundRemaining > 0 ? Math.min(1000, fundRemaining) : 1000; // Use $1,000 or whatever is available
      
      console.log(`   Creating disbursement for $${testAmount.toLocaleString()} (Fund has $${fundRemaining.toLocaleString()} remaining)`);
      
      // Create a new fund disbursement
      const newDisbursement = await InvestmentImplementationService.createFundDisbursement({
        investmentImplementationId: implementation.id,
        amount: testAmount,
        disbursementDate: new Date(),
        disbursementType: 'INITIAL',
        notes: 'Test disbursement for journal entry creation'
      });

      console.log('✅ Created new fund disbursement:');
      console.log(`   Disbursement ID: ${newDisbursement.id}`);
      console.log(`   Amount: $${Number(newDisbursement.amount).toLocaleString()}`);
      console.log(`   Status: ${newDisbursement.status}`);
      console.log('');

      disbursementToApprove = newDisbursement as any;
    } else {
      console.log('✅ Found PENDING disbursement:');
      console.log(`   Disbursement ID: ${disbursementToApprove.id}`);
      console.log(`   Amount: $${Number((disbursementToApprove as any).amount).toLocaleString()}`);
      console.log(`   Type: ${(disbursementToApprove as any).disbursementType}`);
      console.log('');
    }

    // Check if accounts exist
    console.log('🔍 Checking required accounts in chart of accounts...\n');

    const portfolioAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        OR: [
          { accountNo: "1501" },
          { accountName: { contains: "Portfolio Investment" } }
        ],
        isActive: true
      }
    });

    const bankAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        OR: [
          { accountNo: "1010" },
          { accountName: { contains: "Main Bank Account" } }
        ],
        isActive: true
      }
    });

    if (!portfolioAccount) {
      console.log('❌ Portfolio Investments account (1501) not found!');
      console.log('   Please create this account in the chart of accounts');
      await prisma.$disconnect();
      return;
    }

    if (!bankAccount) {
      console.log('❌ Main Bank Account (1010) not found!');
      console.log('   Please create this account in the chart of accounts');
      await prisma.$disconnect();
      return;
    }

    console.log('✅ Required accounts found:');
    console.log(`   ${portfolioAccount.accountNo} - ${portfolioAccount.accountName}`);
    console.log(`   ${bankAccount.accountNo} - ${bankAccount.accountName}`);
    console.log('');

    // Get a user to approve (use admin or first user)
    const approver = await prisma.user.findFirst({
      where: {
        role: {
          name: {
            in: ['admin', 'fund_manager']
          }
        }
      }
    });

    if (!approver) {
      console.log('❌ No admin or fund_manager user found to approve disbursement');
      await prisma.$disconnect();
      return;
    }

    console.log(`👤 Approver: ${approver.firstName} ${approver.lastName} (${approver.email})`);
    console.log('');

    // Approve the disbursement (this will create the journal entry)
    console.log('💰 Approving fund disbursement...');
    console.log('   This will automatically create a balanced journal entry:');
    console.log(`   DR 1501 - Portfolio Investments: $${Number(disbursementToApprove.amount).toLocaleString()}`);
    console.log(`   CR 1010 - Main Bank Account: $${Number(disbursementToApprove.amount).toLocaleString()}`);
    console.log('');

    const approvedDisbursement = await InvestmentImplementationService.approveFundDisbursement(
      disbursementToApprove.id,
      approver.id
    );

    console.log('✅ Disbursement approved successfully!');
    console.log(`   Status: ${approvedDisbursement.status}`);
    console.log(`   Approved At: ${approvedDisbursement.approvedAt}`);
    console.log('');

    // Verify the journal entry was created
    console.log('🔍 Verifying journal entry was created...\n');

    const journalEntry = await prisma.journalEntry.findFirst({
      where: {
        referenceNumber: {
          contains: `FD-${disbursementToApprove.id.substring(0, 8).toUpperCase()}`
        }
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!journalEntry) {
      console.log('❌ Journal entry not found!');
      await prisma.$disconnect();
      return;
    }

    console.log('✅ Journal Entry Created:');
    console.log(`   Reference: ${journalEntry.referenceNumber}`);
    console.log(`   Description: ${journalEntry.description}`);
    console.log(`   Transaction Date: ${journalEntry.transactionDate}`);
    console.log(`   Status: ${journalEntry.status}`);
    console.log(`   Total Amount: $${Number(journalEntry.totalAmount).toLocaleString()}`);
    console.log('');

    console.log('📊 Journal Entry Lines:');
    let totalDebits = 0;
    let totalCredits = 0;

    for (const line of journalEntry.journalEntryLines) {
      const debit = Number(line.debitAmount);
      const credit = Number(line.creditAmount);
      totalDebits += debit;
      totalCredits += credit;

      if (debit > 0) {
        console.log(`   DR ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}: $${debit.toLocaleString()}`);
      }
      if (credit > 0) {
        console.log(`   CR ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}: $${credit.toLocaleString()}`);
      }
    }

    console.log('');
    console.log('📊 Balance Verification:');
    console.log(`   Total Debits: $${totalDebits.toLocaleString()}`);
    console.log(`   Total Credits: $${totalCredits.toLocaleString()}`);
    
    if (Math.abs(totalDebits - totalCredits) < 0.01) {
      console.log('   ✅ Journal entry is BALANCED!');
    } else {
      console.log('   ❌ Journal entry is NOT balanced!');
      console.log(`   Difference: $${Math.abs(totalDebits - totalCredits).toLocaleString()}`);
    }

    console.log('');
    console.log('🎉 Test completed successfully!');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testFundDisbursementJournalEntry();

