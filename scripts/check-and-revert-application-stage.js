// Script to check application stage and revert it back one step
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function checkAndRevertStage() {
  const email = 'logixvine@gmail.com';
  
  try {
    console.log(`🔍 Searching for application with email: ${email}\n`);
    
    // Find application
    const application = await prisma.application.findFirst({
      where: {
        applicantEmail: email
      },
      include: {
        fund: {
          select: {
            id: true,
            name: true
          }
        },
        boardReview: {
          select: {
            id: true,
            status: true,
            investmentApproved: true,
            investmentRejected: true,
            conditionalApproval: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!application) {
      console.log('❌ No application found for this email address.');
      return;
    }

    console.log('📋 APPLICATION FOUND:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Application ID: ${application.id}`);
    console.log(`Applicant Name: ${application.applicantName}`);
    console.log(`Business Name: ${application.businessName}`);
    console.log(`Current Stage: ${application.currentStage}`);
    console.log(`Fund: ${application.fund?.name || 'None'}`);
    
    if (application.boardReview) {
      console.log(`Board Review Status: ${application.boardReview.status}`);
      console.log(`Investment Approved: ${application.boardReview.investmentApproved}`);
      console.log(`Investment Rejected: ${application.boardReview.investmentRejected}`);
      console.log(`Conditional Approval: ${application.boardReview.conditionalApproval}`);
    }
    
    console.log(`Created At: ${new Date(application.createdAt).toLocaleString()}`);
    console.log(`Updated At: ${new Date(application.updatedAt).toLocaleString()}`);

    // Determine the previous stage based on current stage
    const stageFlow = {
      'PENDING_SHORTLISTING': null, // Can't go back from here
      'SHORTLISTED': 'PENDING_SHORTLISTING',
      'UNDER_DUE_DILIGENCE': 'SHORTLISTED',
      'DUE_DILIGENCE_COMPLETED': 'UNDER_DUE_DILIGENCE',
      'UNDER_BOARD_REVIEW': 'DUE_DILIGENCE_COMPLETED',
      'BOARD_REVIEW_COMPLETED': 'UNDER_BOARD_REVIEW',
      'BOARD_APPROVED': 'UNDER_BOARD_REVIEW',
      'BOARD_REJECTED': 'UNDER_BOARD_REVIEW',
      'BOARD_CONDITIONAL': 'UNDER_BOARD_REVIEW',
      'TERM_SHEET_NEGOTIATION': 'BOARD_APPROVED',
      'TERM_SHEET': 'BOARD_APPROVED',
      'IMPLEMENTATION': 'TERM_SHEET_NEGOTIATION',
      'FUNDED': 'IMPLEMENTATION',
      'PORTFOLIO_MANAGEMENT': 'FUNDED'
    };

    const previousStage = stageFlow[application.currentStage];

    if (!previousStage) {
      console.log(`\n⚠️  Cannot revert from stage: ${application.currentStage}`);
      console.log('   This is the first stage or invalid stage.');
      return;
    }

    console.log(`\n🔄 REVERTING STAGE:`);
    console.log(`   From: ${application.currentStage}`);
    console.log(`   To: ${previousStage}`);
    
    // Update the application stage
    const updatedApplication = await prisma.application.update({
      where: { id: application.id },
      data: {
        currentStage: previousStage,
        updatedAt: new Date()
      }
    });

    console.log('\n✅ Application stage reverted successfully!');
    console.log(`   New Stage: ${updatedApplication.currentStage}`);
    console.log(`   Updated At: ${new Date(updatedApplication.updatedAt).toLocaleString()}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkAndRevertStage();

