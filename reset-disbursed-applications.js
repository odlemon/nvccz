const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetDisbursedApplications() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔄 RESETTING DISBURSED APPLICATIONS');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Find all applications with DISBURSED status
    const disbursedApplications = await prisma.application.findMany({
      where: {
        currentStage: 'DISBURSED'
      },
      select: {
        id: true,
        currentStage: true,
        businessName: true,
        termSheet: {
          select: {
            id: true,
            status: true
          }
        },
        investmentImplementation: {
          select: {
            id: true
          }
        }
      }
    });

    console.log(`Found ${disbursedApplications.length} application(s) with DISBURSED status\n`);

    if (disbursedApplications.length === 0) {
      console.log('✅ No disbursed applications found. Nothing to reset.');
      return;
    }

    // Determine previous status based on workflow
    // Workflow: SHORTLISTED -> UNDER_DUE_DILIGENCE -> UNDER_BOARD_REVIEW -> TERM_SHEET -> INVESTMENT_IMPLEMENTATION -> DISBURSED
    // If DISBURSED, previous should be INVESTMENT_IMPLEMENTATION (if they have termSheet signed and investmentImplementation)
    // Otherwise, if they have termSheet but not signed, previous should be TERM_SHEET
    // Otherwise, if they have boardReview, previous should be UNDER_BOARD_REVIEW
    // Otherwise, if they have dueDiligence, previous should be UNDER_DUE_DILIGENCE
    // Otherwise, previous should be SHORTLISTED

    let updatedCount = 0;

    for (const app of disbursedApplications) {
      let previousStage = 'INVESTMENT_IMPLEMENTATION'; // Default previous stage

      // Check if they have investment implementation
      if (app.investmentImplementation) {
        previousStage = 'INVESTMENT_IMPLEMENTATION';
      } else if (app.termSheet) {
        // If they have termSheet but no investment implementation, they were at TERM_SHEET
        previousStage = 'TERM_SHEET';
      } else {
        // Check for board review
        const boardReview = await prisma.boardReview.findUnique({
          where: { applicationId: app.id }
        });
        
        if (boardReview) {
          previousStage = 'UNDER_BOARD_REVIEW';
        } else {
          // Check for due diligence
          const dueDiligence = await prisma.dueDiligenceReview.findUnique({
            where: { applicationId: app.id }
          });
          
          if (dueDiligence) {
            previousStage = 'UNDER_DUE_DILIGENCE';
          } else {
            previousStage = 'SHORTLISTED';
          }
        }
      }

      // Update the application
      await prisma.application.update({
        where: { id: app.id },
        data: {
          currentStage: previousStage
        }
      });

      console.log(`✅ Reset application "${app.businessName || app.id}"`);
      console.log(`   From: DISBURSED`);
      console.log(`   To: ${previousStage}\n`);

      updatedCount++;
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`✅ Reset ${updatedCount} application(s) from DISBURSED status`);

  } catch (error) {
    console.error('❌ Fatal error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

resetDisbursedApplications()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

