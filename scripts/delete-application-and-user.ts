// @ts-nocheck
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const targetEmail = 'logixvine@gmail.com';

async function deleteApplicationAndUser() {
  try {
    console.log(`🔍 Searching for application with email: ${targetEmail}`);

    const application = await prisma.application.findFirst({
      where: { applicantEmail: targetEmail.toLowerCase().trim() },
      include: {
        boardReview: true,
        dueDiligenceReview: true,
        termSheet: true,
        investmentImplementation: {
          include: {
            portfolioCompany: {
              include: {
                user: true
              }
            },
            fundDisbursements: true,
            milestones: true
          }
        },
        documents: true
      }
    });

    if (!application) {
      console.log('❌ No application found');
    } else {
      console.log(`✅ Application found: ${application.id} (${application.businessName})`);

      // Delete board review & votes
      if (application.boardReview) {
        const boardReviewVoteDelegate = (prisma as any).boardReviewVote;
        if (boardReviewVoteDelegate) {
          console.log('   🗑️ Deleting board review votes...');
          await boardReviewVoteDelegate.deleteMany({ where: { boardReviewId: application.boardReview.id } }).catch(() => undefined);
        } else {
          console.log('   ⚠️ Skipping board review votes cleanup (delegate not available)...');
        }

        console.log('   🗑️ Deleting board review...');
        await prisma.boardReview.delete({ where: { id: application.boardReview.id } });
      }

      // Delete due diligence review
      if (application.dueDiligenceReview) {
        console.log('   🗑️ Deleting due diligence review...');
        await prisma.dueDiligenceReview.delete({ where: { id: application.dueDiligenceReview.id } });
      }

      // Delete term sheet
      if (application.termSheet) {
        console.log('   🗑️ Deleting term sheet...');
        await prisma.termSheet.delete({ where: { id: application.termSheet.id } });
      }

      // Delete investment implementation, disbursements, milestones, portfolio company & user
      if (application.investmentImplementation) {
        const implementation = application.investmentImplementation;

        console.log('   🗑️ Deleting fund disbursements...');
        await prisma.fundDisbursement.deleteMany({ where: { investmentImplementationId: implementation.id } });

        console.log('   🗑️ Deleting investment milestones...');
        await prisma.investmentMilestone.deleteMany({ where: { investmentImplementationId: implementation.id } });

        if (implementation.portfolioCompany) {
          const portfolioCompany = implementation.portfolioCompany;

          if (portfolioCompany.user) {
            console.log('   🗑️ Deleting portfolio company user...');
            await prisma.user.delete({ where: { id: portfolioCompany.user.id } }).catch(() => undefined);
          }

          console.log('   🗑️ Deleting portfolio company...');
          await prisma.portfolioCompany.delete({ where: { id: portfolioCompany.id } });
        }

        console.log('   🗑️ Deleting investment implementation...');
        await prisma.investmentImplementation.delete({ where: { id: implementation.id } });
      }

      // Delete tasks & activity logs linked to application
      console.log('   🔎 Checking for related tasks...');
      const tasks = await prisma.task.findMany({
        where: {
          description: {
            contains: `Application: ${application.id}`
          }
        },
        select: {
          id: true
        }
      });

      if (tasks.length > 0) {
        console.log(`   🗑️ Deleting ${tasks.length} task(s) and related activity logs...`);
        for (const task of tasks) {
          await prisma.activityLog.deleteMany({ where: { taskId: task.id } });
        }
        await prisma.task.deleteMany({
          where: {
            description: {
              contains: `Application: ${application.id}`
            }
          }
        });
      }

      console.log('   🗑️ Deleting application stages, documents, notifications, reviews...');
      await prisma.applicationStage.deleteMany({ where: { applicationId: application.id } });
      await prisma.applicationDocument.deleteMany({ where: { applicationId: application.id } });
      await prisma.applicationNotification.deleteMany({ where: { applicationId: application.id } });
      await prisma.review.deleteMany({ where: { applicationId: application.id } });

      console.log('   🗑️ Deleting application record...');
      await prisma.application.delete({ where: { id: application.id } });
    }

    console.log(`
🔍 Checking user account for ${targetEmail}`);
    const deletedUser = await prisma.user.deleteMany({ where: { email: targetEmail.toLowerCase().trim() } });
    if (deletedUser.count > 0) {
      console.log(`✅ Deleted ${deletedUser.count} user record(s)`);
    } else {
      console.log('⚠️  No user record found to delete');
    }

    console.log('\n🎉 Cleanup complete.');
  } catch (error: any) {
    console.error('❌ Failed to delete records:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

deleteApplicationAndUser();

