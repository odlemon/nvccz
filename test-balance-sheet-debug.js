const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testBalanceSheetDebug() {
  let token = '';

  console.log('Testing Balance Sheet with and without currency filter...\n');

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

  const today = new Date();
  const asOfDate = today.toISOString().split('T')[0];

  // Test 1: Balance Sheet WITH currency filter
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST 1: Balance Sheet WITH currency filter');
  console.log('═══════════════════════════════════════════════════════════\n');
  try {
    const bsRes1 = await axios.get(
      `${BASE_URL}/api/accounting/balance-sheet`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          asOfDate: asOfDate,
          currencyId: currencyId
        },
        timeout: 60000
      }
    );

    const bs1 = bsRes1.data.data || bsRes1.data;
    console.log(`   Total Assets: ${parseFloat(bs1.assets?.totalAssets || 0).toFixed(2)}`);
    console.log(`   Total Liabilities: ${parseFloat(bs1.liabilities?.totalLiabilities || 0).toFixed(2)}`);
    console.log(`   Total Equity: ${(parseFloat(bs1.equity?.total || 0) + parseFloat(bs1.equity?.retainedEarnings || 0)).toFixed(2)}`);
    console.log(`   Cash: ${parseFloat(bs1.assets?.cashAndCashEquivalents || 0).toFixed(2)}\n`);
  } catch (error) {
    console.error('   ❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
    }
  }

  // Test 2: Balance Sheet WITHOUT currency filter
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST 2: Balance Sheet WITHOUT currency filter');
  console.log('═══════════════════════════════════════════════════════════\n');
  try {
    const bsRes2 = await axios.get(
      `${BASE_URL}/api/accounting/balance-sheet`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          asOfDate: asOfDate
        },
        timeout: 60000
      }
    );

    const bs2 = bsRes2.data.data || bsRes2.data;
    console.log(`   Total Assets: ${parseFloat(bs2.assets?.totalAssets || 0).toFixed(2)}`);
    console.log(`   Total Liabilities: ${parseFloat(bs2.liabilities?.totalLiabilities || 0).toFixed(2)}`);
    console.log(`   Total Equity: ${(parseFloat(bs2.equity?.total || 0) + parseFloat(bs2.equity?.retainedEarnings || 0)).toFixed(2)}`);
    console.log(`   Cash: ${parseFloat(bs2.assets?.cashAndCashEquivalents || 0).toFixed(2)}\n`);
  } catch (error) {
    console.error('   ❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
    }
  }

  // Test 3: Check liability accounts individually
  console.log('═══════════════════════════════════════════════════════════');
  console.log('TEST 3: Checking individual liability accounts');
  console.log('═══════════════════════════════════════════════════════════\n');
  try {
    const bsRes = await axios.get(
      `${BASE_URL}/api/accounting/balance-sheet`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          asOfDate: asOfDate,
          currencyId: currencyId
        },
        timeout: 60000
      }
    );

    const bs = bsRes.data.data || bsRes.data;
    const currentLiabilities = bs.liabilities?.currentLiabilities?.accounts || [];
    const longTermLiabilities = bs.liabilities?.longTermLiabilities?.accounts || [];
    
    console.log(`Current Liabilities (${currentLiabilities.length} accounts):`);
    currentLiabilities.forEach(acc => {
      console.log(`   ${acc.accountNo} - ${acc.accountName}: ${acc.balance.toFixed(2)}`);
    });
    
    console.log(`\nLong-Term Liabilities (${longTermLiabilities.length} accounts):`);
    longTermLiabilities.forEach(acc => {
      console.log(`   ${acc.accountNo} - ${acc.accountName}: ${acc.balance.toFixed(2)}`);
    });
    console.log('');
  } catch (error) {
    console.error('   ❌ Error:', error.message);
  }
}

testBalanceSheetDebug();

