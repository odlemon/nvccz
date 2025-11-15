const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testCashBalanceDebug() {
  let token = '';

  console.log('Testing Cash Balance Calculation...\n');

  // Login
  try {
    const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    token = loginRes.data.token;
    console.log('✅ Login successful\n');
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    return;
  }

  // Get currencies
  let currencyId = null;
  try {
    const currenciesRes = await axios.get(`${BASE_URL}/api/accounting/currencies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const currencies = currenciesRes.data.data || [];
    if (currencies.length > 0) {
      const defaultCurrency = currencies.find(c => c.isDefault) || currencies[0];
      currencyId = defaultCurrency.id;
      console.log(`💱 Using currency: ${defaultCurrency.code} (ID: ${currencyId})\n`);
    }
  } catch (error) {
    console.error('⚠️  Could not get currencies:', error.message);
    return;
  }

  const yearStart = new Date('2025-01-01');
  const yearEnd = new Date('2025-12-31');

  console.log(`📅 Testing Cash Flow for period: ${yearStart.toISOString().split('T')[0]} to ${yearEnd.toISOString().split('T')[0]}\n`);

  // Test Cash Flow
  try {
    console.log('Calling Cash Flow endpoint...\n');
    const cashFlowRes = await axios.post(
      `${BASE_URL}/api/accounting/cash-flow/generate`,
      {
        startDate: yearStart.toISOString().split('T')[0],
        endDate: yearEnd.toISOString().split('T')[0],
        currencyId: currencyId
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 60000
      }
    );

    const cashFlow = cashFlowRes.data.data || cashFlowRes.data;
    
    console.log('✅ Cash Flow Response:');
    console.log('   Beginning Cash:', cashFlow.beginningCash);
    console.log('   Ending Cash:', cashFlow.endingCash);
    console.log('   Net Cash Flow:', cashFlow.netCashFlow);
    console.log('   Currency:', cashFlow.currency?.code || 'N/A');
    console.log('\n   Full response keys:', Object.keys(cashFlow));
    
    if (cashFlow.operatingActivities) {
      console.log('\n   Operating Activities Total:', cashFlow.operatingActivities.total);
    }
    if (cashFlow.investingActivities) {
      console.log('   Investing Activities Total:', cashFlow.investingActivities.total);
    }
    if (cashFlow.financingActivities) {
      console.log('   Financing Activities Total:', cashFlow.financingActivities.total);
    }

  } catch (error) {
    console.error('\n❌ Cash Flow Error:');
    console.error('   Message:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.code) {
      console.error('   Code:', error.code);
    }
  }
}

testCashBalanceDebug();

