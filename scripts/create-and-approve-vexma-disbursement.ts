// @ts-nocheck
import { prisma } from "../src/utils/database";
import { InvestmentImplementationService } from "../src/services/InvestmentImplementationService";

const COMPANY_NAME = "Vexma Tech";
const APPROVER_EMAIL = "nyasha@lysp.io";
const DISBURSEMENT_AMOUNT = 10000; // Default amount, adjust as needed
const DISBURSEMENT_TYPE = "INITIAL"; // INITIAL, MILESTONE, or FINAL

async function main() {
  try {
    console.log(`🔍 Step 1: Finding application for "${COMPANY_NAME}"...\n`);

    // Find the application
    const application = await prisma.application.findFirst({
      where: {
        businessName: {
          contains: COMPANY_NAME
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
      console.log(`❌ Application for "${COMPANY_NAME}" not found`);
      await prisma.$disconnect();
      return;
    }

    console.log(`✅ Found application:`);
    console.log(`   Application ID: ${application.id}`);
    console.log(`   Business Name: ${application.businessName}`);
    console.log(`   Current Stage: ${application.currentStage}\n`);

    // Check if investment implementation exists
    if (!application.investmentImplementation) {
      console.log(`❌ No investment implementation found for this application`);
      await prisma.$disconnect();
      return;
    }

    const implementation = application.investmentImplementation;
    console.log(`✅ Found investment implementation:`);
    console.log(`   Implementation ID: ${implementation.id}`);
    console.log(`   Fund: ${implementation.fund?.name || 'N/A'}`);
    console.log(`   Fund ID: ${implementation.fundId}\n`);

    if (!implementation.fundId) {
      console.log(`❌ Investment implementation has no fund assigned`);
      await prisma.$disconnect();
      return;
    }

    // Check existing disbursements
    const existingDisbursements = implementation.fundDisbursements || [];
    console.log(`📊 Existing disbursements: ${existingDisbursements.length}`);
    
    // Find pending disbursements
    const pendingDisbursements = existingDisbursements.filter(d => d.status === 'PENDING');
    
    let disbursementId: string;

    if (pendingDisbursements.length > 0) {
      console.log(`✅ Found ${pendingDisbursements.length} pending disbursement(s), using the first one\n`);
      disbursementId = pendingDisbursements[0].id;
    } else {
      // Create a new disbursement
      console.log(`📝 Step 2: Creating new fund disbursement...\n`);
      
      const disbursement = await InvestmentImplementationService.createFundDisbursement({
        investmentImplementationId: implementation.id,
        amount: DISBURSEMENT_AMOUNT,
        disbursementDate: new Date(),
        disbursementType: DISBURSEMENT_TYPE,
        notes: `Initial disbursement for ${COMPANY_NAME}`
      });

      console.log(`✅ Created disbursement:`);
      console.log(`   Disbursement ID: ${disbursement.id}`);
      console.log(`   Amount: $${Number(disbursement.amount).toLocaleString()}`);
      console.log(`   Status: ${disbursement.status}`);
      console.log(`   Type: ${disbursement.disbursementType}\n`);

      disbursementId = disbursement.id;
    }

    // Find the approver user
    console.log(`🔍 Step 3: Finding approver user "${APPROVER_EMAIL}"...\n`);
    
    const approver = await prisma.user.findUnique({
      where: {
        email: APPROVER_EMAIL.toLowerCase()
      },
      include: {
        role: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    if (!approver) {
      console.log(`❌ User "${APPROVER_EMAIL}" not found`);
      await prisma.$disconnect();
      return;
    }

    console.log(`✅ Found approver user:`);
    console.log(`   User ID: ${approver.id}`);
    console.log(`   Name: ${approver.firstName} ${approver.lastName}`);
    console.log(`   Email: ${approver.email}`);
    console.log(`   Role: ${approver.role?.name || approver.roleCode || 'N/A'}\n`);

    // Approve the disbursement
    console.log(`🔍 Step 4: Approving disbursement...\n`);
    
    try {
      const approvedDisbursement = await InvestmentImplementationService.approveFundDisbursement(
        disbursementId,
        approver.id
      );

      console.log(`✅ Successfully approved disbursement!`);
      console.log(`   Disbursement ID: ${approvedDisbursement.id}`);
      console.log(`   Amount: $${Number(approvedDisbursement.amount).toLocaleString()}`);
      console.log(`   Status: ${approvedDisbursement.status}`);
      console.log(`   Approved By: ${approver.firstName} ${approver.lastName}`);
      console.log(`   Approved At: ${approvedDisbursement.approvedAt}`);
      console.log(`   Cashbook Entry ID: ${approvedDisbursement.cashbookEntryId || 'N/A'}\n`);

      console.log(`🎉 Fund disbursement created and approved successfully!`);

    } catch (error: any) {
      console.log(`❌ Failed to approve disbursement: ${error.message}`);
      if (error.stack) {
        console.error("Stack trace:", error.stack);
      }
    }

  } catch (error: any) {
    console.error("❌ Error:", error.message);
    if (error.stack) {
      console.error("Stack trace:", error.stack);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main();
