const axios = require('axios');

async function testCashFlowAPI() {
  try {
    console.log('🧪 Testing Cash Flow Statement API...\n');

    const baseURL = 'http://localhost:3000';
    
    // Login
    console.log('1️⃣ Logging in...');
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });

    if (!loginResponse.data || !loginResponse.data.token) {
      console.error('❌ Login failed - unexpected response structure');
      console.error(JSON.stringify(loginResponse.data, null, 2));
      process.exit(1);
    }

    const token = loginResponse.data.token;
    console.log('✅ Logged in successfully\n');

    // Test cash flow for November 2025
    console.log('2️⃣ Fetching Cash Flow Statement for November 2025...');
    const cashFlowResponse = await axios.post(
      `${baseURL}/api/accounting/cash-flow/generate`,
      {
        startDate: '2025-11-01',
        endDate: '2025-11-30',
        currencyId: 'cmh3bymy70000una4yk8leusu'
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const cashFlow = cashFlowResponse.data.data;
    
    console.log('\n📊 Cash Flow Statement Summary:');
    console.log(`   Operating Activities: $${cashFlow.operatingActivities.total.toFixed(2)} (${cashFlow.operatingActivities.accountCount} accounts)`);
    console.log(`   Investing Activities: $${cashFlow.investingActivities.total.toFixed(2)} (${cashFlow.investingActivities.accountCount} accounts)`);
    console.log(`   Financing Activities: $${cashFlow.financingActivities.total.toFixed(2)} (${cashFlow.financingActivities.accountCount} accounts)`);
    console.log(`   Net Cash Flow: $${cashFlow.netCashFlow.toFixed(2)}\n`);

    // Check if investing activities includes the $40,000 disbursement
    if (cashFlow.investingActivities.total === 0) {
      console.log('❌ INVESTING ACTIVITIES IS STILL $0 - FIX NOT WORKING!\n');
      process.exit(1);
    } else if (cashFlow.investingActivities.total < 0) {
      console.log(`✅ Investing Activities shows cash outflow: $${cashFlow.investingActivities.total.toFixed(2)}`);
      console.log(`   This should include the $40,000 fund disbursement (and $20,000 from Nov 17)\n`);
    }

    // Get detailed cash flow to see accounts
    console.log('3️⃣ Fetching Detailed Cash Flow Statement...');
    const detailedResponse = await axios.post(
      `${baseURL}/api/accounting/cash-flow/detailed`,
      {
        startDate: '2025-11-01',
        endDate: '2025-11-30',
        currencyId: 'cmh3bymy70000una4yk8leusu'
      },
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    );

    const detailed = detailedResponse.data.data;
    
    if (detailed.investingActivities && detailed.investingActivities.accounts) {
      console.log('\n📊 Detailed Investing Activities Accounts:');
      detailed.investingActivities.accounts.forEach((acc, index) => {
        console.log(`\n   ${index + 1}. ${acc.accountNo} - ${acc.accountName}`);
        console.log(`      Type: ${acc.accountType}`);
        console.log(`      Net Amount: $${acc.netAmount.toFixed(2)}`);
        if (acc.accountNo === '1501') {
          console.log(`      ✅ This is Portfolio Investments - should show $60,000`);
        }
      });
      console.log(`\n   Total: $${detailed.investingActivities.total.toFixed(2)}`);
    }

    console.log('\n✅ Test completed successfully!\n');

  } catch (error) {
    if (error.response) {
      console.error('❌ API Error:', error.response.status);
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

testCashFlowAPI();

