// Script to check if user/company exist, then reset for logixvine@gmail.com
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkAndReset() {
  const email = 'logixvine@gmail.com';
  
  console.log('🔍 Checking application data for:', email);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: email },
      include: {
        portfolioCompany: true
      }
    });

    if (user) {
      console.log(`\n✅ User account found:`);
      console.log(`   - User ID: ${user.id}`);
      console.log(`   - Name: ${user.firstName} ${user.lastName}`);
      console.log(`   - Email: ${user.email}`);
      
      if (user.portfolioCompany) {
        console.log(`\n✅ Portfolio company found:`);
        console.log(`   - Company ID: ${user.portfolioCompany.id}`);
        console.log(`   - Company Name: ${user.portfolioCompany.name}`);
        console.log(`   - Status: ${user.portfolioCompany.status}`);
      } else {
        console.log(`\nℹ️  No portfolio company found for this user`);
      }
    } else {
      console.log(`\nℹ️  No user account found`);
    }

    // Find the application
    const application = await prisma.application.findFirst({
      where: { applicantEmail: email },
      include: {
        termSheet: true,
        boardReview: true,
        investmentImplementation: {
          include: {
            portfolioCompany: true,
            fundDisbursements: true
          }
        }
      }
    });

    if (!application) {
      console.log('\n❌ No application found for:', email);
      return;
    }

    console.log(`\n✅ Found application: ${application.id}`);
    console.log(`   Business: ${application.businessName}`);
    console.log(`   Stage: ${application.currentStage}`);

    // Now delete everything
    console.log('\n\n🗑️  DELETING DATA...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // Delete term sheet
    if (application.termSheet) {
      console.log(`\n🗑️  Deleting term sheet: ${application.termSheet.id}`);
      await prisma.termSheet.delete({
        where: { id: application.termSheet.id }
      });
      console.log('✅ Term sheet deleted');
    }

    // Delete investment implementation and related data
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

      // Delete investment implementation
      console.log(`\n🗑️  Deleting investment implementation: ${implementation.id}`);
      await prisma.investmentImplementation.delete({
        where: { id: implementation.id }
      });
      console.log('✅ Investment implementation deleted');
    }

    // Delete portfolio company (if exists)
    if (user && user.portfolioCompany) {
      console.log(`\n🗑️  Deleting portfolio company: ${user.portfolioCompany.id}`);
      await prisma.portfolioCompany.delete({
        where: { id: user.portfolioCompany.id }
      });
      console.log('✅ Portfolio company deleted');
    }

    // Delete user account (if exists)
    if (user) {
      console.log(`\n🗑️  Deleting user account: ${user.id}`);
      await prisma.user.delete({
        where: { id: user.id }
      });
      console.log('✅ User account deleted');
    }

    // Reset board review
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
    }

    // Reset application stage
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
    console.log('\n📋 Final Status:');
    console.log(`   - User Account: DELETED`);
    console.log(`   - Portfolio Company: DELETED`);
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

// Run the check and reset
checkAndReset()
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

