// Test script to verify the fixed Contra Entry endpoint
const axios = require('axios');

const API_BASE_URL = 'https://nvccz-pi.vercel.app'; // Your Vercel URL
const authToken = "YOUR_JWT_TOKEN_HERE"; // Replace with your token

// Test data for creating a contra entry configuration
const testContraEntryData = {
  "entryType": "RECEIPT",
  "glAccountId": "cmh3c1dq80000unxkthh69y9g", // Cash and Cash Equivalents
  "contraType": "DETAILED",
  "isEnabled": true
};

async function testContraEntryEndpoint() {
  console.log('🧪 Testing POST /api/cashbook/contra/configure endpoint...\n');
  
  try {
    // Test POST request to configure contra entry
    console.log('📤 Sending POST request to configure contra entry...');
    console.log('Test data:', JSON.stringify(testContraEntryData, null, 2));
    
    const postResponse = await axios.post(`${API_BASE_URL}/api/cashbook/contra/configure`, testContraEntryData, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ POST request successful!');
    console.log('Status:', postResponse.status);
    console.log('Response:', JSON.stringify(postResponse.data, null, 2));
    
    // Test GET request to retrieve configurations
    console.log('\n📥 Testing GET request to retrieve contra entry configurations...');
    const getResponse = await axios.get(`${API_BASE_URL}/api/cashbook/contra/configs`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ GET request successful!');
    console.log('Status:', getResponse.status);
    console.log('Response:', JSON.stringify(getResponse.data, null, 2));
    
  } catch (error) {
    console.error('❌ Test failed!');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.data?.message?.includes('res.status is not a function')) {
        console.error('\n🚨 Still getting "res.status is not a function" error!');
        console.error('The fix may not have been deployed yet. Please redeploy your application.');
      }
    } else if (error.request) {
      console.error('No response received:', error.message);
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Instructions
console.log('📋 INSTRUCTIONS:');
console.log('1. Make sure your application is deployed with the ResponseHelper fix');
console.log('2. Replace "YOUR_JWT_TOKEN_HERE" with a valid JWT token');
console.log('3. Run: node test-contra-entry.js');
console.log('');

// Run the test
testContraEntryEndpoint();
