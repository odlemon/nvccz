const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function completeBoardReviewForLY() {
  try {
    console.log('🔍 Finding application for email nyasha@lysp.io...\n');
    console.log('═══════════════════════════════════════════════════════\n');

    // Find application by applicant email
    const application = await prisma.application.findFirst({
      where: {
        applicantEmail: 'nyasha@lysp.io'
      },
      include: {
        boardReview: true,
        termSheet: true,
        dueDiligenceReview: true
      }
    });

    if (!application) {
      console.log('❌ Application not found for company "LY"');
      console.log('\nAvailable applications:');
      const allApps = await prisma.application.findMany({
        select: {
          id: true,
          businessName: true,
          currentStage: true
        },
        take: 10
      });
      allApps.forEach(app => {
        console.log(`   - ${app.businessName} (${app.id}) - Stage: ${app.currentStage}`);
      });
      return;
    }

    console.log('✅ Found Application:');
    console.log(`   ID: ${application.id}`);
    console.log(`   Business Name: ${application.businessName}`);
    console.log(`   Current Stage: ${application.currentStage}`);
    console.log(`   Applicant: ${application.applicantName} (${application.applicantEmail})\n`);

    // Check if term sheet is signed
    if (!application.termSheet || !application.termSheet.isSigned) {
      console.log('❌ Error: Term sheet is not signed. Cannot proceed to board review.');
      return;
    }

    console.log('✅ Term sheet is signed\n');

    // Check if board review exists
    let boardReview = application.boardReview;

    if (!boardReview) {
      console.log('📝 Creating board review...');
      
      // Find an admin user to be the reviewer
      const adminUser = await prisma.user.findFirst({
        where: {
          role: {
            name: { in: ['admin', 'fund_manager'] }
          }
        },
        include: {
          role: true
        }
      });

      if (!adminUser) {
        console.log('❌ Error: No admin user found to assign as reviewer');
        return;
      }

      console.log(`   Reviewer: ${adminUser.firstName} ${adminUser.lastName} (${adminUser.email})\n`);

      // Create board review
      boardReview = await prisma.boardReview.create({
        data: {
          applicationId: application.id,
          reviewerId: adminUser.id,
          investmentApproved: false,
          investmentRejected: false,
          conditionalApproval: false,
          recommendationReport: 'Board review completed for investment implementation.',
          decisionReason: 'Application approved for investment implementation based on due diligence and term sheet.',
          overallScore: new (require('@prisma/client/runtime/library').Decimal)(85.0),
          finalComments: 'Application approved. Ready for investment implementation.',
          status: 'IN_PROGRESS'
        }
      });

      console.log('✅ Board review created\n');
    } else {
      console.log('✅ Board review already exists\n');
    }

    // Update board review to approved status
    console.log('📝 Updating board review to approved...');
    
    const updatedBoardReview = await prisma.boardReview.update({
      where: { id: boardReview.id },
      data: {
        investmentApproved: true,
        investmentRejected: false,
        conditionalApproval: false,
        recommendationReport: boardReview.recommendationReport || 'Application approved for investment implementation.',
        decisionReason: boardReview.decisionReason || 'Application approved based on comprehensive review.',
        overallScore: boardReview.overallScore || new (require('@prisma/client/runtime/library').Decimal)(85.0),
        finalComments: boardReview.finalComments || 'Application approved. Ready for investment implementation.',
        status: 'COMPLETED',
        completedAt: new Date(),
        updatedAt: new Date()
      }
    });

    console.log('✅ Board review updated to approved\n');

    // Update application stage to INVESTMENT_IMPLEMENTATION
    console.log('📝 Updating application stage to INVESTMENT_IMPLEMENTATION...');
    
    const updatedApplication = await prisma.application.update({
      where: { id: application.id },
      data: {
        currentStage: 'INVESTMENT_IMPLEMENTATION',
        updatedAt: new Date()
      }
    });

    console.log('✅ Application stage updated to INVESTMENT_IMPLEMENTATION\n');

    console.log('═══════════════════════════════════════════════════════\n');
    console.log('✅ SUCCESS: Board review completed!\n');
    console.log('Summary:');
    console.log(`   Application: ${updatedApplication.businessName}`);
    console.log(`   Application ID: ${updatedApplication.id}`);
    console.log(`   Current Stage: ${updatedApplication.currentStage}`);
    console.log(`   Board Review Status: ${updatedBoardReview.status}`);
    console.log(`   Investment Approved: ${updatedBoardReview.investmentApproved}`);
    console.log('\n✅ Application is now ready for investment implementation!\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

completeBoardReviewForLY();

