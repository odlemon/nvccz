// @ts-nocheck
import { prisma } from "../src/utils/database";
import { InvestmentImplementationService } from "../src/services/InvestmentImplementationService";

const COMPANY_NAME = "Vexma Tech";
const DISBURSER_EMAIL = "nyasha@lysp.io";

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
    console.log(`   Implementation ID: ${implementation.id}\n`);

    // Find approved disbursements
    const approvedDisbursements = implementation.fundDisbursements.filter(
      d => d.status === 'APPROVED'
    );

    if (approvedDisbursements.length === 0) {
      console.log(`⚠️  No approved disbursements found. Please approve a disbursement first.`);
      await prisma.$disconnect();
      return;
    }

    console.log(`📊 Found ${approvedDisbursements.length} approved disbursement(s):`);
    for (const disb of approvedDisbursements) {
      console.log(`   - Disbursement ID: ${disb.id}`);
      console.log(`     Amount: $${Number(disb.amount).toLocaleString()}`);
      console.log(`     Status: ${disb.status}`);
      console.log(`     Approved At: ${disb.approvedAt || 'N/A'}`);
      console.log(``);
    }

    // Find the disburser user
    console.log(`🔍 Step 2: Finding disburser user "${DISBURSER_EMAIL}"...\n`);
    
    const disburser = await prisma.user.findUnique({
      where: {
        email: DISBURSER_EMAIL.toLowerCase()
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

    if (!disburser) {
      console.log(`❌ User "${DISBURSER_EMAIL}" not found`);
      await prisma.$disconnect();
      return;
    }

    console.log(`✅ Found disburser user:`);
    console.log(`   User ID: ${disburser.id}`);
    console.log(`   Name: ${disburser.firstName} ${disburser.lastName}`);
    console.log(`   Email: ${disburser.email}`);
    console.log(`   Role: ${disburser.role?.name || disburser.roleCode || 'N/A'}\n`);

    // Mark each approved disbursement as disbursed
    console.log(`🔍 Step 3: Marking disbursements as disbursed...\n`);

    for (const disbursement of approvedDisbursements) {
      try {
        console.log(`📝 Marking disbursement ${disbursement.id} as disbursed...`);
        console.log(`   Amount: $${Number(disbursement.amount).toLocaleString()}`);
        
        const disbursed = await InvestmentImplementationService.markDisbursementAsDisbursed(
          disbursement.id,
          disburser.id,
          `DISB-${disbursement.id.substring(0, 8).toUpperCase()}` // Transaction reference
        );

        console.log(`   ✅ Successfully marked as disbursed!`);
        console.log(`   New Status: ${disbursed.status}`);
        console.log(`   Disbursed At: ${disbursed.disbursedAt}`);
        console.log(`   Transaction Reference: ${disbursed.transactionReference || 'N/A'}`);
        console.log(``);
      } catch (error: any) {
        console.log(`   ❌ Failed to mark as disbursed: ${error.message}`);
        console.log(``);
      }
    }

    // Check final application status
    const updatedApplication = await prisma.application.findUnique({
      where: { id: application.id },
      select: {
        id: true,
        businessName: true,
        currentStage: true
      }
    });

    console.log(`📊 Final Application Status:`);
    console.log(`   Application ID: ${updatedApplication?.id}`);
    console.log(`   Business Name: ${updatedApplication?.businessName}`);
    console.log(`   Current Stage: ${updatedApplication?.currentStage}\n`);

    // Check implementation status
    const updatedImplementation = await prisma.investmentImplementation.findUnique({
      where: { id: implementation.id },
      select: {
        id: true,
        status: true,
        fundsDisbursed: true
      }
    });

    console.log(`📊 Final Implementation Status:`);
    console.log(`   Implementation ID: ${updatedImplementation?.id}`);
    console.log(`   Status: ${updatedImplementation?.status}`);
    console.log(`   Funds Disbursed: ${updatedImplementation?.fundsDisbursed}\n`);

    console.log(`🎉 Disbursement marking process completed!`);

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
