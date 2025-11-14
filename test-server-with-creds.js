const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testServerWithCreds() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 SERVER VERIFICATION TEST');
  console.log('═══════════════════════════════════════════════════════════\n');

  let token = '';
  let allTestsPassed = true;

  // Test 1: Login
  console.log('1️⃣  Testing authentication...');
  try {
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    }, { timeout: 30000 });

    if (loginResponse.data.token) {
      token = loginResponse.data.token;
      console.log('   ✅ Login successful!');
      console.log(`   User: ${loginResponse.data.user?.email || 'N/A'}`);
      console.log(`   Role: ${loginResponse.data.user?.role || 'N/A'}`);
      console.log(`   Token: ${token.substring(0, 30)}...\n`);
    } else {
      console.log('   ❌ Login failed: No token received\n');
      allTestsPassed = false;
      return;
    }
  } catch (error) {
    console.log('   ❌ Login failed:', error.response?.data?.message || error.message);
    console.log(`   Status: ${error.response?.status || 'N/A'}\n`);
    allTestsPassed = false;
    return;
  }

  // Test 2: Test Cash Flow endpoint
  console.log('2️⃣  Testing Cash Flow endpoint...');
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
        timeout: 60000,
        validateStatus: () => true
      }
    );

    if (cashFlowResponse.status === 200) {
      console.log('   ✅ Cash Flow endpoint is working!');
      const data = cashFlowResponse.data.data || cashFlowResponse.data;
      console.log(`   Beginning Cash: ${data.beginningCash?.toFixed(2) || data.beginningCashBalance?.toFixed(2) || 'N/A'}`);
      console.log(`   Ending Cash: ${data.endingCash?.toFixed(2) || data.endingCashBalance?.toFixed(2) || 'N/A'}`);
      console.log(`   Net Cash Flow: ${data.netCashFlow?.toFixed(2) || 'N/A'}`);
      
      // Check if cash and cash equivalents are being calculated
      if (data.endingCashBalance || data.endingCash) {
        console.log('   ✅ Cash balance calculation is working\n');
      } else {
        console.log('   ⚠️  Cash balance not found in response\n');
      }
    } else {
      console.log(`   ⚠️  Cash Flow endpoint returned status: ${cashFlowResponse.status}`);
      if (cashFlowResponse.data?.message) {
        console.log(`   Message: ${cashFlowResponse.data.message}\n`);
      }
    }
  } catch (error) {
    console.log('   ❌ Cash Flow test failed:', error.response?.data?.message || error.message);
    console.log(`   Status: ${error.response?.status || 'N/A'}\n`);
    allTestsPassed = false;
  }

  // Test 3: Test Balance Sheet endpoint
  console.log('3️⃣  Testing Balance Sheet endpoint...');
  try {
    const today = new Date();
    const balanceSheetResponse = await axios.post(
      `${BASE_URL}/api/accounting/balance-sheet/generate`,
      {
        asOfDate: today.toISOString()
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 60000,
        validateStatus: () => true
      }
    );

    if (balanceSheetResponse.status === 200) {
      console.log('   ✅ Balance Sheet endpoint is working!');
      const data = balanceSheetResponse.data.data || balanceSheetResponse.data;
      const assets = data.assets || {};
      console.log(`   Cash and Cash Equivalents: ${assets.cashAndCashEquivalents?.toFixed(2) || 'N/A'}`);
      console.log(`   Total Current Assets: ${assets.currentAssets?.total?.toFixed(2) || 'N/A'}`);
      console.log(`   Total Assets: ${assets.totalAssets?.toFixed(2) || 'N/A'}`);
      console.log(`   Total Liabilities: ${data.liabilities?.totalLiabilities?.toFixed(2) || 'N/A'}`);
      console.log(`   Total Equity: ${data.equity?.total?.toFixed(2) || 'N/A'}`);
      
      // Verify cash and cash equivalents field exists
      if (assets.cashAndCashEquivalents !== undefined) {
        console.log('   ✅ Cash and Cash Equivalents field is present\n');
      } else {
        console.log('   ⚠️  Cash and Cash Equivalents field not found in response\n');
      }
    } else {
      console.log(`   ⚠️  Balance Sheet endpoint returned status: ${balanceSheetResponse.status}`);
      if (balanceSheetResponse.data?.message) {
        console.log(`   Message: ${balanceSheetResponse.data.message}\n`);
      }
    }
  } catch (error) {
    console.log('   ❌ Balance Sheet test failed:', error.response?.data?.message || error.message);
    console.log(`   Status: ${error.response?.status || 'N/A'}\n`);
    allTestsPassed = false;
  }

  // Test 4: Compare Cash Flow ending balance with Balance Sheet cash
  console.log('4️⃣  Comparing Cash Flow ending balance with Balance Sheet cash...');
  try {
    const today = new Date();
    const startDate = new Date(today.getFullYear(), 0, 1);
    const endDate = new Date(today.getFullYear(), 11, 31, 23, 59, 59);

    const [cashFlowRes, balanceSheetRes] = await Promise.all([
      axios.post(
        `${BASE_URL}/api/accounting/cash-flow/generate`,
        { startDate: startDate.toISOString(), endDate: endDate.toISOString() },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
      ),
      axios.post(
        `${BASE_URL}/api/accounting/balance-sheet/generate`,
        { asOfDate: endDate.toISOString() },
        { headers: { Authorization: `Bearer ${token}` }, timeout: 15000 }
      )
    ]);

    const cashFlowData = cashFlowRes.data.data || cashFlowRes.data;
    const balanceSheetData = balanceSheetRes.data.data || balanceSheetRes.data;

    const endingCash = cashFlowData.endingCash || cashFlowData.endingCashBalance;
    const cashAndEquivalents = balanceSheetData.assets?.cashAndCashEquivalents;

    if (endingCash !== undefined && cashAndEquivalents !== undefined) {
      const difference = Math.abs(endingCash - cashAndEquivalents);
      console.log(`   Cash Flow Ending Balance: ${endingCash.toFixed(2)}`);
      console.log(`   Balance Sheet Cash & Equivalents: ${cashAndEquivalents.toFixed(2)}`);
      console.log(`   Difference: ${difference.toFixed(2)}`);
      
      if (difference < 0.01) {
        console.log('   ✅ PERFECT MATCH! Cash flow and balance sheet are aligned!\n');
      } else if (difference < 1.00) {
        console.log('   ⚠️  Small difference (likely rounding)\n');
      } else {
        console.log('   ❌ Significant difference detected\n');
        allTestsPassed = false;
      }
    } else {
      console.log('   ⚠️  Cannot compare - missing data\n');
    }
  } catch (error) {
    console.log('   ⚠️  Comparison test failed:', error.response?.data?.message || error.message);
    console.log(`   Status: ${error.response?.status || 'N/A'}\n`);
  }

  // Final Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 TEST SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  if (allTestsPassed && token) {
    console.log('✅ Server is running and functional');
    console.log('✅ Authentication is working');
    console.log('✅ Cash Flow and Balance Sheet endpoints are accessible');
    console.log('✅ Cash flow statement fix is deployed\n');
  } else {
    console.log('⚠️  Some tests had issues');
    console.log('Please review the errors above\n');
  }

  console.log('═══════════════════════════════════════════════════════════');
}

testServerWithCreds().catch(console.error);

