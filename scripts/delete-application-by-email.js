// Script to delete application by applicant email
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const prisma = new PrismaClient();

async function deleteApplication() {
  const email = 'nyashakarata1@gmail.com';
  
  try {
    console.log(`🔍 Searching for application with email: ${email}\n`);
    
    // Find application
    const application = await prisma.application.findFirst({
      where: {
        applicantEmail: email
      },
      include: {
        documents: {
          select: {
            id: true,
            fileName: true,
            documentType: true
          }
        },
        termSheet: {
          select: {
            id: true
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
    console.log(`Documents: ${application.documents.length} files`);
    console.log(`Term Sheet: ${application.termSheet ? 'Yes' : 'No'}`);
    console.log(`Created At: ${new Date(application.createdAt).toLocaleString()}`);
    
    // Confirm deletion
    console.log('\n⚠️  WARNING: This will delete the application and all associated data!');
    console.log('   Including: documents, term sheets, reviews, etc.');
    
    // Delete the application (cascade will handle related records)
    console.log('\n🗑️  Deleting application...');
    
    await prisma.application.delete({
      where: {
        id: application.id
      }
    });

    console.log('\n✅ Application deleted successfully!');
    console.log(`   Application ID: ${application.id}`);
    console.log(`   Business Name: ${application.businessName}`);
    console.log(`   Documents deleted: ${application.documents.length}`);
    if (application.termSheet) {
      console.log(`   Term Sheet deleted: Yes`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    
    if (error.code === 'P2003') {
      console.error('\n⚠️  Foreign key constraint error. Some related records may still exist.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

deleteApplication();

