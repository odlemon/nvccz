// @ts-nocheck
import { prisma } from '../src/utils/database';

async function verifyApplication() {
  try {
    const email = 'amandablack@gmail.com';
    
    const application = await prisma.application.findFirst({
      where: { applicantEmail: email },
      select: {
        id: true,
        applicantName: true,
        applicantEmail: true,
        businessName: true,
        currentStage: true,
        screeningOutcome: true,
        updatedAt: true
      }
    });

    if (!application) {
      console.log(`❌ No application found with email: ${email}`);
      return;
    }

    console.log('✅ Application Status:');
    console.log(JSON.stringify(application, null, 2));
    
    if (application.currentStage === 'SHORTLISTED') {
      console.log('\n🎉 SUCCESS: Application is now SHORTLISTED!');
    } else {
      console.log(`\n⚠️  Application stage is: ${application.currentStage}`);
    }

  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

verifyApplication();


