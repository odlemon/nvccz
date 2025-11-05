// Script to reset application data for logixvine@gmail.com
// This deletes: term sheet, portfolio company, user account, and resets board review
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetLogixvineApplication() {
  const email = 'logixvine@gmail.com';
  
  console.log('🔄 Resetting application data for:', email);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    // Find the application
    const application = await prisma.application.findFirst({
      where: { applicantEmail: email },
      include: {
        termSheet: true,
        boardReview: true,
        investmentImplementation: {
          include: {
            portfolioCompany: {
              include: {
                user: true
              }
            },
            fundDisbursements: true
          }
        }
      }
    });

    if (!application) {
      console.log('❌ No application found for:', email);
      return;
    }

    console.log(`\n✅ Found application: ${application.id}`);
    console.log(`   Business: ${application.businessName}`);
    console.log(`   Stage: ${application.currentStage}`);

    // Step 1: Delete term sheet if exists
    if (application.termSheet) {
      console.log(`\n🗑️  Deleting term sheet: ${application.termSheet.id}`);
      await prisma.termSheet.delete({
        where: { id: application.termSheet.id }
      });
      console.log('✅ Term sheet deleted');
    } else {
      console.log('\nℹ️  No term sheet found');
    }

    // Step 2: Delete fund disbursements and investment implementation if exists
    if (application.investmentImplementation) {
      const implementation = application.investmentImplementation;
      
      // Delete fund disbursements
      if (implementation.fundDisbursements && implementation.fundDisbursements.length > 0) {
        console.log(`\n🗑️  Deleting ${implementation.fundDisbursements.length} fund disbursements...`);
        for (const disbursement of implementation.fundDisbursements) {
          await prisma.fundDisbursement.delete({
            where: { id: disbursement.id }
          });
        }
        console.log('✅ Fund disbursements deleted');
      }

      // Get portfolio company before deleting implementation
      const portfolioCompanyId = implementation.portfolioCompanyId;
      
      // Delete investment implementation
      console.log(`\n🗑️  Deleting investment implementation: ${implementation.id}`);
      await prisma.investmentImplementation.delete({
        where: { id: implementation.id }
      });
      console.log('✅ Investment implementation deleted');

      // Delete portfolio company if it exists
      if (portfolioCompanyId) {
        const portfolioCompany = await prisma.portfolioCompany.findUnique({
          where: { id: portfolioCompanyId }
        });
        
        if (portfolioCompany) {
          console.log(`\n🗑️  Deleting portfolio company: ${portfolioCompany.id}`);
          await prisma.portfolioCompany.delete({
            where: { id: portfolioCompany.id }
          });
          console.log('✅ Portfolio company deleted');
        }
      }
    } else {
      // Check if portfolio company exists independently (by user email)
      const user = await prisma.user.findUnique({
        where: { email: email },
        include: { portfolioCompany: true }
      });
      
      if (user && user.portfolioCompany) {
        console.log(`\n🗑️  Deleting portfolio company: ${user.portfolioCompany.id}`);
        await prisma.portfolioCompany.delete({
          where: { id: user.portfolioCompany.id }
        });
        console.log('✅ Portfolio company deleted');
      } else {
        console.log('\nℹ️  No portfolio company found');
      }
    }

    // Step 3: Delete user account if exists
    const user = await prisma.user.findUnique({
      where: { email: email }
    });

    if (user) {
      // Check if user has any other portfolio companies
      const otherCompanies = await prisma.portfolioCompany.findMany({
        where: { userId: user.id }
      });

      if (otherCompanies.length === 0) {
        console.log(`\n🗑️  Deleting user account: ${user.id}`);
        await prisma.user.delete({
          where: { id: user.id }
        });
        console.log('✅ User account deleted');
      } else {
        console.log(`\n⚠️  User has ${otherCompanies.length} other portfolio companies, keeping user account`);
      }
    } else {
      console.log('\nℹ️  No user account found');
    }

    // Step 4: Reset board review status (don't delete, just reset)
    if (application.boardReview) {
      console.log(`\n🔄 Resetting board review status: ${application.boardReview.id}`);
      await prisma.boardReview.update({
        where: { id: application.boardReview.id },
        data: {
          status: 'IN_PROGRESS',
          completedAt: null,
          updatedAt: new Date()
        }
      });
      console.log('✅ Board review reset to IN_PROGRESS');
    } else {
      console.log('\nℹ️  No board review found');
    }

    // Step 5: Reset application stage to UNDER_BOARD_REVIEW
    console.log(`\n🔄 Resetting application stage to UNDER_BOARD_REVIEW`);
    await prisma.application.update({
      where: { id: application.id },
      data: {
        currentStage: 'UNDER_BOARD_REVIEW',
        boardDecision: null,
        updatedAt: new Date()
      }
    });
    console.log('✅ Application stage reset to UNDER_BOARD_REVIEW');

    console.log('\n✅ Reset complete!');
    console.log('\n📋 Summary:');
    console.log(`   - Application ID: ${application.id}`);
    console.log(`   - Application Stage: UNDER_BOARD_REVIEW`);
    console.log(`   - Board Review Status: IN_PROGRESS`);
    console.log(`   - Ready to test board review completion`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the reset
resetLogixvineApplication()
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

