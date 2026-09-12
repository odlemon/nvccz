// @ts-nocheck
import { prisma } from "../src/utils/database";
import { InvestmentImplementationService } from "../src/services/InvestmentImplementationService";

const COMPANY_NAME = "Vexma Tech";
const APPROVER_EMAIL = "nyasha@lysp.io";

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
    console.log(`   Applicant: ${application.applicantName}`);
    console.log(`   Email: ${application.applicantEmail}`);
    console.log(`   Current Stage: ${application.currentStage}\n`);

    // Check if investment implementation exists
    if (!application.investmentImplementation) {
      console.log(`❌ No investment implementation found for this application`);
      console.log(`   Please create an investment implementation first`);
      await prisma.$disconnect();
      return;
    }

    const implementation = application.investmentImplementation;
    console.log(`✅ Found investment implementation:`);
    console.log(`   Implementation ID: ${implementation.id}`);
    console.log(`   Portfolio Company: ${implementation.portfolioCompany?.name || 'N/A'}`);
    console.log(`   Fund: ${implementation.fund?.name || 'N/A'}`);
    console.log(`   Status: ${implementation.status}`);
    console.log(`   Funds Disbursed: ${implementation.fundsDisbursed}\n`);

    // Check for fund disbursements
    const disbursements = implementation.fundDisbursements || [];
    console.log(`📊 Found ${disbursements.length} fund disbursement(s):`);
    
    if (disbursements.length === 0) {
      console.log(`   ⚠️  No fund disbursements found. Please create a disbursement first.`);
      await prisma.$disconnect();
      return;
    }

    for (const disb of disbursements) {
      console.log(`   - Disbursement ID: ${disb.id}`);
      console.log(`     Amount: $${Number(disb.amount).toLocaleString()}`);
      console.log(`     Status: ${disb.status}`);
      console.log(`     Type: ${disb.disbursementType}`);
      console.log(`     Date: ${disb.disbursementDate}`);
      console.log(``);
    }

    // Find pending disbursements
    const pendingDisbursements = disbursements.filter(d => d.status === 'PENDING');
    
    if (pendingDisbursements.length === 0) {
      console.log(`⚠️  No pending disbursements found. All disbursements are already processed.`);
      await prisma.$disconnect();
      return;
    }

    console.log(`📋 Found ${pendingDisbursements.length} pending disbursement(s) to approve\n`);

    // Find the approver user
    console.log(`🔍 Step 2: Finding approver user "${APPROVER_EMAIL}"...\n`);
    
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
      console.log(`   Please check the email address or create the user first`);
      await prisma.$disconnect();
      return;
    }

    console.log(`✅ Found approver user:`);
    console.log(`   User ID: ${approver.id}`);
    console.log(`   Name: ${approver.firstName} ${approver.lastName}`);
    console.log(`   Email: ${approver.email}`);
    console.log(`   Role: ${approver.role?.name || approver.roleCode || 'N/A'}\n`);

    // Check if user has permission (admin or fund_manager role)
    const roleName = approver.role?.name?.toLowerCase() || '';
    const roleCode = approver.roleCode?.toUpperCase() || '';
    const isAdmin = roleName === 'admin' || roleCode === 'ADMIN';
    const isFundManager = roleName === 'fund manager' || roleCode === 'FUND_MGR';

    if (!isAdmin && !isFundManager) {
      console.log(`⚠️  Warning: User does not have admin or fund_manager role`);
      console.log(`   Role: ${approver.role?.name || approver.roleCode}`);
      console.log(`   Proceeding anyway...\n`);
    }

    // Approve each pending disbursement
    console.log(`🔍 Step 3: Approving pending disbursements...\n`);

    for (const disbursement of pendingDisbursements) {
      try {
        console.log(`📝 Approving disbursement ${disbursement.id}...`);
        console.log(`   Amount: $${Number(disbursement.amount).toLocaleString()}`);

        const bank = await prisma.bank.findFirst({
          where: {
            isActive: true,
            glAccountId: { not: null },
            ...(disbursement.paymentCurrencyId
              ? { currencyId: disbursement.paymentCurrencyId }
              : {}),
          },
          orderBy: { name: "asc" },
        });
        if (!bank) {
          console.log(`   ❌ No active bank with GL for this tranche currency.`);
          continue;
        }

        const approvedDisbursement = await InvestmentImplementationService.approveFundDisbursement(
          disbursement.id,
          approver.id,
          bank.id
        );

        console.log(`   ✅ Successfully approved!`);
        console.log(`   New Status: ${approvedDisbursement.status}`);
        console.log(`   Approved At: ${approvedDisbursement.approvedAt}`);
        console.log(``);
      } catch (error: any) {
        console.log(`   ❌ Failed to approve disbursement: ${error.message}`);
        console.log(``);
      }
    }

    console.log(`🎉 Disbursement approval process completed!`);

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
