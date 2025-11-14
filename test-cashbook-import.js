const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

async function testCashbookImport() {
  try {
    console.log('🔐 Step 1: Logging in...');
    
    // Login
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful\n');
    
    const headers = {
      'Authorization': `Bearer ${token}`
    };
    
    // Step 2: Get Template
    console.log('📥 Step 2: Getting CSV template...');
    try {
      const templateResponse = await axios.get(`${BASE_URL}/api/cashbook/batches/import/template`, {
        headers,
        responseType: 'text'
      });
      
      fs.writeFileSync('cashbook_template.csv', templateResponse.data);
      console.log('✅ Template downloaded to cashbook_template.csv');
      console.log('\nTemplate preview:');
      const templateLines = templateResponse.data.split('\n').slice(0, 6);
      templateLines.forEach(line => console.log(line));
      console.log('');
    } catch (error) {
      console.error('❌ Failed to get template:', error.response?.data || error.message);
    }
    
    // Step 3: Test Import
    console.log('📤 Step 3: Testing CSV import...');
    const csvFile = 'sample-cashbook-transactions.csv';
    
    if (!fs.existsSync(csvFile)) {
      console.error(`❌ CSV file not found: ${csvFile}`);
      return;
    }
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(csvFile), {
      filename: csvFile,
      contentType: 'text/csv'
    });
    
    try {
      const importResponse = await axios.post(
        `${BASE_URL}/api/cashbook/batches/import`,
        formData,
        {
          headers: {
            ...headers,
            ...formData.getHeaders()
          }
        }
      );
      
      console.log('✅ Import successful!');
      console.log('\nImport Result:');
      console.log(JSON.stringify(importResponse.data, null, 2));
      
      if (importResponse.data.data) {
        const result = importResponse.data.data;
        console.log('\n📊 Summary:');
        console.log(`   Batch ID: ${result.batchId}`);
        console.log(`   Total Transactions: ${result.totalTransactions}`);
        console.log(`   Valid Transactions: ${result.validTransactions}`);
        console.log(`   Invalid Transactions: ${result.invalidTransactions}`);
        
        if (result.errors && result.errors.length > 0) {
          console.log('\n❌ Errors:');
          result.errors.forEach(error => console.log(`   - ${error}`));
        } else {
          console.log('\n✅ No errors!');
        }
      }
    } catch (error) {
      console.error('❌ Import failed:', error.response?.data || error.message);
      if (error.response?.data) {
        console.log('\nError details:');
        console.log(JSON.stringify(error.response.data, null, 2));
      }
    }
    
    console.log('\n✅ Test complete!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

// Run test
testCashbookImport();

