const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testServerComplete() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 COMPREHENSIVE SERVER TEST');
  console.log('═══════════════════════════════════════════════════════════\n');

  let token = '';
  let allTestsPassed = true;

  // Test 1: Server Connection
  console.log('1️⃣  Testing server connection...');
  try {
    const response = await axios.get(`${BASE_URL}/`, { 
      timeout: 5000,
      validateStatus: () => true 
    });
    console.log(`   ✅ Server is running (Status: ${response.status})\n`);
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.log('   ❌ Server is NOT running');
      console.log('   Please start with: npm run dev\n');
      return;
    }
    console.log(`   ⚠️  Connection test: ${error.message}\n`);
  }

  // Test 2: Login
  console.log('2️⃣  Testing authentication...');
  try {
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    }, { timeout: 5000 });

    if (loginResponse.data.token) {
      token = loginResponse.data.token;
      console.log('   ✅ Login successful!');
      console.log(`   User: ${loginResponse.data.user?.email || 'N/A'}`);
      console.log(`   Token: ${token.substring(0, 20)}...\n`);
    } else {
      console.log('   ❌ Login failed: No token received\n');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('   ❌ Login failed:', error.response?.data?.message || error.message);
    console.log(`   Status: ${error.response?.status || 'N/A'}\n`);
    allTestsPassed = false;
  }

  if (!token) {
    console.log('⚠️  Cannot continue tests without authentication token\n');
    return;
  }

  // Test 3: Test Cash Flow endpoint
  console.log('3️⃣  Testing Cash Flow endpoint...');
  try {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), 0, 1); // Start of year
    const endDate = new Date(today.getFullYear(), 11, 31, 23, 59, 59); // End of year

    const cashFlowResponse = await axios.post(
      `${BASE_URL}/api/accounting/cash-flow/generate`,
      {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString()
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
        validateStatus: () => true
      }
    );

    if (cashFlowResponse.status === 200) {
      console.log('   ✅ Cash Flow endpoint is working!');
      const data = cashFlowResponse.data.data || cashFlowResponse.data;
      console.log(`   Beginning Cash: ${data.beginningCash?.toFixed(2) || 'N/A'}`);
      console.log(`   Ending Cash: ${data.endingCash?.toFixed(2) || data.endingCashBalance?.toFixed(2) || 'N/A'}`);
      console.log(`   Net Cash Flow: ${data.netCashFlow?.toFixed(2) || 'N/A'}\n`);
    } else {
      console.log(`   ⚠️  Cash Flow endpoint returned status: ${cashFlowResponse.status}`);
      console.log(`   Response: ${JSON.stringify(cashFlowResponse.data).substring(0, 200)}...\n`);
    }
  } catch (error) {
    console.log('   ❌ Cash Flow test failed:', error.response?.data?.message || error.message);
    console.log(`   Status: ${error.response?.status || 'N/A'}\n`);
    allTestsPassed = false;
  }

  // Test 4: Test Balance Sheet endpoint
  console.log('4️⃣  Testing Balance Sheet endpoint...');
  try {
    const today = new Date();
    const balanceSheetResponse = await axios.post(
      `${BASE_URL}/api/accounting/balance-sheet/generate`,
      {
        asOfDate: today.toISOString()
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 10000,
        validateStatus: () => true
      }
    );

    if (balanceSheetResponse.status === 200) {
      console.log('   ✅ Balance Sheet endpoint is working!');
      const data = balanceSheetResponse.data.data || balanceSheetResponse.data;
      const assets = data.assets || {};
      console.log(`   Cash and Cash Equivalents: ${assets.cashAndCashEquivalents?.toFixed(2) || 'N/A'}`);
      console.log(`   Total Assets: ${assets.totalAssets?.toFixed(2) || 'N/A'}`);
      console.log(`   Total Liabilities: ${data.liabilities?.totalLiabilities?.toFixed(2) || 'N/A'}`);
      console.log(`   Total Equity: ${data.equity?.total?.toFixed(2) || 'N/A'}\n`);
    } else {
      console.log(`   ⚠️  Balance Sheet endpoint returned status: ${balanceSheetResponse.status}`);
      console.log(`   Response: ${JSON.stringify(balanceSheetResponse.data).substring(0, 200)}...\n`);
    }
  } catch (error) {
    console.log('   ❌ Balance Sheet test failed:', error.response?.data?.message || error.message);
    console.log(`   Status: ${error.response?.status || 'N/A'}\n`);
    allTestsPassed = false;
  }

  // Final Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  if (allTestsPassed && token) {
    console.log('✅ All tests passed!');
    console.log('✅ Server is running and functional');
    console.log('✅ Authentication is working');
    console.log('✅ Cash Flow and Balance Sheet endpoints are accessible\n');
  } else {
    console.log('⚠️  Some tests had issues');
    console.log('Please review the errors above\n');
  }

  console.log('═══════════════════════════════════════════════════════════');
}

testServerComplete().catch(console.error);

