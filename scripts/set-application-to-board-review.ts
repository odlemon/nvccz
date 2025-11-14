import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function setApplicationToBoardReview() {
  try {
    console.log('🔍 Finding "Brighter Days" application...');
    
    // Find the application
    const application = await prisma.application.findFirst({
      where: {
        businessName: {
          contains: 'Brighter Days'
        }
      }
    });

    if (!application) {
      console.error('❌ Application "Brighter Days" not found');
      return;
    }

    console.log(`✅ Found application: ${application.businessName}`);
    console.log(`   Application ID: ${application.id}`);
    console.log(`   Current Stage: ${application.currentStage}\n`);

    // Update application status to UNDER_BOARD_REVIEW
    console.log('📝 Updating application status to UNDER_BOARD_REVIEW...');
    const updatedApplication = await prisma.application.update({
      where: { id: application.id },
      data: {
        currentStage: 'UNDER_BOARD_REVIEW',
        updatedAt: new Date()
      }
    });

    console.log('✅ Application status updated successfully!');
    console.log(`   New Stage: ${updatedApplication.currentStage}\n`);

    console.log('📊 Final Status:');
    console.log(`   Application: ${updatedApplication.businessName}`);
    console.log(`   Application Stage: ${updatedApplication.currentStage}`);
    console.log(`   Application ID: ${updatedApplication.id}`);

  } catch (error: any) {
    console.error('\n❌ Error updating application:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

setApplicationToBoardReview();

