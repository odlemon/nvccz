// Script to investigate why portfolio company wasn't created
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function investigate() {
  const email = 'blessingmwalein@gmail.com';
  const applicationId = 'cmhlohjv60000l7044g2u0kxb';
  
  try {
    console.log('🔍 Investigating missing portfolio company...\n');
    
    // Check board review
    const boardReview = await prisma.boardReview.findFirst({
      where: {
        applicationId: applicationId
      },
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
    });

    if (boardReview) {
      console.log('📋 BOARD REVIEW FOUND:');
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log(`Review ID: ${boardReview.id}`);
      console.log(`Status: ${boardReview.status}`);
      console.log(`Investment Approved: ${boardReview.investmentApproved}`);
      console.log(`Investment Rejected: ${boardReview.investmentRejected}`);
      console.log(`Conditional Approval: ${boardReview.conditionalApproval}`);
      console.log(`Board Decision: ${boardReview.decisionReason || 'N/A'}`);
      console.log(`Reviewer: ${boardReview.reviewer.firstName} ${boardReview.reviewer.lastName}`);
      console.log(`Completed At: ${boardReview.completedAt ? new Date(boardReview.completedAt).toLocaleString() : 'Not completed'}`);
      console.log(`Created At: ${new Date(boardReview.createdAt).toLocaleString()}`);
      
      // Check if application went through BOARD_APPROVED stage
      const application = await prisma.application.findUnique({
        where: { id: applicationId },
        select: {
          currentStage: true,
          boardDecision: true
        }
      });
      
      console.log(`\nApplication Current Stage: ${application.currentStage}`);
      console.log(`Application Board Decision: ${application.boardDecision || 'N/A'}`);
      
      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { email: email }
      });
      
      console.log(`\nUser Exists: ${user ? 'Yes' : 'No'}`);
      if (user) {
        console.log(`User ID: ${user.id}`);
        console.log(`User Created At: ${new Date(user.createdAt).toLocaleString()}`);
        
        // Check if portfolio company exists
        const portfolioCompany = await prisma.portfolioCompany.findUnique({
          where: { userId: user.id }
        });
        
        console.log(`\nPortfolio Company Exists: ${portfolioCompany ? 'Yes' : 'No'}`);
        
        if (!portfolioCompany) {
          console.log('\n❌ ISSUE IDENTIFIED:');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log('The user was created BEFORE the board review was completed.');
          console.log('When the board review tried to create the portfolio company,');
          console.log('it found the user already exists and returned early without');
          console.log('creating the portfolio company.');
          console.log('\nThe bug is in BoardReviewService.createUserAndPortfolioCompany():');
          console.log('It checks if user exists and returns early if found,');
          console.log('but it should still create the portfolio company even if user exists.');
        }
      }
    } else {
      console.log('❌ No board review found for this application.');
      console.log('   This might mean the application skipped the board review stage.');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

investigate();

