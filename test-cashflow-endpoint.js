const axios = require('axios');

async function testCashFlow() {
  try {
    console.log('🧪 Testing Cash Flow Statement Endpoint...\n');

    const baseURL = 'http://localhost:3000';
    
    // First, login to get token
    console.log('1️⃣ Logging in...');
    const loginResponse = await axios.post(`${baseURL}/api/auth/login`, {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });

    const token = loginResponse.data.data.token;
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

    if (cashFlow.investingActivities.accountCount > 0) {
      console.log('📋 Investing Activities Accounts:');
      cashFlow.investingActivities.accounts.forEach((acc, index) => {
        console.log(`\n   ${index + 1}. ${acc.accountNo} - ${acc.accountName}`);
        console.log(`      Type: ${acc.accountType}`);
        console.log(`      Category: ${acc.cashFlowCategory}`);
        console.log(`      Net Amount: $${acc.netAmount.toFixed(2)}`);
        console.log(`      Total Debits: $${acc.totalDebits.toFixed(2)}`);
        console.log(`      Total Credits: $${acc.totalCredits.toFixed(2)}`);
        if (acc.transactions && acc.transactions.length > 0) {
          console.log(`      Transactions: ${acc.transactions.length}`);
          acc.transactions.slice(0, 3).forEach(tx => {
            console.log(`         - ${tx.reference}: $${tx.debitAmount || 0} / $${tx.creditAmount || 0}`);
          });
        }
      });
    } else {
      console.log('⚠️  No investing accounts found!\n');
    }

    // Get detailed cash flow
    console.log('\n3️⃣ Fetching Detailed Cash Flow Statement...');
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
    
    console.log('\n📊 Detailed Investing Activities:');
    if (detailed.investingActivities && detailed.investingActivities.accounts) {
      detailed.investingActivities.accounts.forEach((acc, index) => {
        console.log(`\n   ${index + 1}. ${acc.accountNo} - ${acc.accountName}`);
        console.log(`      Net Amount: $${acc.netAmount.toFixed(2)}`);
        if (acc.accountType === 'Asset' || acc.accountType === 'Non-Current Asset') {
          console.log(`      Expected Cash Flow Impact: -$${acc.netAmount.toFixed(2)} (outflow)`);
        }
      });
      console.log(`\n   Total: $${detailed.investingActivities.total.toFixed(2)}`);
    }

  } catch (error) {
    if (error.response) {
      console.error('❌ API Error:', error.response.status, error.response.data);
    } else {
      console.error('❌ Error:', error.message);
    }
    process.exit(1);
  }
}

testCashFlow();

