import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetBrighterDaysApplication() {
  try {
    console.log('🔍 Step 1: Finding "Brighter Days" application...');
    
    // Find the application
    const application = await prisma.application.findFirst({
      where: {
        businessName: {
          contains: 'Brighter Days'
        }
      },
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
      console.error('❌ Application "Brighter Days" not found');
      return;
    }

    console.log(`✅ Found application: ${application.businessName}`);
    console.log(`   Application ID: ${application.id}`);
    console.log(`   Current Stage: ${application.currentStage}`);
    console.log(`   Board Review Status: ${application.boardReview?.status || 'N/A'}`);
    
    const portfolioCompany = application.investmentImplementation?.portfolioCompany;
    const user = portfolioCompany?.user;
    
    console.log(`   Portfolio Company ID: ${portfolioCompany?.id || 'N/A'}`);
    console.log(`   User ID: ${user?.id || 'N/A'}\n`);

    // Step 2: Delete the user if exists
    if (user) {
      console.log('🗑️  Step 2: Deleting user related to portfolio company...');
      console.log(`   User ID: ${user.id}`);
      console.log(`   User Email: ${user.email}`);
      
      try {
        await prisma.user.delete({
          where: { id: user.id }
        });
        console.log('   ✅ User deleted successfully\n');
      } catch (error: any) {
        console.error(`   ❌ Error deleting user: ${error.message}`);
        // Continue even if user deletion fails (might have dependencies)
      }
    } else {
      console.log('   ℹ️  No user found for this portfolio company\n');
    }

    // Step 3: Delete the portfolio company if exists
    if (portfolioCompany) {
      console.log('🗑️  Step 3: Deleting portfolio company...');
      console.log(`   Portfolio Company ID: ${portfolioCompany.id}`);
      console.log(`   Portfolio Company Name: ${portfolioCompany.name}`);
      
      try {
        await prisma.portfolioCompany.delete({
          where: { id: portfolioCompany.id }
        });
        console.log('   ✅ Portfolio company deleted successfully\n');
      } catch (error: any) {
        console.error(`   ❌ Error deleting portfolio company: ${error.message}`);
        throw error; // Stop if portfolio company deletion fails
      }
    } else {
      console.log('   ℹ️  No portfolio company found for this application\n');
    }

    // Step 4: Update application status to UNDER_BOARD_REVIEW
    console.log('📝 Step 4: Updating application status to UNDER_BOARD_REVIEW...');
    try {
      await prisma.application.update({
        where: { id: application.id },
        data: {
          currentStage: 'UNDER_BOARD_REVIEW',
          updatedAt: new Date()
        }
      });
      console.log('   ✅ Application status updated to UNDER_BOARD_REVIEW\n');
    } catch (error: any) {
      console.error(`   ❌ Error updating application status: ${error.message}`);
      throw error;
    }

    // Step 5: Update board review status to IN_PROGRESS
    if (application.boardReview) {
      console.log('📝 Step 5: Updating board review status to IN_PROGRESS...');
      try {
        await prisma.boardReview.update({
          where: { id: application.boardReview.id },
          data: {
            status: 'IN_PROGRESS',
            updatedAt: new Date()
          }
        });
        console.log('   ✅ Board review status updated to IN_PROGRESS\n');
      } catch (error: any) {
        console.error(`   ❌ Error updating board review status: ${error.message}`);
        throw error;
      }
    } else {
      console.log('   ℹ️  No board review found for this application\n');
    }

    // Step 6: Verify the changes
    console.log('✅ Step 6: Verifying changes...');
    const updatedApplication = await prisma.application.findUnique({
      where: { id: application.id },
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

    console.log('\n📊 Final Status:');
    console.log(`   Application: ${updatedApplication?.businessName}`);
    console.log(`   Application Stage: ${updatedApplication?.currentStage}`);
    console.log(`   Board Review Status: ${updatedApplication?.boardReview?.status || 'N/A'}`);
    console.log(`   Portfolio Company: ${updatedApplication?.investmentImplementation?.portfolioCompany ? 'EXISTS' : 'DELETED ✅'}`);
    console.log(`   User: ${updatedApplication?.investmentImplementation?.portfolioCompany?.user ? 'EXISTS' : 'DELETED ✅'}`);

    console.log('\n✅ Reset completed successfully!');

  } catch (error: any) {
    console.error('\n❌ Error during reset:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

resetBrighterDaysApplication();

