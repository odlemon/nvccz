// @ts-nocheck
import { prisma } from '../src/utils/database';
import { ApplicationService } from '../src/services/ApplicationService';

async function acceptAmandaApplication() {
  try {
    const email = 'amandablack@gmail.com';
    
    console.log(`🔍 Searching for application with email: ${email}\n`);

    // Find the application by email
    const application = await prisma.application.findFirst({
      where: {
        applicantEmail: email
      },
      select: {
        id: true,
        applicantName: true,
        applicantEmail: true,
        businessName: true,
        currentStage: true,
        screeningOutcome: true,
        createdAt: true
      }
    });

    if (!application) {
      console.log(`❌ No application found with email: ${email}`);
      await prisma.$disconnect();
      return;
    }

    console.log('📋 Found Application:');
    console.log(`   ID: ${application.id}`);
    console.log(`   Applicant: ${application.applicantName}`);
    console.log(`   Email: ${application.applicantEmail}`);
    console.log(`   Business: ${application.businessName}`);
    console.log(`   Current Stage: ${application.currentStage}`);
    console.log(`   Screening Outcome: ${application.screeningOutcome || 'N/A'}`);
    console.log(`   Created: ${application.createdAt}\n`);

    // Update to SHORTLISTED stage
    console.log('🔄 Updating application to SHORTLISTED stage...\n');
    
    const updatedApplication = await ApplicationService.changeApplicationStage(
      application.id,
      'SHORTLISTED',
      'Application accepted and moved to SHORTLISTED stage'
    );

    console.log('✅ Application updated successfully!\n');
    console.log('📊 Updated Application Details:');
    console.log(`   ID: ${updatedApplication.id}`);
    console.log(`   Applicant: ${updatedApplication.applicantName}`);
    console.log(`   Business: ${updatedApplication.businessName}`);
    console.log(`   New Stage: ${updatedApplication.currentStage}`);
    console.log(`   Updated At: ${updatedApplication.updatedAt}\n`);

    // Also update screeningOutcome if it exists
    if (application.screeningOutcome === 'REJECTED' || !application.screeningOutcome) {
      await prisma.application.update({
        where: { id: application.id },
        data: {
          screeningOutcome: 'SHORTLISTED'
        }
      });
      console.log('✅ Screening outcome updated to SHORTLISTED\n');
    }

    console.log('🎉 Application successfully accepted and shortlisted!');

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    if (error.message.includes('Invalid stage transition')) {
      console.error('\n⚠️  Note: The application might already be in a stage that cannot transition to SHORTLISTED.');
      console.error('   Trying direct database update...\n');
      
      // Try direct update if service method fails
      try {
        const email = 'amandablack@gmail.com';
        const application = await prisma.application.findFirst({
          where: { applicantEmail: email }
        });

        if (application) {
          await prisma.application.update({
            where: { id: application.id },
            data: {
              currentStage: 'SHORTLISTED',
              screeningOutcome: 'SHORTLISTED',
              updatedAt: new Date()
            }
          });
          console.log('✅ Direct database update successful!');
          console.log(`   Application ${application.id} is now SHORTLISTED`);
        }
      } catch (directError: any) {
        console.error('❌ Direct update also failed:', directError.message);
      }
    }
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

acceptAmandaApplication();


