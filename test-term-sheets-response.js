// Test script to verify term sheets response format
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000/api';

async function testTermSheetsResponse() {
  try {
    console.log('🧪 Testing Term Sheets Response Format...\n');

    // Step 1: Login to get authentication token
    console.log('🔐 Step 1: Logging in...');
    const loginResponse = await axios.post(`${API_BASE_URL}/auth/login`, {
      email: "admin@nvccz.co.zw",
      password: "admin123"
    });

    if (!loginResponse.data.success) {
      throw new Error('Login failed');
    }

    const token = loginResponse.data.data?.token || loginResponse.data.token;
    console.log('✅ Login successful!\n');

    // Step 2: Fetch all term sheets
    console.log('📋 Step 2: Fetching all term sheets...');
    const termSheetsResponse = await axios.get(`${API_BASE_URL}/term-sheets`, {
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      params: {
        page: 1,
        limit: 10
      }
    });

    console.log('✅ Response received!\n');
    console.log('📊 Response Structure:');
    console.log(JSON.stringify(termSheetsResponse.data, null, 2));

    // Step 3: Verify response format
    console.log('\n🔍 Step 3: Verifying response format...\n');
    
    if (!termSheetsResponse.data.success) {
      throw new Error('Response success flag is false');
    }

    const data = termSheetsResponse.data.data;
    
    if (!data.termSheets) {
      throw new Error('termSheets array is missing');
    }

    console.log(`✅ Found ${data.termSheets.length} term sheet(s)\n`);

    // Step 4: Verify each term sheet has required fields
    if (data.termSheets.length > 0) {
      console.log('📝 Verifying required fields in first term sheet:\n');
      const firstTermSheet = data.termSheets[0];
      
      const requiredFields = [
        'id',
        'applicationId',
        'title',
        'investmentAmount',
        'equityAmount',
        'valuation',
        'status',
        'isDraft',
        'isFinal',
        'isSigned',
        'createdAt',
        'updatedAt'
      ];

      const missingFields = [];
      const presentFields = [];

      requiredFields.forEach(field => {
        if (firstTermSheet.hasOwnProperty(field)) {
          presentFields.push(field);
          console.log(`  ✅ ${field}: ${JSON.stringify(firstTermSheet[field])}`);
        } else {
          missingFields.push(field);
          console.log(`  ❌ ${field}: MISSING`);
        }
      });

      console.log('\n📊 Field Summary:');
      console.log(`  ✅ Present: ${presentFields.length}/${requiredFields.length}`);
      console.log(`  ❌ Missing: ${missingFields.length}/${requiredFields.length}`);

      if (missingFields.length > 0) {
        console.log(`\n⚠️  Missing fields: ${missingFields.join(', ')}`);
      } else {
        console.log('\n✅ All required fields are present!');
      }

      // Check application and createdBy
      console.log('\n📋 Related Data:');
      if (firstTermSheet.application) {
        console.log('  ✅ application object present');
        console.log(`     - businessName: ${firstTermSheet.application.businessName}`);
        console.log(`     - applicantName: ${firstTermSheet.application.applicantName}`);
      } else {
        console.log('  ⚠️  application object missing');
      }

      if (firstTermSheet.createdBy) {
        console.log('  ✅ createdBy object present');
        console.log(`     - name: ${firstTermSheet.createdBy.firstName} ${firstTermSheet.createdBy.lastName}`);
        console.log(`     - email: ${firstTermSheet.createdBy.email}`);
      } else {
        console.log('  ⚠️  createdBy object missing');
      }

      // Verify new required fields
      console.log('\n💰 Financial Fields:');
      console.log(`  - investmentAmount: ${firstTermSheet.investmentAmount}`);
      console.log(`  - equityAmount: ${firstTermSheet.equityAmount} ${firstTermSheet.equityAmount ? '✅' : '❌ MISSING'}`);
      console.log(`  - valuation: ${firstTermSheet.valuation} ${firstTermSheet.valuation ? '✅' : '❌ MISSING'}`);

      if (!firstTermSheet.equityAmount) {
        console.log('\n⚠️  WARNING: equityAmount is missing or null!');
      }
      if (!firstTermSheet.valuation) {
        console.log('\n⚠️  WARNING: valuation is missing or null!');
      }
    } else {
      console.log('ℹ️  No term sheets found to verify');
    }

    console.log('\n✅ Test completed successfully!');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testTermSheetsResponse();

