// Script to manually trigger shortlisting process
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function triggerShortlisting() {
  const email = 'nyashakarata1@gmail.com';
  
  try {
    console.log(`🔍 Finding application for: ${email}\n`);
    
    // Find application
    const application = await prisma.application.findFirst({
      where: {
        applicantEmail: email
      },
      include: {
        documents: {
          where: { isSubmitted: true }
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

    if (application.currentStage !== 'PENDING_SHORTLISTING') {
      console.log(`⚠️  Application is in ${application.currentStage} stage, not PENDING_SHORTLISTING.`);
      console.log('   Shortlisting process only runs for PENDING_SHORTLISTING applications.');
      return;
    }

    console.log('📋 APPLICATION FOUND:');
    console.log(`   ID: ${application.id}`);
    console.log(`   Business: ${application.businessName}`);
    console.log(`   Stage: ${application.currentStage}`);
    console.log(`   Documents: ${application.documents.length}\n`);

    console.log('🤖 Triggering shortlisting process...\n');

    // Import and trigger the service
    const { ApplicationScoringService } = require('../src/services/ApplicationScoringService');
    
    await ApplicationScoringService.processApplicationForShortlisting(application.id);

    console.log('\n✅ Shortlisting process completed!');
    console.log('   Check the application status to see the result.');

    // Check updated status
    const updated = await prisma.application.findUnique({
      where: { id: application.id },
      select: {
        currentStage: true,
        initialScreeningScore: true,
        screeningOutcome: true
      }
    });

    console.log('\n📊 UPDATED STATUS:');
    console.log(`   Stage: ${updated.currentStage}`);
    console.log(`   Score: ${updated.initialScreeningScore || 'N/A'}`);
    console.log(`   Outcome: ${updated.screeningOutcome || 'N/A'}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

triggerShortlisting();

