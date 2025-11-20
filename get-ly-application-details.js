const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getApplicationDetails() {
  try {
    console.log('🔍 Getting application details for nyasha@lysp.io...\n');
    console.log('═══════════════════════════════════════════════════════\n');

    // Find application by applicant email
    const application = await prisma.application.findFirst({
      where: {
        applicantEmail: 'nyasha@lysp.io'
      },
      include: {
        termSheet: {
          select: {
            id: true,
            investmentAmount: true
          }
        },
        investmentImplementation: {
          include: {
            portfolioCompany: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      }
    });

    if (!application) {
      console.log('❌ Application not found');
      return;
    }

    console.log('✅ Application Details:\n');
    console.log(`   Application ID: ${application.id}`);
    console.log(`   Business Name: ${application.businessName}`);
    console.log(`   Current Stage: ${application.currentStage}\n`);

    // Get portfolio company
    let portfolioCompanyId = null;
    if (application.investmentImplementation && application.investmentImplementation.portfolioCompany) {
      portfolioCompanyId = application.investmentImplementation.portfolioCompany.id;
      console.log('✅ Portfolio Company (from investment implementation):');
      console.log(`   Portfolio Company ID: ${portfolioCompanyId}`);
      console.log(`   Company Name: ${application.investmentImplementation.portfolioCompany.name}\n`);
    } else {
      // Find portfolio company by user email
      const user = await prisma.user.findUnique({
        where: { email: 'nyasha@lysp.io' },
        include: {
          portfolioCompany: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      if (user && user.portfolioCompany) {
        portfolioCompanyId = user.portfolioCompany.id;
        console.log('✅ Portfolio Company (found via user):');
        console.log(`   Portfolio Company ID: ${portfolioCompanyId}`);
        console.log(`   Company Name: ${user.portfolioCompany.name}\n`);
      } else {
        console.log('⚠️  Portfolio Company not found\n');
      }
    }

    // Get available funds
    console.log('📊 Available Funds:\n');
    const funds = await prisma.fund.findMany({
      where: {
        status: { not: 'CLOSED' }
      },
      select: {
        id: true,
        name: true,
        totalAmount: true,
        remainingAmount: true,
        status: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (funds.length === 0) {
      console.log('   ⚠️  No active funds found\n');
    } else {
      funds.forEach((fund, index) => {
        console.log(`   ${index + 1}. Fund ID: ${fund.id}`);
        console.log(`      Name: ${fund.name}`);
        console.log(`      Total: $${Number(fund.totalAmount).toLocaleString()}`);
        console.log(`      Remaining: $${Number(fund.remainingAmount).toLocaleString()}\n`);
      });
    }

    console.log('═══════════════════════════════════════════════════════\n');
    console.log('📋 SUMMARY - Use these IDs:\n');
    console.log(`   Application ID: ${application.id}`);
    console.log(`   Portfolio Company ID: ${portfolioCompanyId || 'NOT FOUND - Need to create'}`);
    if (funds.length > 0) {
      console.log(`   Fund ID: ${funds[0].id} (${funds[0].name})`);
      console.log(`   Recommended Fund: ${funds[0].name} ($${Number(funds[0].remainingAmount).toLocaleString()} remaining)\n`);
    } else {
      console.log(`   Fund ID: NOT FOUND - Need to create a fund\n`);
    }

    // Check if investment implementation already exists
    if (portfolioCompanyId) {
      const existingImpl = await prisma.investmentImplementation.findUnique({
        where: { portfolioCompanyId: portfolioCompanyId }
      });

      if (existingImpl) {
        console.log('⚠️  Investment Implementation already exists:');
        console.log(`   Implementation ID: ${existingImpl.id}\n`);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

getApplicationDetails();

