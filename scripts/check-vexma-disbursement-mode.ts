// @ts-nocheck
import { prisma } from "../src/utils/database";

const COMPANY_NAME = "Vexma Tech";

async function main() {
  try {
    console.log(`🔍 Checking disbursement mode for "${COMPANY_NAME}"...\n`);

    // Find the portfolio company
    const portfolioCompany = await prisma.portfolioCompany.findFirst({
      where: {
        name: {
          contains: COMPANY_NAME
        }
      },
      include: {
        investmentImplementation: {
          include: {
            fund: {
              select: {
                id: true,
                name: true
              }
            },
            fundDisbursements: {
              select: {
                id: true,
                amount: true,
                status: true,
                disbursementType: true,
                disbursementDate: true,
                milestoneId: true
              },
              orderBy: { createdAt: 'desc' }
            }
          }
        },
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true
          }
        }
      }
    });

    if (!portfolioCompany) {
      console.log(`❌ Portfolio company "${COMPANY_NAME}" not found`);
      await prisma.$disconnect();
      return;
    }

    console.log(`✅ Found portfolio company:`);
    console.log(`   Company ID: ${portfolioCompany.id}`);
    console.log(`   Name: ${portfolioCompany.name}`);
    console.log(`   User: ${portfolioCompany.user.firstName} ${portfolioCompany.user.lastName} (${portfolioCompany.user.email})\n`);

    if (!portfolioCompany.investmentImplementation) {
      console.log(`❌ No investment implementation found for this company`);
      await prisma.$disconnect();
      return;
    }

    const implementation = portfolioCompany.investmentImplementation;
    console.log(`✅ Found investment implementation:`);
    console.log(`   Implementation ID: ${implementation.id}`);
    console.log(`   Fund: ${implementation.fund?.name || 'N/A'}`);
    console.log(`   Disbursement Mode: ${implementation.disbursementMode || 'NOT SET'}`);
    console.log(`   Total Committed Amount: ${implementation.totalCommittedAmount ? Number(implementation.totalCommittedAmount).toLocaleString() : 'N/A'}`);
    console.log(`   Status: ${implementation.status}`);
    console.log(`   Funds Disbursed: ${implementation.fundsDisbursed}\n`);

    const disbursements = implementation.fundDisbursements || [];
    console.log(`📊 Found ${disbursements.length} disbursement(s):\n`);

    if (disbursements.length === 0) {
      console.log(`   ⚠️  No disbursements found`);
    } else {
      for (const disb of disbursements) {
        console.log(`   Disbursement ID: ${disb.id}`);
        console.log(`   Amount: $${Number(disb.amount).toLocaleString()}`);
        console.log(`   Status: ${disb.status}`);
        console.log(`   Type: ${disb.disbursementType}`);
        console.log(`   Date: ${disb.disbursementDate}`);
        console.log(`   Milestone ID: ${disb.milestoneId || 'N/A'}`);
        console.log(``);
      }
    }

    console.log(`\n📋 Summary:`);
    console.log(`   Disbursement Mode: ${implementation.disbursementMode || 'NOT SET'}`);
    if (implementation.disbursementMode === 'MILESTONE_BASED') {
      console.log(`   ✅ This is a MILESTONE_BASED disbursement`);
      console.log(`   Total Committed: $${implementation.totalCommittedAmount ? Number(implementation.totalCommittedAmount).toLocaleString() : 'N/A'}`);
    } else if (implementation.disbursementMode === 'ONE_TIME') {
      console.log(`   ✅ This is a ONE_TIME disbursement`);
    } else {
      console.log(`   ⚠️  Disbursement mode not set (defaults to ONE_TIME)`);
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
