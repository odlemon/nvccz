const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function getMachipsApplication() {
  try {
    const app = await prisma.application.findFirst({
      where: {
        businessName: {
          contains: 'Machips'
        }
      },
      select: {
        id: true,
        businessName: true,
        applicantEmail: true,
        applicantName: true,
        currentStage: true,
        requestedAmount: true
      }
    });

    if (app) {
      console.log('📋 Machips Application Details:');
      console.log('================================');
      console.log('Application ID:', app.id);
      console.log('Business Name:', app.businessName);
      console.log('Applicant:', app.applicantName);
      console.log('Email:', app.applicantEmail);
      console.log('Current Stage:', app.currentStage);
      console.log('Requested Amount: $', app.requestedAmount);
      console.log('================================');
    } else {
      console.log('❌ Application not found');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

getMachipsApplication();


