// Manual Database Update Script
// Updates all REJECTED status to BELOW_THRESHOLD in applications table
// Run this script manually: node update-db-rejected-to-below-threshold.js

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateRejectedToBelowThreshold() {
  console.log('🔄 Starting database update: REJECTED → BELOW_THRESHOLD');
  console.log('================================================\n');

  try {
    // Check current REJECTED applications
    const rejectedApps = await prisma.application.findMany({
      where: {
        currentStage: 'REJECTED'
      },
      select: {
        id: true,
        businessName: true,
        applicantEmail: true,
        currentStage: true,
        updatedAt: true
      }
    });

    console.log(`📊 Found ${rejectedApps.length} applications with REJECTED status\n`);

    if (rejectedApps.length === 0) {
      console.log('✅ No applications to update. Database is already up to date.');
      return;
    }

    // Display applications that will be updated
    console.log('Applications to be updated:');
    console.log('----------------------------');
    rejectedApps.forEach((app, index) => {
      console.log(`${index + 1}. ${app.businessName} (${app.applicantEmail})`);
      console.log(`   ID: ${app.id}`);
      console.log(`   Current Stage: ${app.currentStage}`);
      console.log(`   Last Updated: ${app.updatedAt.toISOString()}\n`);
    });

    // Update all REJECTED to BELOW_THRESHOLD
    console.log('🔄 Updating applications...\n');

    const updateResult = await prisma.application.updateMany({
      where: {
        currentStage: 'REJECTED'
      },
      data: {
        currentStage: 'BELOW_THRESHOLD',
        updatedAt: new Date()
      }
    });

    console.log(`✅ Successfully updated ${updateResult.count} application(s)`);
    console.log('================================================\n');

    // Verify the update
    const verifyBelowThreshold = await prisma.application.count({
      where: {
        currentStage: 'BELOW_THRESHOLD'
      }
    });

    const verifyRejected = await prisma.application.count({
      where: {
        currentStage: 'REJECTED'
      }
    });

    console.log('📊 Verification:');
    console.log(`   - BELOW_THRESHOLD applications: ${verifyBelowThreshold}`);
    console.log(`   - REJECTED applications remaining: ${verifyRejected}`);
    console.log('');

    if (verifyRejected === 0) {
      console.log('✅ All REJECTED applications have been successfully updated to BELOW_THRESHOLD');
    } else {
      console.log('⚠️  Warning: Some REJECTED applications still exist. Please investigate.');
    }

  } catch (error) {
    console.error('❌ Error updating database:', error);
    console.error('\nError details:', error.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the update
updateRejectedToBelowThreshold()
  .then(() => {
    console.log('\n✅ Database update completed successfully!');
    console.log('================================================\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Database update failed:', error);
    process.exit(1);
  });

