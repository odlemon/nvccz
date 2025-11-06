import { PrismaClient } from '@prisma/client';
import { InvestmentImplementationService } from '../src/services/InvestmentImplementationService';

const prisma = new PrismaClient();

async function testFundDisbursementAccounting() {
  try {
    console.log('🔍 Finding application with business name "Mapfumo Ent"...\n');

    // Find the application
    const application = await prisma.application.findFirst({
      where: {
        businessName: {
          contains: 'Mapfumo Ent',
          mode: 'insensitive'
        }
      },
      include: {
        investmentImplementation: {
          include: {
            portfolioCompany: true,
            fund: true,
            fundDisbursements: {
              orderBy: { createdAt: 'desc' }
            }
          }
        }
      }
    });

    if (!application) {
      console.log('❌ Application with business name "Mapfumo Ent" not found');
      await prisma.$disconnect();
      return;
    }

    console.log('✅ Found application:');
    console.log(`   Application ID: ${application.id}`);
    console.log(`   Business Name: ${application.businessName}`);
    console.log(`   Applicant: ${application.applicantName}`);
    console.log(`   Email: ${application.applicantEmail}`);
    console.log(`   Current Stage: ${application.currentStage}`);
    console.log('');

    // Check if investment implementation exists
    if (!application.investmentImplementation) {
      console.log('❌ No investment implementation found for this application');
      console.log('   Please create an investment implementation first');
      await prisma.$disconnect();
      return;
    }

    const implementation = application.investmentImplementation;
    console.log('✅ Found investment implementation:');
    console.log(`   Implementation ID: ${implementation.id}`);
    console.log(`   Portfolio Company: ${implementation.portfolioCompany?.name || 'N/A'}`);
    console.log(`   Fund: ${implementation.fund?.name || 'N/A'}`);
    console.log(`   Fund Remaining Amount: $${Number(implementation.fund?.remainingAmount || 0).toLocaleString()}`);
    console.log('');

    // Check existing disbursements
    const existingDisbursements = implementation.fundDisbursements || [];
    console.log(`📊 Existing disbursements: ${existingDisbursements.length}`);
    
    if (existingDisbursements.length > 0) {
      existingDisbursements.forEach((disb, index) => {
        console.log(`   ${index + 1}. Status: ${disb.status}, Amount: $${Number(disb.amount).toLocaleString()}, Date: ${disb.disbursementDate.toISOString().split('T')[0]}`);
      });
      console.log('');
    }

    // Find a PENDING disbursement or create a new one
    let disbursement = existingDisbursements.find(d => d.status === 'PENDING');

    if (!disbursement) {
      console.log('📝 Creating a new fund disbursement for testing...');
      
      // Get an admin user for approval
      const adminUser = await prisma.user.findFirst({
        where: {
          role: {
            name: 'admin'
          }
        }
      });

      if (!adminUser) {
        console.log('❌ No admin user found. Cannot create disbursement.');
        await prisma.$disconnect();
        return;
      }

      // Create a test disbursement
      const disbursementData = {
        investmentImplementationId: implementation.id,
        amount: 1000000, // $1,000,000 as per requirements
        disbursementDate: new Date(),
        disbursementType: 'INITIAL',
        notes: 'Test disbursement for accounting verification'
      };

      disbursement = await InvestmentImplementationService.createFundDisbursement(disbursementData);
      console.log(`✅ Created disbursement: ${disbursement.id}`);
      console.log(`   Amount: $${Number(disbursement.amount).toLocaleString()}`);
      console.log(`   Status: ${disbursement.status}`);
      console.log('');
    } else {
      console.log(`✅ Using existing PENDING disbursement: ${disbursement.id}`);
      console.log(`   Amount: $${Number(disbursement.amount).toLocaleString()}`);
      console.log('');
    }

    // Check if accounts exist
    console.log('🔍 Checking required accounts in chart of accounts...\n');

    const portfolioAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        OR: [
          { accountNo: "1501" },
          { accountName: { contains: "Portfolio Investment", mode: "insensitive" } }
        ],
        isActive: true
      }
    });

    const bankAccount = await prisma.chartOfAccounts.findFirst({
      where: {
        OR: [
          { accountNo: "1010" },
          { accountName: { contains: "Main Bank Account", mode: "insensitive" } }
        ],
        isActive: true
      }
    });

    if (!portfolioAccount) {
      console.log('⚠️  WARNING: Portfolio Investments account (1501) not found!');
      console.log('   The approval will fail if this account is missing.');
      console.log('');
    } else {
      console.log(`✅ Found Portfolio Investments account:`);
      console.log(`   Account No: ${portfolioAccount.accountNo}`);
      console.log(`   Account Name: ${portfolioAccount.accountName}`);
      console.log('');
    }

    if (!bankAccount) {
      console.log('⚠️  WARNING: Main Bank Account (1010) not found!');
      console.log('   The approval will fail if this account is missing.');
      console.log('');
    } else {
      console.log(`✅ Found Main Bank Account:`);
      console.log(`   Account No: ${bankAccount.accountNo}`);
      console.log(`   Account Name: ${bankAccount.accountName}`);
      console.log('');
    }

    // Get admin user for approval
    const adminUser = await prisma.user.findFirst({
      where: {
        role: {
          name: 'admin'
        }
      }
    });

    if (!adminUser) {
      console.log('❌ No admin user found. Cannot approve disbursement.');
      await prisma.$disconnect();
      return;
    }

    console.log('🧪 Testing fund disbursement approval with automatic journal entry creation...\n');
    console.log(`   Disbursement ID: ${disbursement.id}`);
    console.log(`   Amount: $${Number(disbursement.amount).toLocaleString()}`);
    console.log(`   Approved By: ${adminUser.email}`);
    console.log('');

    // Count journal entries before approval
    const journalEntriesBefore = await prisma.journalEntry.count({
      where: {
        description: {
          contains: 'Fund Disbursement',
          mode: 'insensitive'
        }
      }
    });

    console.log(`📊 Journal entries before approval: ${journalEntriesBefore}`);

    // Approve the disbursement (this should create the journal entry)
    try {
      const approvedDisbursement = await InvestmentImplementationService.approveFundDisbursement(
        disbursement.id,
        adminUser.id
      );

      console.log('\n✅ Disbursement approved successfully!');
      console.log(`   Status: ${approvedDisbursement.status}`);
      console.log(`   Approved At: ${approvedDisbursement.approvedAt}`);
      console.log('');

      // Find the journal entry that was created
      const journalEntriesAfter = await prisma.journalEntry.count({
        where: {
          description: {
            contains: 'Fund Disbursement',
            mode: 'insensitive'
          }
        }
      });

      console.log(`📊 Journal entries after approval: ${journalEntriesAfter}`);
      console.log(`   New journal entries created: ${journalEntriesAfter - journalEntriesBefore}`);
      console.log('');

      // Get the latest journal entry
      const latestJournalEntry = await prisma.journalEntry.findFirst({
        where: {
          description: {
            contains: 'Fund Disbursement',
            mode: 'insensitive'
          }
        },
        include: {
          journalEntryLines: {
            include: {
              chartOfAccount: true
            }
          },
          createdBy: {
            select: {
              email: true,
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });

      if (latestJournalEntry) {
        console.log('📝 Journal Entry Details:');
        console.log(`   Reference Number: ${latestJournalEntry.referenceNumber}`);
        console.log(`   Description: ${latestJournalEntry.description}`);
        console.log(`   Transaction Date: ${latestJournalEntry.transactionDate.toISOString().split('T')[0]}`);
        console.log(`   Status: ${latestJournalEntry.status}`);
        console.log(`   Total Amount: $${Number(latestJournalEntry.totalAmount).toLocaleString()}`);
        console.log(`   Created By: ${latestJournalEntry.createdBy?.firstName} ${latestJournalEntry.createdBy?.lastName} (${latestJournalEntry.createdBy?.email})`);
        console.log('');

        console.log('📋 Journal Entry Lines:');
        let totalDebits = 0;
        let totalCredits = 0;

        latestJournalEntry.journalEntryLines.forEach((line, index) => {
          const debit = Number(line.debitAmount);
          const credit = Number(line.creditAmount);
          totalDebits += debit;
          totalCredits += credit;

          console.log(`   Line ${index + 1}:`);
          console.log(`      Account: ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}`);
          console.log(`      Debit: $${debit.toLocaleString()}`);
          console.log(`      Credit: $${credit.toLocaleString()}`);
          console.log(`      Description: ${line.description}`);
          console.log('');
        });

        console.log('💰 Balance Verification:');
        console.log(`   Total Debits: $${totalDebits.toLocaleString()}`);
        console.log(`   Total Credits: $${totalCredits.toLocaleString()}`);
        console.log(`   Difference: $${Math.abs(totalDebits - totalCredits).toLocaleString()}`);
        
        if (Math.abs(totalDebits - totalCredits) < 0.01) {
          console.log('   ✅ Journal entry is BALANCED!');
        } else {
          console.log('   ❌ Journal entry is NOT balanced!');
        }
        console.log('');

        // Verify the accounts used
        const debitAccount = latestJournalEntry.journalEntryLines.find(l => Number(l.debitAmount) > 0);
        const creditAccount = latestJournalEntry.journalEntryLines.find(l => Number(l.creditAmount) > 0);

        console.log('✅ Account Verification:');
        if (debitAccount) {
          console.log(`   Debit Account: ${debitAccount.chartOfAccount.accountNo} - ${debitAccount.chartOfAccount.accountName}`);
          if (debitAccount.chartOfAccount.accountNo === '1501' || debitAccount.chartOfAccount.accountName.toLowerCase().includes('portfolio')) {
            console.log('   ✅ Correct debit account (Portfolio Investments)');
          } else {
            console.log('   ⚠️  Debit account may not be correct (expected 1501 - Portfolio Investments)');
          }
        }
        if (creditAccount) {
          console.log(`   Credit Account: ${creditAccount.chartOfAccount.accountNo} - ${creditAccount.chartOfAccount.accountName}`);
          if (creditAccount.chartOfAccount.accountNo === '1010' || creditAccount.chartOfAccount.accountName.toLowerCase().includes('main bank')) {
            console.log('   ✅ Correct credit account (Main Bank Account)');
          } else {
            console.log('   ⚠️  Credit account may not be correct (expected 1010 - Main Bank Account)');
          }
        }
        console.log('');

      } else {
        console.log('⚠️  No journal entry found after approval');
      }

      console.log('🎉 Test completed successfully!');

    } catch (error: any) {
      console.error('❌ Error approving disbursement:', error.message);
      console.error(error.stack);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

testFundDisbursementAccounting();

