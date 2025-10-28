// Test script to verify the fixed /api/cashbook/transfers/summary endpoint
const axios = require('axios');

const API_BASE_URL = 'https://nvccz-pi.vercel.app'; // Your Vercel URL
const authToken = "YOUR_JWT_TOKEN_HERE"; // Replace with your token

async function testTransferSummaryEndpoint() {
  console.log('🧪 Testing GET /api/cashbook/transfers/summary endpoint...\n');
  
  try {
    // Test the summary endpoint
    console.log('📊 Testing transfer summary endpoint...');
    const summaryResponse = await axios.get(`${API_BASE_URL}/api/cashbook/transfers/summary`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ Summary endpoint successful!');
    console.log('Status:', summaryResponse.status);
    console.log('Response:', JSON.stringify(summaryResponse.data, null, 2));
    
    // Also test the list endpoint to compare
    console.log('\n📋 Testing transfer list endpoint for comparison...');
    const listResponse = await axios.get(`${API_BASE_URL}/api/cashbook/transfers`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log('✅ List endpoint successful!');
    console.log('Status:', listResponse.status);
    console.log('Total transfers found:', listResponse.data.data?.transfers?.length || 0);
    
    // Verify the summary matches the list
    if (summaryResponse.data.success && listResponse.data.success) {
      const summaryTotal = summaryResponse.data.data?.totalTransfers || 0;
      const listTotal = listResponse.data.data?.transfers?.length || 0;
      
      console.log('\n🔍 Verification:');
      console.log(`Summary reports ${summaryTotal} transfers`);
      console.log(`List shows ${listTotal} transfers`);
      
      if (summaryTotal === listTotal) {
        console.log('✅ Summary and list counts match!');
      } else {
        console.log('⚠️ Summary and list counts differ - this might be expected if there are date filters');
      }
    }
    
  } catch (error) {
    console.error('❌ Test failed!');
    
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.data?.message?.includes('Transfer not found')) {
        console.error('\n🚨 Still getting "Transfer not found" error!');
        console.error('This means the route ordering fix may not have been deployed yet.');
        console.error('Please redeploy your application.');
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
console.log('1. Make sure your application is deployed with the route fix');
console.log('2. Replace "YOUR_JWT_TOKEN_HERE" with a valid JWT token');
console.log('3. Run: node test-transfer-summary.js');
console.log('');

// Run the test
testTransferSummaryEndpoint();
