const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateDatabase() {
  try {
    console.log('🔄 Updating database schema for milestone-based disbursements...\n');
    console.log('═══════════════════════════════════════════════════════\n');

    // Check if columns already exist
    console.log('1. Checking existing columns...');
    const allColumns = await prisma.$queryRaw`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'investment_implementations'
    `;
    
    const columnNames = allColumns.map(col => col.COLUMN_NAME);
    const hasDisbursementMode = columnNames.includes('disbursementMode');
    const hasTotalCommittedAmount = columnNames.includes('totalCommittedAmount');
    
    if (hasDisbursementMode && hasTotalCommittedAmount) {
      console.log('   ✅ All disbursement columns already exist\n');
    } else {
      // Add disbursement mode
      if (!hasDisbursementMode) {
        console.log('2. Adding disbursementMode column...');
        try {
          await prisma.$executeRaw`
            ALTER TABLE investment_implementations 
            ADD COLUMN disbursementMode VARCHAR(50) DEFAULT 'ONE_TIME'
          `;
          console.log('   ✅ disbursementMode column added\n');
        } catch (error) {
          console.log(`   ⚠️  Error adding disbursementMode: ${error.message}\n`);
        }
      } else {
        console.log('   ✅ disbursementMode column already exists\n');
      }

      // Add total committed amount
      if (!hasTotalCommittedAmount) {
        console.log('3. Adding totalCommittedAmount column...');
        try {
          await prisma.$executeRaw`
            ALTER TABLE investment_implementations 
            ADD COLUMN totalCommittedAmount DECIMAL(15, 2) NULL
          `;
          console.log('   ✅ totalCommittedAmount column added\n');
        } catch (error) {
          console.log(`   ⚠️  Error adding totalCommittedAmount: ${error.message}\n`);
        }
      } else {
        console.log('   ✅ totalCommittedAmount column already exists\n');
      }
    }

    // Verify the columns
    console.log('4. Verifying columns...');
    const columns = await prisma.$queryRaw`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'investment_implementations' 
      AND (COLUMN_NAME = 'disbursementMode' OR COLUMN_NAME = 'totalCommittedAmount')
      ORDER BY COLUMN_NAME
    `;

    console.log('   ✅ Disbursement columns in database:');
    columns.forEach(col => {
      console.log(`      - ${col.COLUMN_NAME} (${col.DATA_TYPE}, nullable: ${col.IS_NULLABLE}, default: ${col.COLUMN_DEFAULT || 'NULL'})`);
    });

    console.log('\n═══════════════════════════════════════════════════════\n');
    console.log('✅ SUCCESS: Database updated successfully!\n');
    console.log('Next steps:');
    console.log('   1. Run: npx prisma generate (to update Prisma client)');
    console.log('   2. Restart your server');
    console.log('   3. Test milestone-based disbursements\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

updateDatabase();

