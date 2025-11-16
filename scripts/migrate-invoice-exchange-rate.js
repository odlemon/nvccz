// @ts-nocheck
/**
 * Manual Database Migration Script for Invoice Exchange Rate
 * Adds exchangeRateAtCreation column to procurement_invoices table
 * 
 * Run with: node scripts/migrate-invoice-exchange-rate.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runMigration() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('🔄 INVOICE EXCHANGE RATE - DATABASE MIGRATION');
  console.log('════════════════════════════════════════════════════════════════\n');

  try {
    // Check if column already exists
    console.log('🔍 Step 1: Checking existing schema...');
    
    const existingColumns = await prisma.$queryRaw`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'procurement_invoices'
      AND COLUMN_NAME = 'exchangeRateAtCreation'
    `;

    if (existingColumns.length > 0) {
      console.log('   ✅ Column already exists\n');
    } else {
      console.log('   📝 Step 2: Adding exchangeRateAtCreation column...');
      await prisma.$executeRaw`
        ALTER TABLE procurement_invoices 
        ADD COLUMN exchangeRateAtCreation DECIMAL(15, 6) NULL
      `;
      console.log('   ✅ Added exchangeRateAtCreation column\n');
    }

    // Verify the migration
    console.log('✅ Step 3: Verifying migration...');
    const verifyColumns = await prisma.$queryRaw`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
      AND TABLE_NAME = 'procurement_invoices'
      AND COLUMN_NAME = 'exchangeRateAtCreation'
    `;

    if (verifyColumns.length > 0) {
      const col = verifyColumns[0];
      console.log(`   ✅ Column verified: ${col.COLUMN_NAME} (${col.DATA_TYPE}, ${col.IS_NULLABLE === 'YES' ? 'nullable' : 'not null'})\n`);
    }

    console.log('════════════════════════════════════════════════════════════════');
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

