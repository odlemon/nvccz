// Test script to verify the fixed POST /api/cashbook/transfers endpoint
const axios = require('axios');

const API_BASE_URL = 'http://localhost:3000'; // Adjust if your server runs on different port

// Test data for creating a transfer
const testTransferData = {
  fromBankId: "cmh5u1h3y0001unagy8qtrkng", // Replace with actual bank ID
  toBankId: "cmh5u1h3y0002unagy8qtrkng",   // Replace with actual bank ID
  amount: 1000.00,
  description: "Test transfer between accounts",
  transferDate: "2025-10-28",
  reference: "TEST-TRANSFER-001",
  projectCode: "TEST-PROJECT"
};

// You'll need to replace this with a valid JWT token
const authToken = "YOUR_JWT_TOKEN_HERE";

async function testTransferEndpoint() {
  console.log('🧪 Testing POST /api/cashbook/transfers endpoint...\n');
  
  try {
    // Test POST request
    console.log('📤 Sending POST request to create transfer...');
    const postResponse = await axios.post(`${API_BASE_URL}/api/cashbook/transfers`, testTransferData, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ POST request successful!');
    console.log('Status:', postResponse.status);
    console.log('Response:', JSON.stringify(postResponse.data, null, 2));
    
    // If successful, test GET request to verify
    if (postResponse.data.success && postResponse.data.data?.transferId) {
      console.log('\n📥 Testing GET request to retrieve the created transfer...');
      const getResponse = await axios.get(`${API_BASE_URL}/api/cashbook/transfers/${postResponse.data.data.transferId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ GET request successful!');
      console.log('Status:', getResponse.status);
      console.log('Response:', JSON.stringify(getResponse.data, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Test failed!');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
      
      // Check if it's a CORS error
      if (error.response.data?.message?.includes('CORS')) {
        console.error('\n🚨 CORS Error detected! The fix may not be working properly.');
        console.error('Make sure:');
        console.error('1. Your origin is in the allowed origins list in app.ts');
        console.error('2. The server is running');
        console.error('3. You have a valid JWT token');
      }
    } else if (error.request) {
      console.error('No response received:', error.message);
    } else {
      console.error('Error:', error.message);
    }
  }
}

// Instructions for running the test
console.log('📋 INSTRUCTIONS:');
console.log('1. Make sure your server is running on port 3000');
console.log('2. Replace "YOUR_JWT_TOKEN_HERE" with a valid JWT token');
console.log('3. Replace the bank IDs with actual bank IDs from your database');
console.log('4. Run: node test-cashbook-transfer-fix.js\n');

// Run the test
testTransferEndpoint();
