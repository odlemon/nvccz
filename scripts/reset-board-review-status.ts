import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function resetBoardReviewStatus() {
  try {
    console.log('🔍 Finding board review...');
    
    // Find the board review by ID
    const boardReviewId = 'cmhyrwpbl0001l604s0ds4hg4';
    
    const boardReview = await prisma.boardReview.findUnique({
      where: { id: boardReviewId },
      include: {
        application: true
      }
    });

    if (!boardReview) {
      console.error('❌ Board review not found');
      return;
    }

    console.log(`✅ Found board review: ${boardReviewId}`);
    console.log(`   Application: ${boardReview.application.businessName}`);
    console.log(`   Current Status: ${boardReview.status}`);
    console.log(`   Completed At: ${boardReview.completedAt || 'N/A'}\n`);

    // Reset status to IN_PROGRESS
    console.log('📝 Resetting status to IN_PROGRESS...');
    const updated = await prisma.boardReview.update({
      where: { id: boardReviewId },
      data: {
        status: 'IN_PROGRESS',
        completedAt: null,
        updatedAt: new Date()
      }
    });

    console.log('✅ Board review status reset successfully!');
    console.log(`   New Status: ${updated.status}`);
    console.log(`   Completed At: ${updated.completedAt || 'null'}\n`);

    // Verify
    const verified = await prisma.boardReview.findUnique({
      where: { id: boardReviewId },
      select: {
        id: true,
        status: true,
        completedAt: true,
        application: {
          select: {
            businessName: true,
            currentStage: true
          }
        }
      }
    });

    console.log('📊 Final Status:');
    console.log(`   Board Review ID: ${verified?.id}`);
    console.log(`   Status: ${verified?.status}`);
    console.log(`   Completed At: ${verified?.completedAt || 'null'}`);
    console.log(`   Application: ${verified?.application.businessName}`);
    console.log(`   Application Stage: ${verified?.application.currentStage}`);

  } catch (error: any) {
    console.error('\n❌ Error resetting board review status:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

resetBoardReviewStatus();

