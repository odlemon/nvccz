// Script to reset board review for logixvine@gmail.com
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetBoardReview() {
  const email = 'logixvine@gmail.com';
  
  console.log('🔄 Resetting board review for:', email);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    // Find the application
    const application = await prisma.application.findFirst({
      where: { applicantEmail: email },
      include: {
        boardReview: true
      }
    });

    if (!application) {
      console.log('❌ No application found for:', email);
      return;
    }

    console.log(`\n✅ Found application: ${application.id}`);
    console.log(`   Business: ${application.businessName}`);
    console.log(`   Stage: ${application.currentStage}`);

    // Reset board review status
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
      console.log('\n⚠️  No board review found for this application');
    }

    // Reset application stage to UNDER_BOARD_REVIEW
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
    if (application.boardReview) {
      console.log(`   - Board Review Status: IN_PROGRESS`);
    }
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
resetBoardReview()
  .then(() => {
    console.log('\n✅ Script completed successfully!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

