import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Application ID from the previous Lysp application
const lyspApplicationId = 'cmh4k3d830000unb44xt2w6ef';

async function deleteApplicationDirect() {
  try {
    console.log('🗑️ Deleting Lysp Application Directly from Database...');
    console.log(`📋 Application ID: ${lyspApplicationId}`);
    
    // First, let's check if the application exists
    console.log('\n🔍 Checking if application exists...');
    const application = await prisma.application.findUnique({
      where: { id: lyspApplicationId },
      include: {
        documents: true,
        notifications: true
      }
    });
    
    if (!application) {
      console.log('❌ Application not found in database');
      console.log('   The application may have already been deleted');
      return;
    }
    
    console.log('✅ Application found:');
    console.log(`   Business Name: ${application.businessName}`);
    console.log(`   Applicant: ${application.applicantName}`);
    console.log(`   Email: ${application.applicantEmail}`);
    console.log(`   Current Stage: ${application.currentStage}`);
    console.log(`   Requested Amount: $${application.requestedAmount?.toLocaleString()}`);
    console.log(`   Documents: ${application.documents.length} files`);
    console.log(`   Notifications: ${application.notifications.length} notifications`);
    
    // Check if application can be deleted (only SHORTLISTED stage)
    if (application.currentStage !== 'SHORTLISTED') {
      console.log(`\n⚠️  Application is in ${application.currentStage} stage`);
      console.log('   Only applications in SHORTLISTED stage can be deleted');
      console.log('   This is a safety measure to prevent deletion of processed applications');
      return;
    }
    
    console.log('\n🗑️ Deleting application and related data...');
    
    // Delete related records first (due to foreign key constraints)
    console.log('   Deleting application documents...');
    await prisma.applicationDocument.deleteMany({
      where: { applicationId: lyspApplicationId }
    });
    
    console.log('   Deleting application notifications...');
    await prisma.applicationNotification.deleteMany({
      where: { applicationId: lyspApplicationId }
    });
    
    // Delete the main application record
    console.log('   Deleting main application record...');
    await prisma.application.delete({
      where: { id: lyspApplicationId }
    });
    
    console.log('\n✅ Application Deleted Successfully!');
    console.log('📊 Deletion Summary:');
    console.log(`   Application ID: ${lyspApplicationId}`);
    console.log(`   Business Name: ${application.businessName}`);
    console.log(`   Documents Deleted: ${application.documents.length}`);
    console.log(`   Notifications Deleted: ${application.notifications.length}`);
    console.log(`   Deleted At: ${new Date().toISOString()}`);
    
    console.log('\n🎯 Current Applications Status:');
    console.log('   ✅ Lysp Application (Nyasha Muzondo) - DELETED');
    console.log('   ✅ LegalPricing AI Application (Nyasha K) - ACTIVE');
    
  } catch (error: any) {
    console.error('\n❌ Error deleting application:');
    console.error(`   Error: ${error.message}`);
    
    if (error.code === 'P2003') {
      console.error('\n🔗 Foreign Key Constraint Error:');
      console.error('   There are related records that prevent deletion');
      console.error('   This might be due to existing due diligence or board reviews');
    } else if (error.code === 'P2025') {
      console.error('\n❌ Record Not Found:');
      console.error('   The application may have already been deleted');
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Run the deletion
deleteApplicationDirect();



