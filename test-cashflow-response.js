const axios = require('axios');

async function testCashFlowResponse() {
  try {
    console.log('🧪 Testing Cash Flow Response Structure...\n');

    const baseURL = 'http://localhost:3000';
    
    // Login
    console.log('1️⃣ Logging in...');
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });

    const token = loginResponse.data.token;
    console.log('✅ Logged in successfully\n');

    // Test cash flow for November 2025
    console.log('2️⃣ Fetching Cash Flow Statement...');
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
    
    console.log('\n📊 Response Structure Check:');
    console.log(`\nOperating Activities:`);
    console.log(`  Has total: ${cashFlow.operatingActivities?.total !== undefined}`);
    console.log(`  Has accountCount: ${cashFlow.operatingActivities?.accountCount !== undefined}`);
    console.log(`  Has description: ${cashFlow.operatingActivities?.description !== undefined}`);
    console.log(`  Has lineItems: ${cashFlow.operatingActivities?.lineItems !== undefined}`);
    if (cashFlow.operatingActivities?.lineItems) {
      console.log(`  LineItems count: ${cashFlow.operatingActivities.lineItems.length}`);
      if (cashFlow.operatingActivities.lineItems.length > 0) {
        console.log(`  First lineItem has transactions: ${cashFlow.operatingActivities.lineItems[0]?.transactions !== undefined}`);
        if (cashFlow.operatingActivities.lineItems[0]?.transactions) {
          console.log(`  First lineItem transactions count: ${cashFlow.operatingActivities.lineItems[0].transactions.length}`);
        }
      }
    }

    console.log(`\nInvesting Activities:`);
    console.log(`  Has total: ${cashFlow.investingActivities?.total !== undefined}`);
    console.log(`  Has accountCount: ${cashFlow.investingActivities?.accountCount !== undefined}`);
    console.log(`  Has description: ${cashFlow.investingActivities?.description !== undefined}`);
    console.log(`  Has lineItems: ${cashFlow.investingActivities?.lineItems !== undefined}`);
    if (cashFlow.investingActivities?.lineItems) {
      console.log(`  LineItems count: ${cashFlow.investingActivities.lineItems.length}`);
      if (cashFlow.investingActivities.lineItems.length > 0) {
        const firstItem = cashFlow.investingActivities.lineItems[0];
        console.log(`  First lineItem:`);
        console.log(`    Account: ${firstItem.accountNo} - ${firstItem.accountName}`);
        console.log(`    Amount: $${firstItem.amount}`);
        console.log(`    Has transactions: ${firstItem.transactions !== undefined}`);
        if (firstItem.transactions && firstItem.transactions.length > 0) {
          console.log(`    Transactions count: ${firstItem.transactions.length}`);
          console.log(`    First transaction:`);
          console.log(`      Reference: ${firstItem.transactions[0].reference}`);
          console.log(`      Description: ${firstItem.transactions[0].description}`);
          console.log(`      Source: ${firstItem.transactions[0].source}`);
        }
      }
    }

    console.log('\n✅ Test completed!\n');

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

testCashFlowResponse();

