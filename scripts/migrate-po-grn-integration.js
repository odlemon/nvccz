// @ts-nocheck
/**
 * Manual Database Migration Script for PO and GRN Integration
 * 
 * This script adds the following fields to the purchase_orders table:
 * - quotationId (VARCHAR, nullable, unique) - Links PO to accepted quotation
 * - sentAt (DATETIME, nullable) - When PO was sent to vendor
 * - sentById (VARCHAR, nullable) - Who sent the PO
 * 
 * Also adds foreign key constraints:
 * - quotationId -> vendor_quotations(id)
 * - sentById -> users(id)
 * 
 * Run with: node scripts/migrate-po-grn-integration.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runMigration() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('🔄 PO AND GRN INTEGRATION - DATABASE MIGRATION');
  console.log('════════════════════════════════════════════════════════════════\n');

  try {
    // Check if columns already exist
    console.log('🔍 Step 1: Checking existing schema...');
    
    const existingColumns = await prisma.$queryRaw`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'purchase_orders'
      AND COLUMN_NAME IN ('quotationId', 'sentAt', 'sentById')
    `;

    const columnNames = existingColumns.map((col) => col.COLUMN_NAME);
    console.log(`   Found existing columns: ${columnNames.length > 0 ? columnNames.join(', ') : 'none'}\n`);

    // Add quotationId column if it doesn't exist
    if (!columnNames.includes('quotationId')) {
      console.log('📝 Step 2: Adding quotationId column...');
      await prisma.$executeRaw`
        ALTER TABLE purchase_orders 
        ADD COLUMN quotationId VARCHAR(191) NULL,
        ADD UNIQUE KEY purchase_orders_quotationId_key (quotationId)
      `;
      console.log('   ✅ Added quotationId column\n');
    } else {
      console.log('   ⏭️  quotationId column already exists\n');
    }

    // Add sentAt column if it doesn't exist
    if (!columnNames.includes('sentAt')) {
      console.log('📝 Step 3: Adding sentAt column...');
      await prisma.$executeRaw`
        ALTER TABLE purchase_orders 
        ADD COLUMN sentAt DATETIME(3) NULL
      `;
      console.log('   ✅ Added sentAt column\n');
    } else {
      console.log('   ⏭️  sentAt column already exists\n');
    }

    // Add sentById column if it doesn't exist
    if (!columnNames.includes('sentById')) {
      console.log('📝 Step 4: Adding sentById column...');
      await prisma.$executeRaw`
        ALTER TABLE purchase_orders 
        ADD COLUMN sentById VARCHAR(191) NULL
      `;
      console.log('   ✅ Added sentById column\n');
    } else {
      console.log('   ⏭️  sentById column already exists\n');
    }

    // Check and add foreign key constraints
    console.log('🔗 Step 5: Checking foreign key constraints...');
    
    const existingFKs = await prisma.$queryRaw`
      SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'purchase_orders'
      AND REFERENCED_TABLE_NAME IS NOT NULL
      AND COLUMN_NAME IN ('quotationId', 'sentById')
    `;

    const fkNames = existingFKs.map((fk) => fk.CONSTRAINT_NAME);
    console.log(`   Found existing FKs: ${fkNames.length > 0 ? fkNames.join(', ') : 'none'}\n`);

    // Add foreign key for quotationId if it doesn't exist
    if (!fkNames.some((name) => name.includes('quotationId'))) {
      console.log('📝 Step 6: Adding foreign key constraint for quotationId...');
      try {
        await prisma.$executeRaw`
          ALTER TABLE purchase_orders 
          ADD CONSTRAINT purchase_orders_quotationId_fkey 
          FOREIGN KEY (quotationId) REFERENCES vendor_quotations(id) 
          ON DELETE SET NULL ON UPDATE CASCADE
        `;
        console.log('   ✅ Added foreign key constraint for quotationId\n');
      } catch (error) {
        if (error.message.includes('Duplicate key name') || error.message.includes('already exists')) {
          console.log('   ⏭️  Foreign key constraint for quotationId already exists\n');
        } else {
          throw error;
        }
      }
    } else {
      console.log('   ⏭️  Foreign key constraint for quotationId already exists\n');
    }

    // Add foreign key for sentById if it doesn't exist
    if (!fkNames.some((name) => name.includes('sentById'))) {
      console.log('📝 Step 7: Adding foreign key constraint for sentById...');
      try {
        await prisma.$executeRaw`
          ALTER TABLE purchase_orders 
          ADD CONSTRAINT purchase_orders_sentById_fkey 
          FOREIGN KEY (sentById) REFERENCES users(id) 
          ON DELETE SET NULL ON UPDATE CASCADE
        `;
        console.log('   ✅ Added foreign key constraint for sentById\n');
      } catch (error) {
        if (error.message.includes('Duplicate key name') || error.message.includes('already exists')) {
          console.log('   ⏭️  Foreign key constraint for sentById already exists\n');
        } else {
          throw error;
        }
      }
    } else {
      console.log('   ⏭️  Foreign key constraint for sentById already exists\n');
    }

    // Verify the migration
    console.log('✅ Step 8: Verifying migration...');
    const verifyColumns = await prisma.$queryRaw`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'purchase_orders'
      AND COLUMN_NAME IN ('quotationId', 'sentAt', 'sentById')
      ORDER BY COLUMN_NAME
    `;

    console.log('\n   Migration Results:');
    verifyColumns.forEach((col) => {
      console.log(`   - ${col.COLUMN_NAME}: ${col.DATA_TYPE} (${col.IS_NULLABLE === 'YES' ? 'nullable' : 'not null'}) ${col.COLUMN_KEY ? `[${col.COLUMN_KEY}]` : ''}`);
    });

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n════════════════════════════════════════════════════════════════');
    console.error('❌ MIGRATION FAILED!');
    console.error('════════════════════════════════════════════════════════════════');
    console.error('Error:', error.message);
    console.error('\nFull error:', error);
    console.error('════════════════════════════════════════════════════════════════\n');
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
runMigration()
  .then(() => {
    console.log('✅ Migration script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Migration script failed:', error);
    process.exit(1);
  });

