const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function deleteNyashaApplication() {
  try {
    console.log('🔍 Finding application for nyasha@lysp.io...\n');

    // Find application by email
    const application = await prisma.application.findFirst({
      where: {
        applicantEmail: 'nyasha@lysp.io'
      },
      include: {
        documents: true,
        notifications: true,
        dueDiligenceReview: true,
        boardReview: true,
        termSheet: true,
        investmentImplementation: {
          include: {
            milestones: true,
            fundDisbursements: true
          }
        }
      }
    });

    if (!application) {
      console.log('❌ No application found for nyasha@lysp.io');
      return;
    }

    console.log('📋 Found Application:');
    console.log(`   ID: ${application.id}`);
    console.log(`   Business Name: ${application.businessName}`);
    console.log(`   Applicant: ${application.applicantName}`);
    console.log(`   Email: ${application.applicantEmail}`);
    console.log(`   Stage: ${application.currentStage}`);
    console.log(`   Documents: ${application.documents.length}`);
    console.log(`   Notifications: ${application.notifications.length}`);
    console.log(`   Due Diligence: ${application.dueDiligenceReview ? 'Yes' : 'No'}`);
    console.log(`   Board Review: ${application.boardReview ? 'Yes' : 'No'}`);
    console.log(`   Term Sheet: ${application.termSheet ? 'Yes' : 'No'}`);
    console.log(`   Investment Implementation: ${application.investmentImplementation ? 'Yes' : 'No'}\n`);

    // Find user by email
    const user = await prisma.user.findUnique({
      where: {
        email: 'nyasha@lysp.io'
      },
      include: {
        portfolioCompany: {
          include: {
            investmentImplementation: {
              include: {
                milestones: true,
                fundDisbursements: true
              }
            }
          }
        }
      }
    });

    if (user) {
      console.log('👤 Found User:');
      console.log(`   ID: ${user.id}`);
      console.log(`   Name: ${user.firstName} ${user.lastName}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Portfolio Company: ${user.portfolioCompany ? 'Yes' : 'No'}\n`);
    } else {
      console.log('👤 No user found for nyasha@lysp.io\n');
    }

    console.log('🗑️  Starting deletion process...\n');
    console.log('═══════════════════════════════════════════════════════\n');

    // Delete in correct order (child records first)

    // 1. Delete board review votes (if board review exists)
    if (application.boardReview) {
      console.log('1. Deleting board review votes...');
      try {
        const boardReviewVoteDelegate = (prisma).boardReviewVote;
        if (boardReviewVoteDelegate) {
          const deletedVotes = await boardReviewVoteDelegate.deleteMany({
            where: { boardReviewId: application.boardReview.id }
          });
          console.log(`   ✅ Deleted ${deletedVotes.count} board review vote(s)\n`);
        } else {
          // Use raw query if model doesn't exist
          const result = await prisma.$executeRaw`
            DELETE FROM board_review_votes WHERE boardReviewId = ${application.boardReview.id}
          `;
          console.log(`   ✅ Deleted board review votes\n`);
        }
      } catch (error) {
        console.log(`   ⚠️  No board review votes to delete or error: ${error.message}\n`);
      }
    }

    // 2. Delete fund disbursements (if investment implementation exists)
    if (application.investmentImplementation) {
      console.log('2. Deleting fund disbursements...');
      const deletedDisbursements = await prisma.fundDisbursement.deleteMany({
        where: {
          investmentImplementationId: application.investmentImplementation.id
        }
      });
      console.log(`   ✅ Deleted ${deletedDisbursements.count} fund disbursement(s)\n`);
    }

    // 3. Delete investment milestones (if investment implementation exists)
    if (application.investmentImplementation) {
      console.log('3. Deleting investment milestones...');
      const deletedMilestones = await prisma.investmentMilestone.deleteMany({
        where: {
          investmentImplementationId: application.investmentImplementation.id
        }
      });
      console.log(`   ✅ Deleted ${deletedMilestones.count} milestone(s)\n`);
    }

    // 4. Delete investment implementation
    if (application.investmentImplementation) {
      console.log('4. Deleting investment implementation...');
      await prisma.investmentImplementation.delete({
        where: { id: application.investmentImplementation.id }
      });
      console.log(`   ✅ Deleted investment implementation\n`);
    }

    // 5. Delete term sheet
    if (application.termSheet) {
      console.log('5. Deleting term sheet...');
      await prisma.termSheet.delete({
        where: { id: application.termSheet.id }
      });
      console.log(`   ✅ Deleted term sheet\n`);
    }

    // 6. Delete board review
    if (application.boardReview) {
      console.log('6. Deleting board review...');
      await prisma.boardReview.delete({
        where: { id: application.boardReview.id }
      });
      console.log(`   ✅ Deleted board review\n`);
    }

    // 7. Delete due diligence review
    if (application.dueDiligenceReview) {
      console.log('7. Deleting due diligence review...');
      await prisma.dueDiligenceReview.delete({
        where: { id: application.dueDiligenceReview.id }
      });
      console.log(`   ✅ Deleted due diligence review\n`);
    }

    // 8. Delete application notifications
    console.log('8. Deleting application notifications...');
    const deletedNotifications = await prisma.applicationNotification.deleteMany({
      where: { applicationId: application.id }
    });
    console.log(`   ✅ Deleted ${deletedNotifications.count} notification(s)\n`);

    // 9. Delete application documents
    console.log('9. Deleting application documents...');
    const deletedDocuments = await prisma.applicationDocument.deleteMany({
      where: { applicationId: application.id }
    });
    console.log(`   ✅ Deleted ${deletedDocuments.count} document(s)\n`);

    // 10. Delete portfolio company (if user exists and has one)
    if (user && user.portfolioCompany) {
      console.log('10. Deleting portfolio company...');
      // Check if portfolio company has investment implementation that wasn't already deleted
      if (user.portfolioCompany.investmentImplementation) {
        try {
          // Check if it still exists (might have been deleted already)
          const existingImpl = await prisma.investmentImplementation.findUnique({
            where: { id: user.portfolioCompany.investmentImplementation.id }
          });
          
          if (existingImpl) {
            // Delete fund disbursements
            await prisma.fundDisbursement.deleteMany({
              where: {
                investmentImplementationId: existingImpl.id
              }
            });
            // Delete milestones
            await prisma.investmentMilestone.deleteMany({
              where: {
                investmentImplementationId: existingImpl.id
              }
            });
            // Delete investment implementation
            await prisma.investmentImplementation.delete({
              where: { id: existingImpl.id }
            });
          }
        } catch (error) {
          // Investment implementation already deleted, continue
          console.log(`   ℹ️  Investment implementation already deleted\n`);
        }
      }
      await prisma.portfolioCompany.delete({
        where: { id: user.portfolioCompany.id }
      });
      console.log(`   ✅ Deleted portfolio company\n`);
    }

    // 11. Delete user (if exists)
    if (user) {
      console.log('11. Deleting user...');
      await prisma.user.delete({
        where: { id: user.id }
      });
      console.log(`   ✅ Deleted user\n`);
    }

    // 12. Delete application (last, as it's the parent)
    console.log('12. Deleting application...');
    await prisma.application.delete({
      where: { id: application.id }
    });
    console.log(`   ✅ Deleted application\n`);

    console.log('═══════════════════════════════════════════════════════\n');
    console.log('✅ SUCCESS: All records deleted!\n');
    console.log('Deleted:');
    console.log('   - Application');
    console.log('   - Application documents');
    console.log('   - Application notifications');
    console.log('   - Due diligence review');
    console.log('   - Board review and votes');
    console.log('   - Term sheet');
    console.log('   - Investment implementation');
    console.log('   - Investment milestones');
    console.log('   - Fund disbursements');
    console.log('   - Portfolio company');
    console.log('   - User account\n');
    console.log('All related records for nyasha@lysp.io have been removed from the system.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

deleteNyashaApplication();

