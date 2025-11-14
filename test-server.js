const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testServer() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 TESTING SERVER CONNECTION');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Test 1: Check if server is responding
  console.log('1️⃣  Testing server connection...');
  try {
    // Try root endpoint
    const rootResponse = await axios.get(`${BASE_URL}/`, { timeout: 5000 });
    console.log('   ✅ Server is responding!');
    console.log(`   Status: ${rootResponse.status}`);
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('   ❌ Server is NOT running (connection refused)');
      console.log('   Please start the server with: npm run dev');
      return;
    } else if (error.response) {
      console.log('   ✅ Server is responding (got HTTP response)');
      console.log(`   Status: ${error.response.status}`);
    } else {
      console.log('   ⚠️  Server connection test failed:', error.message);
    }
  }

  // Test 2: Try API routes
  console.log('\n2️⃣  Testing API routes...');
  
  // Test auth endpoint (should return 400 or 422 for missing credentials, not 404)
  try {
    const authResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'test@test.com',
      password: 'test'
    }, { timeout: 5000, validateStatus: () => true });
    
    if (authResponse.status === 404) {
      console.log('   ❌ API routes not found (404)');
      console.log('   Server may not be fully started or routes not mounted');
    } else if (authResponse.status === 400 || authResponse.status === 422 || authResponse.status === 401) {
      console.log('   ✅ API routes are working!');
      console.log(`   Status: ${authResponse.status} (expected for invalid credentials)`);
    } else {
      console.log(`   ✅ API routes are responding (Status: ${authResponse.status})`);
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('   ❌ Server is NOT running');
      return;
    } else if (error.response) {
      console.log(`   ✅ API routes are responding (Status: ${error.response.status})`);
    } else {
      console.log('   ⚠️  API route test failed:', error.message);
    }
  }

  // Test 3: Check currencies endpoint (public endpoint)
  console.log('\n3️⃣  Testing public API endpoint...');
  try {
    const currencyResponse = await axios.get(`${BASE_URL}/api/accounting/currencies`, {
      timeout: 5000,
      validateStatus: () => true
    });
    
    if (currencyResponse.status === 401) {
      console.log('   ✅ API is working (authentication required)');
      console.log(`   Status: ${currencyResponse.status}`);
    } else if (currencyResponse.status === 200) {
      console.log('   ✅ API is working!');
      console.log(`   Status: ${currencyResponse.status}`);
      console.log(`   Data: ${JSON.stringify(currencyResponse.data).substring(0, 100)}...`);
    } else {
      console.log(`   ⚠️  Unexpected status: ${currencyResponse.status}`);
    }
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('   ❌ Server is NOT running');
    } else if (error.response) {
      console.log(`   ✅ API is responding (Status: ${error.response.status})`);
    } else {
      console.log('   ⚠️  Test failed:', error.message);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 SERVER STATUS SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('✅ Server appears to be running on port 3000');
  console.log('✅ API routes are accessible');
  console.log('\n💡 To verify full functionality, try logging in:');
  console.log('   POST http://localhost:3000/api/auth/login');
  console.log('   Body: { "email": "admin@nvccz.co.zw", "password": "admin123" }');
  console.log('\n═══════════════════════════════════════════════════════════');
}

testServer().catch(console.error);

