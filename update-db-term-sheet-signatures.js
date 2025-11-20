const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateDatabase() {
  try {
    console.log('🔄 Updating database schema for term sheet signatures...\n');
    console.log('═══════════════════════════════════════════════════════\n');

    // Check if new signature columns already exist
    console.log('1. Checking existing signature columns...');
    const allColumns = await prisma.$queryRaw`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'term_sheets'
    `;
    
    const columnNames = allColumns.map(col => col.COLUMN_NAME);
    const hasApplicantSignature = columnNames.includes('applicantSignatureUrl');
    const hasInvestorSignature = columnNames.includes('investorSignatureUrl');
    
    if (hasApplicantSignature && hasInvestorSignature) {
      console.log('   ✅ All signature columns already exist\n');
    } else {
      // Add applicant signature fields
      if (!hasApplicantSignature) {
        console.log('2. Adding applicant signature columns...');
        try {
          await prisma.$executeRaw`
            ALTER TABLE term_sheets 
            ADD COLUMN applicantSignatureUrl TEXT NULL,
            ADD COLUMN applicantSignatureFileName VARCHAR(255) NULL,
            ADD COLUMN applicantSignedById VARCHAR(191) NULL,
            ADD COLUMN applicantSignedAt DATETIME NULL
          `;
          console.log('   ✅ Applicant signature columns added\n');
        } catch (error) {
          console.log(`   ⚠️  Error adding applicant columns: ${error.message}\n`);
        }
      } else {
        console.log('   ✅ Applicant signature columns already exist\n');
      }

      // Add investor signature fields
      if (!hasInvestorSignature) {
        console.log('3. Adding investor signature columns...');
        try {
          await prisma.$executeRaw`
            ALTER TABLE term_sheets 
            ADD COLUMN investorSignatureUrl TEXT NULL,
            ADD COLUMN investorSignatureFileName VARCHAR(255) NULL,
            ADD COLUMN investorSignedById VARCHAR(191) NULL,
            ADD COLUMN investorSignedAt DATETIME NULL
          `;
          console.log('   ✅ Investor signature columns added\n');
        } catch (error) {
          console.log(`   ⚠️  Error adding investor columns: ${error.message}\n`);
        }
      } else {
        console.log('   ✅ Investor signature columns already exist\n');
      }
    }

    // Check if foreign keys exist
    console.log('4. Checking foreign key constraints...');
    const existingFKs = await prisma.$queryRaw`
      SELECT CONSTRAINT_NAME 
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
      WHERE TABLE_NAME = 'term_sheets' 
      AND CONSTRAINT_NAME IN (
        'term_sheets_applicantSignedById_fkey',
        'term_sheets_investorSignedById_fkey'
      )
    `;

    const fkNames = existingFKs.map(fk => fk.CONSTRAINT_NAME);
    
    if (!fkNames.includes('term_sheets_applicantSignedById_fkey')) {
      console.log('5. Adding foreign key for applicantSignedById...');
      try {
        await prisma.$executeRaw`
          ALTER TABLE term_sheets 
          ADD CONSTRAINT term_sheets_applicantSignedById_fkey 
          FOREIGN KEY (applicantSignedById) REFERENCES users(id) ON DELETE SET NULL
        `;
        console.log('   ✅ Foreign key added for applicantSignedById\n');
      } catch (error) {
        console.log(`   ⚠️  Foreign key may already exist or error: ${error.message}\n`);
      }
    } else {
      console.log('   ✅ Foreign key for applicantSignedById already exists\n');
    }

    if (!fkNames.includes('term_sheets_investorSignedById_fkey')) {
      console.log('6. Adding foreign key for investorSignedById...');
      try {
        await prisma.$executeRaw`
          ALTER TABLE term_sheets 
          ADD CONSTRAINT term_sheets_investorSignedById_fkey 
          FOREIGN KEY (investorSignedById) REFERENCES users(id) ON DELETE SET NULL
        `;
        console.log('   ✅ Foreign key added for investorSignedById\n');
      } catch (error) {
        console.log(`   ⚠️  Foreign key may already exist or error: ${error.message}\n`);
      }
    } else {
      console.log('   ✅ Foreign key for investorSignedById already exists\n');
    }

    // Verify the columns
    console.log('7. Verifying columns...');
    const columns = await prisma.$queryRaw`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_NAME = 'term_sheets' 
      AND (COLUMN_NAME LIKE '%signature%' OR COLUMN_NAME LIKE '%Signed%')
      ORDER BY COLUMN_NAME
    `;

    console.log('   ✅ Signature columns in database:');
    columns.forEach(col => {
      console.log(`      - ${col.COLUMN_NAME} (${col.DATA_TYPE}, nullable: ${col.IS_NULLABLE})`);
    });

    console.log('\n═══════════════════════════════════════════════════════\n');
    console.log('✅ SUCCESS: Database updated successfully!\n');
    console.log('Next steps:');
    console.log('   1. Run: npx prisma generate (to update Prisma client)');
    console.log('   2. Restart your server');
    console.log('   3. Test term sheet signature upload\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

updateDatabase();

