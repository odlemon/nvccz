// @ts-nocheck
import { prisma } from '../src/utils/database';
import { readFileSync } from 'fs';
import { join } from 'path';

async function addFinancialReportFields() {
  console.log('🚀 Starting database update: Adding financial report fields...\n');

  try {
    // Read the SQL file
    const sqlPath = join(__dirname, 'sql', 'add_financial_report_fields.sql');
    const sql = readFileSync(sqlPath, 'utf-8');

    // Check if columns already exist
    console.log('🔍 Checking existing columns...');
    const existingColumnsResult: any = await prisma.$queryRawUnsafe(`
      SELECT COLUMN_NAME 
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'financial_reports'
        AND COLUMN_NAME IN ('totalRevenue', 'netProfit', 'cashFlowNet')
    `);

    const existingColumns = Array.isArray(existingColumnsResult) ? existingColumnsResult : [];
    const existingColumnNames = existingColumns.map((col: any) => col.COLUMN_NAME);
    console.log(`   Existing columns: ${existingColumnNames.length > 0 ? existingColumnNames.join(', ') : 'none'}\n`);

    // Add columns if they don't exist
    console.log('\n📝 Adding columns...');
    const columnsToAdd: string[] = [];
    if (!existingColumnNames.includes('totalRevenue')) columnsToAdd.push('totalRevenue');
    if (!existingColumnNames.includes('netProfit')) columnsToAdd.push('netProfit');
    if (!existingColumnNames.includes('cashFlowNet')) columnsToAdd.push('cashFlowNet');

    if (columnsToAdd.length > 0) {
      try {
        // Build dynamic ALTER statement for missing columns only
        const alterStatements = columnsToAdd.map(col => {
          if (col === 'totalRevenue') return 'ADD COLUMN totalRevenue DECIMAL(19,2) NULL';
          if (col === 'netProfit') return 'ADD COLUMN netProfit DECIMAL(19,2) NULL';
          if (col === 'cashFlowNet') return 'ADD COLUMN cashFlowNet DECIMAL(19,2) NULL';
          return '';
        }).filter(s => s.length > 0);

        const dynamicAlter = `ALTER TABLE financial_reports ${alterStatements.join(', ')}`;
        await prisma.$executeRawUnsafe(dynamicAlter);
        console.log(`   ✅ Added columns: ${columnsToAdd.join(', ')}`);
      } catch (error: any) {
        if (error.message.includes('Duplicate column')) {
          console.log(`   ⚠️  Some columns already exist (this is OK)`);
        } else {
          throw error;
        }
      }
    } else {
      console.log('   ⏭️  All columns already exist, skipping ALTER TABLE');
    }

    // Add index if it doesn't exist
    console.log('\n📝 Adding index...');
    const existingIndexesResult: any = await prisma.$queryRawUnsafe(`
      SELECT INDEX_NAME 
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'financial_reports'
        AND INDEX_NAME = 'idx_financial_reports_period'
    `);

    const existingIndexes = Array.isArray(existingIndexesResult) ? existingIndexesResult : [];

    if (existingIndexes.length === 0) {
      try {
        await prisma.$executeRawUnsafe(`
          CREATE INDEX idx_financial_reports_period 
          ON financial_reports(portfolioCompanyId, periodEnd, status)
        `);
        console.log('   ✅ Index created successfully');
      } catch (error: any) {
        if (error.message.includes('Duplicate key') || error.message.includes('already exists')) {
          console.log('   ⚠️  Index already exists (this is OK)');
        } else {
          throw error;
        }
      }
    } else {
      console.log('   ⏭️  Index already exists, skipping CREATE INDEX');
    }

    // Verify the changes
    console.log('\n🔍 Verifying changes...');
    const columnsResult: any = await prisma.$queryRawUnsafe(`
      SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'financial_reports'
        AND COLUMN_NAME IN ('totalRevenue', 'netProfit', 'cashFlowNet')
      ORDER BY COLUMN_NAME
    `);

    const columns = Array.isArray(columnsResult) ? columnsResult : [];
    console.log('\n📊 Updated columns:');
    if (columns.length === 0) {
      console.log('   ❌ No columns found! Something went wrong.');
    } else {
      columns.forEach((col: any) => {
        console.log(`   ✅ ${col.COLUMN_NAME}: ${col.DATA_TYPE} (${col.IS_NULLABLE === 'YES' ? 'NULL' : 'NOT NULL'})`);
      });
    }

    // Check index
    const indexesResult: any = await prisma.$queryRawUnsafe(`
      SELECT INDEX_NAME, COLUMN_NAME
      FROM INFORMATION_SCHEMA.STATISTICS 
      WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'financial_reports'
        AND INDEX_NAME = 'idx_financial_reports_period'
      ORDER BY SEQ_IN_INDEX
    `);

    const indexes = Array.isArray(indexesResult) ? indexesResult : [];

    console.log('\n📊 Index status:');
    if (indexes.length > 0) {
      const indexColumns = indexes.map((idx: any) => idx.COLUMN_NAME).join(', ');
      console.log(`   ✅ idx_financial_reports_period on (${indexColumns})`);
    } else {
      console.log('   ⚠️  Index not found (may need to be created manually)');
    }

    console.log('\n✅ Database update completed successfully!');
    console.log('\n📝 Summary:');
    console.log('   - Added totalRevenue, netProfit, cashFlowNet columns');
    console.log('   - Added index for faster queries');
    console.log('   - All fields are nullable (optional)');

  } catch (error: any) {
    console.error('\n❌ Error updating database:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

addFinancialReportFields();
