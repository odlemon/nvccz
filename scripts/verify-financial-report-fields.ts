// @ts-nocheck
import { prisma } from '../src/utils/database';

async function verifyFields() {
  try {
    console.log('🔍 Verifying financial_reports table structure...\n');

    const result: any = await prisma.$queryRawUnsafe('DESCRIBE financial_reports');
    
    console.log('📋 Financial Reports Table - New Columns:');
    console.log('─'.repeat(80));
    
    const targetColumns = ['totalRevenue', 'netProfit', 'cashFlowNet'];
    const foundColumns = result.filter((col: any) => targetColumns.includes(col.Field));
    
    if (foundColumns.length === 3) {
      foundColumns.forEach((col: any) => {
        console.log(`✅ ${col.Field.padEnd(20)} | ${col.Type.padEnd(20)} | ${col.Null === 'YES' ? 'NULL' : 'NOT NULL'}`);
      });
      console.log('─'.repeat(80));
      console.log('\n✅ All 3 columns successfully added!');
    } else {
      console.log('❌ Missing columns!');
      targetColumns.forEach(col => {
        const found = foundColumns.find((c: any) => c.Field === col);
        console.log(`${found ? '✅' : '❌'} ${col}`);
      });
    }

    // Check index
    console.log('\n🔍 Verifying index...');
    const indexResult: any = await prisma.$queryRawUnsafe(`
      SHOW INDEX FROM financial_reports 
      WHERE Key_name = 'idx_financial_reports_period'
    `);
    
    if (indexResult && indexResult.length > 0) {
      console.log('✅ Index idx_financial_reports_period exists');
      console.log(`   Columns: ${indexResult.map((idx: any) => idx.Column_name).join(', ')}`);
    } else {
      console.log('⚠️  Index not found');
    }

    console.log('\n✅ Verification complete!');
  } catch (error: any) {
    console.error('❌ Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

verifyFields();
