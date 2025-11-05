// Script to check board review status and reset it if needed
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function checkAndResetBoardReview() {
  const email = 'logixvine@gmail.com';
  
  try {
    console.log(`🔍 Searching for application with email: ${email}\n`);
    
    // Find application
    const application = await prisma.application.findFirst({
      where: {
        applicantEmail: email
      },
      include: {
        boardReview: {
          include: {
            reviewer: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
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
    
    if (application.boardReview) {
      console.log('\n📊 BOARD REVIEW STATUS:');
      console.log(`   Board Review ID: ${application.boardReview.id}`);
      console.log(`   Status: ${application.boardReview.status}`);
      console.log(`   Investment Approved: ${application.boardReview.investmentApproved}`);
      console.log(`   Investment Rejected: ${application.boardReview.investmentRejected}`);
      console.log(`   Conditional Approval: ${application.boardReview.conditionalApproval}`);
      console.log(`   Reviewer: ${application.boardReview.reviewer?.firstName} ${application.boardReview.reviewer?.lastName}`);
      console.log(`   Created At: ${new Date(application.boardReview.createdAt).toLocaleString()}`);
      console.log(`   Completed At: ${application.boardReview.completedAt ? new Date(application.boardReview.completedAt).toLocaleString() : 'Not completed'}`);
    } else {
      console.log('\n❌ No board review found for this application.');
      return;
    }

    // Reset board review to allow completion again
    if (application.boardReview.status === 'COMPLETED') {
      console.log('\n🔄 RESETTING BOARD REVIEW STATUS:');
      console.log(`   From: ${application.boardReview.status}`);
      console.log(`   To: IN_PROGRESS`);
      
      const updatedBoardReview = await prisma.boardReview.update({
        where: { id: application.boardReview.id },
        data: {
          status: 'IN_PROGRESS',
          completedAt: null, // Clear completion date
          updatedAt: new Date()
        }
      });

      console.log('\n✅ Board review status reset successfully!');
      console.log(`   New Status: ${updatedBoardReview.status}`);
      console.log(`   Completed At: ${updatedBoardReview.completedAt || 'Not set'}`);
      console.log(`   Updated At: ${new Date(updatedBoardReview.updatedAt).toLocaleString()}`);
    } else {
      console.log(`\n✅ Board review is already in ${application.boardReview.status} status.`);
      console.log('   No reset needed.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkAndResetBoardReview();

