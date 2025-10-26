// @ts-nocheck
import fs from 'fs';
import path from 'path';

async function testCSVImport() {
  try {
    console.log('🧪 Testing CSV Import Functionality');
    
    // Read the sample CSV file
    const csvPath = path.join(__dirname, '..', 'sample-cashbook-transactions.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    
    console.log('📄 CSV Content:');
    console.log(csvContent);
    
    // Parse CSV to show structure
    const lines = csvContent.split('\n').filter(line => line.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    
    console.log('\n📊 CSV Structure:');
    console.log('Headers:', headers);
    console.log(`Total rows: ${lines.length - 1}`);
    
    // Show first few transactions
    console.log('\n🔍 First 3 Transactions:');
    for (let i = 1; i <= Math.min(3, lines.length - 1); i++) {
      const values = lines[i].split(',').map(v => v.trim());
      const transaction = {};
      headers.forEach((header, index) => {
        transaction[header] = values[index];
      });
      console.log(`Transaction ${i}:`, transaction);
    }
    
    console.log('\n✅ CSV file is ready for testing!');
    console.log('📝 To test the import:');
    console.log('1. Start the server: npm run dev');
    console.log('2. Use Postman or curl to POST to /api/cashbook/batches/import');
    console.log('3. Upload the sample-cashbook-transactions.csv file');
    
  } catch (error: any) {
    console.error('❌ Error testing CSV import:', error.message);
  }
}

testCSVImport();

