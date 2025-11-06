import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const email = 'karatakundai@gmail.com';

async function resetLynxForDueDiligence() {
  try {
    console.log('🔍 Finding application for email:', email);
    
    // Find the application by email
    const application = await prisma.application.findFirst({
      where: { 
        applicantEmail: email.toLowerCase().trim()
      }
    });

    if (!application) {
      console.log('❌ Application not found for email:', email);
      console.log('   Searching for similar emails...');
      
      // Try to find similar emails
      const similarApps = await prisma.application.findMany({
        where: {
          applicantEmail: {
            contains: email.split('@')[0]
          }
        },
        select: {
          id: true,
          businessName: true,
          applicantEmail: true,
          applicantName: true,
          currentStage: true
        },
        take: 10
      });

      if (similarApps.length > 0) {
        console.log('\n📋 Found similar applications:');
        similarApps.forEach(app => {
          console.log(`   - ${app.businessName} (${app.applicantName}) - ${app.applicantEmail} - Stage: ${app.currentStage}`);
        });
      }
      return;
    }

    // Get related records separately
    const dueDiligence = await prisma.dueDiligenceReview.findUnique({
      where: { applicationId: application.id }
    });

    const boardReview = await prisma.boardReview.findUnique({
      where: { applicationId: application.id }
    });

    const termSheet = await prisma.termSheet.findUnique({
      where: { applicationId: application.id }
    });

    const investmentImplementation = await prisma.investmentImplementation.findUnique({
      where: { applicationId: application.id },
      include: {
        portfolioCompany: {
          include: {
            user: true
          }
        }
      }
    });


    console.log('\n✅ Application found:');
    console.log(`   ID: ${application.id}`);
    console.log(`   Business Name: ${application.businessName}`);
    console.log(`   Applicant: ${application.applicantName}`);
    console.log(`   Email: ${application.applicantEmail}`);
    console.log(`   Current Stage: ${application.currentStage}`);
    console.log(`   Due Diligence: ${dueDiligence ? 'Exists' : 'None'}`);
    console.log(`   Board Review: ${boardReview ? 'Exists' : 'None'}`);
    console.log(`   Term Sheet: ${termSheet ? 'Exists' : 'None'}`);
    console.log(`   Investment Implementation: ${investmentImplementation ? 'Exists' : 'None'}`);

    // Step 1: Reset/Delete due diligence
    if (dueDiligence) {
      const dueDiligenceId = dueDiligence.id;
      console.log('\n🔄 Deleting due diligence review...');
      
      await prisma.dueDiligenceReview.delete({
        where: { id: dueDiligenceId }
      });
      console.log('✅ Due diligence review deleted');
    } else {
      console.log('⚠️  No due diligence review found');
    }

    // Step 2: Delete board review completely
    if (boardReview) {
      const boardReviewId = boardReview.id;
      console.log('\n🔄 Deleting board review completely...');
      
      await prisma.boardReview.delete({
        where: { id: boardReviewId }
      });
      console.log('✅ Board review deleted');
    } else {
      console.log('⚠️  No board review found');
    }

    // Step 3: Delete term sheet
    if (termSheet) {
      console.log('\n🔄 Deleting term sheet...');
      await prisma.termSheet.delete({
        where: { id: termSheet.id }
      });
      console.log('✅ Term sheet deleted');
    } else {
      console.log('⚠️  No term sheet found');
    }

    // Step 3b: Delete investment implementation if exists
    if (investmentImplementation) {
      console.log('\n🔄 Deleting investment implementation...');
      
      // Delete portfolio company user if exists
      if (investmentImplementation.portfolioCompany?.user) {
        console.log('   Deleting portfolio company user...');
        await prisma.user.delete({
          where: { id: investmentImplementation.portfolioCompany.user.id }
        });
        console.log('   ✅ Portfolio company user deleted');
      }

      // Delete portfolio company if exists
      if (investmentImplementation.portfolioCompany) {
        console.log('   Deleting portfolio company...');
        await prisma.portfolioCompany.delete({
          where: { id: investmentImplementation.portfolioCompany.id }
        });
        console.log('   ✅ Portfolio company deleted');
      }

      // Delete investment implementation
      await prisma.investmentImplementation.delete({
        where: { id: investmentImplementation.id }
      });
      console.log('✅ Investment implementation deleted');
    } else {
      console.log('⚠️  No investment implementation found');
    }

    // Step 4: Update application stage to SHORTLISTED and clear all related fields
    console.log('\n🔄 Setting application stage to SHORTLISTED and clearing all related data...');
    await prisma.application.update({
      where: { id: application.id },
      data: {
        currentStage: 'SHORTLISTED',
        boardDecision: null,
        dueDiligenceScore: null,
        // Clear any other stage-related fields
        updatedAt: new Date()
      }
    });
    console.log('✅ Application stage set to SHORTLISTED');

    // Step 5: Check for any tasks related to this application and delete them
    console.log('\n🔄 Checking for related tasks...');
    const relatedTasks = await prisma.task.findMany({
      where: {
        description: {
          contains: `Application: ${application.id}`
        }
      },
      include: {
        activityLogs: true
      }
    });

    if (relatedTasks.length > 0) {
      console.log(`   Found ${relatedTasks.length} related task(s)`);
      
      // Delete activity logs first
      for (const task of relatedTasks) {
        if (task.activityLogs.length > 0) {
          console.log(`   Deleting ${task.activityLogs.length} activity log(s) for task: ${task.title}`);
          await prisma.activityLog.deleteMany({
            where: {
              taskId: task.id
            }
          });
        }
      }

      // Delete tasks
      console.log('   Deleting related tasks...');
      await prisma.task.deleteMany({
        where: {
          description: {
            contains: `Application: ${application.id}`
          }
        }
      });
      console.log('✅ Related tasks deleted');
    } else {
      console.log('   No related tasks found');
    }

    // Step 6: Verify the application is clean
    console.log('\n🔍 Verifying application is clean...');
    const verifyApplication = await prisma.application.findUnique({
      where: { id: application.id },
      include: {
        dueDiligenceReview: true,
        boardReview: true,
        termSheet: true,
        investmentImplementation: true
      }
    });

    console.log('\n🎉 Reset complete!');
    console.log('\n📊 Final Status:');
    console.log(`   Application ID: ${verifyApplication?.id}`);
    console.log(`   Business Name: ${verifyApplication?.businessName}`);
    console.log(`   Current Stage: ${verifyApplication?.currentStage}`);
    console.log(`   Board Decision: ${verifyApplication?.boardDecision || 'null'}`);
    console.log(`   Due Diligence Score: ${verifyApplication?.dueDiligenceScore || 'null'}`);
    console.log(`   Due Diligence: ${verifyApplication?.dueDiligenceReview ? '❌ STILL EXISTS' : '✅ Deleted'}`);
    console.log(`   Board Review: ${verifyApplication?.boardReview ? '❌ STILL EXISTS' : '✅ Deleted'}`);
    console.log(`   Term Sheet: ${verifyApplication?.termSheet ? '❌ STILL EXISTS' : '✅ Deleted'}`);
    console.log(`   Investment Implementation: ${verifyApplication?.investmentImplementation ? '❌ STILL EXISTS' : '✅ Deleted'}`);
    
    if (verifyApplication?.currentStage === 'SHORTLISTED' && 
        !verifyApplication?.dueDiligenceReview && 
        !verifyApplication?.boardReview && 
        !verifyApplication?.termSheet &&
        !verifyApplication?.investmentImplementation) {
      console.log('\n✅ Application is now clean and ready for due diligence process!');
      console.log('   You can now:');
      console.log('   1. Start due diligence via POST /api/applications/{id}/due-diligence/initiate');
      console.log('   2. Assign tasks via POST /api/applications/{id}/due-diligence/assign-task');
    } else {
      console.log('\n⚠️  WARNING: Application may not be fully cleaned. Please check the status above.');
    }

  } catch (error: any) {
    console.error('❌ Error resetting application:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

resetLynxForDueDiligence();

