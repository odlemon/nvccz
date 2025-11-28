// @ts-nocheck
/**
 * Migration script to add status field to activity_logs table
 * Sets all existing activities to 'pending_approval' status
 */

import { PrismaClient } from '@prisma/client';
import { prisma } from '../src/utils/database';

async function migrateActivityLogStatus() {
  try {
    console.log('🔄 Starting migration: Adding status field to activity_logs...');
    
    // Check if column already exists
    const columnCheck = await prisma.$queryRaw<Array<{Field: string}>>`
      SELECT COLUMN_NAME as Field
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'activity_logs'
      AND COLUMN_NAME = 'status';
    `;
    
    if (columnCheck.length === 0) {
      // First, add the column (MySQL doesn't support IF NOT EXISTS)
      console.log('📝 Adding status column to activity_logs table...');
      try {
        await prisma.$executeRaw`
          ALTER TABLE activity_logs 
          ADD COLUMN status VARCHAR(255) DEFAULT 'pending_approval';
        `;
        console.log('✅ Status column added successfully');
      } catch (error: any) {
        if (error.message?.includes('Duplicate column name')) {
          console.log('ℹ️  Status column already exists, skipping...');
        } else {
          throw error;
        }
      }
    } else {
      console.log('ℹ️  Status column already exists, skipping column creation...');
    }
    
    // Update all existing activities to pending_approval
    console.log('📝 Updating existing activities to pending_approval status...');
    const updateResult = await prisma.$executeRaw`
      UPDATE activity_logs 
      SET status = 'pending_approval' 
      WHERE status IS NULL OR status = '';
    `;
    
    console.log(`✅ Updated ${updateResult} existing activities to pending_approval status`);
    
    // Verify the migration
    const totalActivities = await prisma.activityLog.count();
    const pendingActivities = await prisma.activityLog.count({
      where: { status: 'pending_approval' }
    });
    const approvedActivities = await prisma.activityLog.count({
      where: { status: 'approved' }
    });
    const rejectedActivities = await prisma.activityLog.count({
      where: { status: 'rejected' }
    });
    
    console.log('\n📊 Migration Summary:');
    console.log(`   Total activities: ${totalActivities}`);
    console.log(`   Pending approval: ${pendingActivities}`);
    console.log(`   Approved: ${approvedActivities}`);
    console.log(`   Rejected: ${rejectedActivities}`);
    
    console.log('\n✅ Migration completed successfully!');
    
  } catch (error: any) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateActivityLogStatus()
  .then(() => {
    console.log('Migration script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration script failed:', error);
    process.exit(1);
  });

