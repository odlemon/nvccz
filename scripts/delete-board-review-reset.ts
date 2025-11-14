import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteBoardReviewAndReset() {
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
        dueDiligenceReview: true
      }
    });

    if (!application) {
      console.error('❌ Application "Brighter Days" not found');
      return;
    }

    console.log(`✅ Found application: ${application.businessName}`);
    console.log(`   Application ID: ${application.id}`);
    console.log(`   Current Stage: ${application.currentStage}`);
    console.log(`   Board Review ID: ${application.boardReview?.id || 'N/A'}`);
    console.log(`   Board Review Status: ${application.boardReview?.status || 'N/A'}`);
    console.log(`   Due Diligence Review ID: ${application.dueDiligenceReview?.id || 'N/A'}\n`);

    // Step 2: Delete the board review if it exists
    if (application.boardReview) {
      console.log('🗑️  Step 2: Deleting board review...');
      console.log(`   Board Review ID: ${application.boardReview.id}`);
      
      try {
        // First, delete all board review votes
        console.log('   Deleting board review votes...');
        const boardReviewVoteDelegate = (prisma as any).boardReviewVote;
        if (boardReviewVoteDelegate) {
          await boardReviewVoteDelegate.deleteMany({
            where: { boardReviewId: application.boardReview.id }
          });
          console.log('   ✅ Board review votes deleted');
        } else {
          // Use raw query if delegate doesn't exist
          await prisma.$executeRaw`
            DELETE FROM board_review_votes WHERE boardReviewId = ${application.boardReview.id}
          `;
          console.log('   ✅ Board review votes deleted (raw query)');
        }

        // Delete the board review
        await prisma.boardReview.delete({
          where: { id: application.boardReview.id }
        });
        console.log('   ✅ Board review deleted successfully\n');
      } catch (error: any) {
        console.error(`   ❌ Error deleting board review: ${error.message}`);
        throw error;
      }
    } else {
      console.log('   ℹ️  No board review found for this application\n');
    }

    // Step 3: Update application status to DUE_DILIGENCE_COMPLETED
    // This is the stage that comes after completing due diligence
    console.log('📝 Step 3: Updating application status to DUE_DILIGENCE_COMPLETED...');
    console.log('   (This is the stage that comes after completing due diligence)');
    try {
      await prisma.application.update({
        where: { id: application.id },
        data: {
          currentStage: 'DUE_DILIGENCE_COMPLETED',
          updatedAt: new Date()
        }
      });
      console.log('   ✅ Application status updated to DUE_DILIGENCE_COMPLETED\n');
    } catch (error: any) {
      console.error(`   ❌ Error updating application status: ${error.message}`);
      throw error;
    }

    // Step 4: Verify the changes
    console.log('✅ Step 4: Verifying changes...');
    const updatedApplication = await prisma.application.findUnique({
      where: { id: application.id },
      include: {
        boardReview: true,
        dueDiligenceReview: true
      }
    });

    console.log('\n📊 Final Status:');
    console.log(`   Application: ${updatedApplication?.businessName}`);
    console.log(`   Application Stage: ${updatedApplication?.currentStage}`);
    console.log(`   Board Review: ${updatedApplication?.boardReview ? 'EXISTS ❌' : 'DELETED ✅'}`);
    console.log(`   Due Diligence Review: ${updatedApplication?.dueDiligenceReview ? 'EXISTS ✅' : 'NOT FOUND'}`);

    console.log('\n✅ Reset completed successfully!');
    console.log('   The application is now back at DUE_DILIGENCE_COMPLETED stage');
    console.log('   Board review has been deleted and can be recreated when needed');

  } catch (error: any) {
    console.error('\n❌ Error during reset:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

deleteBoardReviewAndReset();

