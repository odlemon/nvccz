const axios = require('axios');

// Configuration
const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api`;

// Test credentials - adjust these to your test user
const TEST_EMAIL = process.env.TEST_EMAIL || 'admin@nvccz.co.zw';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'admin123';

let authToken = null;

async function login() {
  try {
    console.log('🔐 Logging in...');
    console.log(`   Email: ${TEST_EMAIL}`);
    const response = await axios.post(`${API_BASE}/auth/login`, {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    
    authToken = response.data.token;
    console.log('✅ Login successful');
    return authToken;
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('❌ Connection refused - Is the server running?');
      console.error('   Make sure the server is running on:', BASE_URL);
    } else if (error.response) {
      console.error('❌ Login failed:', error.response.status, error.response.data);
    } else {
      console.error('❌ Login failed:', error.message);
    }
    throw error;
  }
}

async function testGetFunds() {
  try {
    console.log('\n📊 Testing GET /api/funds...');
    
    const response = await axios.get(`${API_BASE}/funds`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      params: {
        page: 1,
        limit: 10
      }
    });
    
    console.log('✅ Response Status:', response.status);
    console.log('✅ Response Data:', JSON.stringify(response.data, null, 2));
    
    if (response.data.success) {
      console.log(`\n✅ Success! Found ${response.data.data.total} fund(s)`);
      console.log(`📄 Page ${response.data.data.page} of ${response.data.data.totalPages}`);
      console.log(`📋 Funds returned: ${response.data.data.funds.length}`);
      
      if (response.data.data.funds.length > 0) {
        console.log('\n📋 Sample Fund Data:');
        const firstFund = response.data.data.funds[0];
        console.log(`   - ID: ${firstFund.id}`);
        console.log(`   - Name: ${firstFund.name}`);
        console.log(`   - Status: ${firstFund.status}`);
        console.log(`   - Total Amount: ${firstFund.totalAmount}`);
        console.log(`   - Remaining Amount: ${firstFund.remainingAmount}`);
      }
    } else {
      console.log('⚠️ Request succeeded but success flag is false');
    }
    
    return response.data;
  } catch (error) {
    console.error('❌ Error testing GET /api/funds:', error.response?.data || error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

async function testGetFundsWithFilters() {
  try {
    console.log('\n🔍 Testing GET /api/funds with filters...');
    
    // Test with status filter
    console.log('\n   Testing with status=OPEN filter...');
    const response = await axios.get(`${API_BASE}/funds`, {
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      params: {
        page: 1,
        limit: 10,
        status: 'OPEN'
      }
    });
    
    console.log('✅ Filtered Response:', JSON.stringify(response.data, null, 2));
    
    return response.data;
  } catch (error) {
    console.error('❌ Error testing filtered GET /api/funds:', error.response?.data || error.message);
    throw error;
  }
}

async function runTests() {
  try {
    console.log('🚀 Starting Funds Endpoint Tests\n');
    console.log(`📍 Base URL: ${BASE_URL}`);
    
    // Login first
    await login();
    
    // Test basic GET
    await testGetFunds();
    
    // Test with filters
    await testGetFundsWithFilters();
    
    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Tests failed:', error.message);
    process.exit(1);
  }
}

// Run tests
runTests();

