// Script to check shortlisting status and manually trigger if needed
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function checkShortlistingStatus() {
  const email = 'nyashakarata1@gmail.com';
  
  try {
    console.log(`🔍 Checking application status for: ${email}\n`);
    
    // Find the most recent application
    const application = await prisma.application.findFirst({
      where: {
        applicantEmail: email
      },
      include: {
        documents: {
          select: {
            id: true,
            fileName: true,
            documentType: true,
            fileUrl: true,
            isSubmitted: true
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

    console.log('📋 APPLICATION STATUS:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Application ID: ${application.id}`);
    console.log(`Applicant Name: ${application.applicantName}`);
    console.log(`Business Name: ${application.businessName}`);
    console.log(`Current Stage: ${application.currentStage}`);
    console.log(`Initial Screening Score: ${application.initialScreeningScore || 'Not set'}`);
    console.log(`Screening Outcome: ${application.screeningOutcome || 'Not set'}`);
    console.log(`Documents: ${application.documents.length} files`);
    console.log(`Created At: ${new Date(application.createdAt).toLocaleString()}`);
    console.log(`Updated At: ${new Date(application.updatedAt).toLocaleString()}`);
    
    console.log('\n📄 DOCUMENTS:');
    application.documents.forEach((doc, index) => {
      console.log(`  ${index + 1}. ${doc.documentType} - ${doc.fileName}`);
      console.log(`     Submitted: ${doc.isSubmitted}`);
      console.log(`     URL: ${doc.fileUrl.substring(0, 80)}...`);
    });

    if (application.currentStage === 'PENDING_SHORTLISTING') {
      console.log('\n⚠️  Application is still pending shortlisting!');
      console.log('   This means the AI scoring process may not have completed.');
      
      // Check if we should manually trigger
      console.log('\n🤖 Would you like to manually trigger the shortlisting process?');
      console.log('   Run: node scripts/manually-trigger-shortlisting.js');
    } else if (application.currentStage === 'SHORTLISTED') {
      console.log('\n✅ Application has been SHORTLISTED!');
      console.log(`   Score: ${application.initialScreeningScore || 'N/A'}`);
    } else if (application.currentStage === 'REJECTED') {
      console.log('\n❌ Application has been REJECTED!');
      console.log(`   Score: ${application.initialScreeningScore || 'N/A'}`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkShortlistingStatus();

