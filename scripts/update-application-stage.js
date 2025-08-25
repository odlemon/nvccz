const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function updateApplicationStage(applicationId, newStage) {
  try {
    console.log(`Updating application stage for: ${applicationId}`);
    console.log(`New stage: ${newStage}`);
    
    // Get the current application details
    const currentApplication = await prisma.application.findUnique({
      where: { id: applicationId }
    });

    if (!currentApplication) {
      console.error(`Application with ID ${applicationId} not found`);
      return;
    }

    console.log('Current application details:', {
      id: currentApplication.id,
      applicantName: currentApplication.applicantName,
      businessName: currentApplication.businessName,
      currentStage: currentApplication.currentStage
    });

    // Update the application stage
    const updatedApplication = await prisma.application.update({
      where: { id: applicationId },
      data: {
        currentStage: newStage
      }
    });

    console.log('\n✅ Application stage updated successfully!');
    console.log('Updated application details:', {
      id: updatedApplication.id,
      applicantName: updatedApplication.applicantName,
      businessName: updatedApplication.businessName,
      currentStage: updatedApplication.currentStage,
      updatedAt: updatedApplication.updatedAt
    });

    console.log(`\n🎉 Application ${applicationId} is now in ${newStage} stage!`);

  } catch (error) {
    console.error('Error updating application stage:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Get application ID and stage from command line arguments
const applicationId = process.argv[2];
const newStage = process.argv[3] || 'TERM_SHEET';

if (!applicationId) {
  console.error('Please provide an application ID as an argument');
  console.log('Usage: node update-application-stage.js <applicationId> [newStage]');
  console.log('Default newStage is: TERM_SHEET');
  process.exit(1);
}

// Run the script
updateApplicationStage(applicationId, newStage);
