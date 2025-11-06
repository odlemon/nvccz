import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const email = 'logixvine@gmail.com';

async function resetAndDeleteLogixvine() {
  try {
    console.log('🔍 Finding application for:', email);
    
    // Find the application
    const application = await prisma.application.findFirst({
      where: { applicantEmail: email },
      include: {
        boardReview: true,
        investmentImplementation: {
          include: {
            portfolioCompany: {
              include: {
                user: true
              }
            }
          }
        }
      }
    });

    if (!application) {
      console.log('❌ Application not found for email:', email);
      return;
    }

    console.log('✅ Application found:');
    console.log(`   ID: ${application.id}`);
    console.log(`   Business Name: ${application.businessName}`);
    console.log(`   Applicant: ${application.applicantName}`);
    console.log(`   Current Stage: ${application.currentStage}`);
    console.log(`   Board Review: ${application.boardReview ? 'Exists' : 'None'}`);

    // Step 1: Reset board review to IN_PROGRESS and update application stage
    if (application.boardReview) {
      const boardReviewId = application.boardReview.id;
      console.log('\n🔄 Resetting board review to IN_PROGRESS...');
      
      // Reset board review
      await prisma.boardReview.update({
        where: { id: boardReviewId },
        data: {
          status: 'IN_PROGRESS',
          investmentApproved: false,
          investmentRejected: false,
          conditionalApproval: false,
          completedAt: null,
          decisionReason: null,
          conditions: null,
          nextSteps: null,
          finalComments: null
        }
      });
      console.log('✅ Board review reset to IN_PROGRESS');

      // Update application stage back to UNDER_BOARD_REVIEW
      await prisma.application.update({
        where: { id: application.id },
        data: {
          currentStage: 'UNDER_BOARD_REVIEW',
          boardDecision: null
        }
      });
      console.log('✅ Application stage reset to UNDER_BOARD_REVIEW');
    } else {
      console.log('⚠️  No board review found to reset');
    }

    // Step 2: Find portfolio company and user
    let portfolioCompany = null;
    let user = null;

    // Check investment implementation for portfolio company
    if (application.investmentImplementation && application.investmentImplementation.portfolioCompany) {
      portfolioCompany = application.investmentImplementation.portfolioCompany;
      console.log('\n📊 Found portfolio company via investment implementation:');
      console.log(`   ID: ${portfolioCompany.id}`);
      console.log(`   Name: ${portfolioCompany.name}`);
      
      if (portfolioCompany.user) {
        user = portfolioCompany.user;
        console.log(`   User ID: ${user.id}`);
        console.log(`   User Email: ${user.email}`);
      }
    }

    // Also check if user exists with this email
    if (!user) {
      const userByEmail = await prisma.user.findUnique({
        where: { email: email }
      });
      if (userByEmail) {
        user = userByEmail;
        console.log('\n👤 Found user by email:');
        console.log(`   ID: ${user.id}`);
        console.log(`   Email: ${user.email}`);
        console.log(`   Name: ${user.firstName} ${user.lastName}`);
      }
    }

    // Step 3: Delete portfolio company and related data
    if (portfolioCompany) {
      console.log('\n🗑️  Deleting portfolio company and related data...');
      
      // Delete in transaction to handle foreign keys
      await prisma.$transaction(async (tx) => {
        // Delete investment implementations linked to this portfolio company
        const implementations = await tx.investmentImplementation.findMany({
          where: { portfolioCompanyId: portfolioCompany.id },
          include: {
            fundDisbursements: true,
            milestones: true
          }
        });

        for (const impl of implementations) {
          // Delete fund disbursements
          await tx.fundDisbursement.deleteMany({
            where: { investmentImplementationId: impl.id }
          });

          // Delete milestones
          await tx.investmentMilestone.deleteMany({
            where: { investmentImplementationId: impl.id }
          });

          // Delete investment implementation
          await tx.investmentImplementation.delete({
            where: { id: impl.id }
          });
        }

        // Delete portfolio company
        await tx.portfolioCompany.delete({
          where: { id: portfolioCompany.id }
        });

        console.log('✅ Portfolio company deleted');
      });
    } else {
      console.log('⚠️  No portfolio company found to delete');
    }

    // Step 4: Delete user
    if (user) {
      console.log('\n🗑️  Deleting user...');
      
      // Check for related records before deleting
      const userApplications = await prisma.application.findMany({
        where: { applicantEmail: user.email }
      });

      const userBoardReviews = await prisma.boardReview.findMany({
        where: { reviewerId: user.id }
      });

      console.log(`   Related applications: ${userApplications.length}`);
      console.log(`   Board reviews as reviewer: ${userBoardReviews.length}`);

      // Delete user (this will cascade delete related records based on schema)
      await prisma.user.delete({
        where: { id: user.id }
      });

      console.log('✅ User deleted');
    } else {
      console.log('⚠️  No user found to delete');
    }

    console.log('\n✅ Reset and deletion completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   Application ID: ${application.id}`);
    console.log(`   Board Review: ${application.boardReview ? 'Reset to IN_PROGRESS' : 'Not found'}`);
    console.log(`   Portfolio Company: ${portfolioCompany ? 'Deleted' : 'Not found'}`);
    console.log(`   User: ${user ? 'Deleted' : 'Not found'}`);

  } catch (error: any) {
    console.error('\n❌ Error:', error.message);
    console.error('   Code:', error.code);
    
    if (error.code === 'P2003') {
      console.error('\n🔗 Foreign Key Constraint Error:');
      console.error('   There are related records preventing deletion');
      console.error('   You may need to delete related records first');
    }
    
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
resetAndDeleteLogixvine()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

