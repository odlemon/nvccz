const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// Admin credentials
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

let TOKEN = null;

async function login() {
  try {
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });

    if (loginResponse.data.success || loginResponse.data.token) {
      TOKEN = loginResponse.data.token || loginResponse.data.data?.token;
      return true;
    }
    return false;
  } catch (error) {
    console.error('Login error:', error.response?.data || error.message);
    return false;
  }
}

async function testBalanceSheetQuery() {
  try {
    await login();
    if (!TOKEN) {
      console.log('Failed to login');
      return;
    }

    console.log('🔍 Testing Balance Sheet Query\n');
    console.log('Calling balance sheet API to see server logs...\n');

    // Call the balance sheet API - this will trigger server logs
    const balanceSheetResponse = await axios.get(`${BASE_URL}/api/accounting/balance-sheet`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      params: {
        asOfDate: '2025-11-17'
      }
    }).catch(err => {
      console.error('Error:', err.response?.data || err.message);
      if (err.response?.data) {
        console.error('Response:', JSON.stringify(err.response.data, null, 2));
      }
      throw err;
    });

    const balanceSheet = balanceSheetResponse.data.data || balanceSheetResponse.data;
    
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('📊 BALANCE SHEET RESULTS');
    console.log('════════════════════════════════════════════════════════════════\n');
    
    console.log(`Total Fixed Assets: $${balanceSheet.assets?.fixedAssets?.total || 0}`);
    console.log(`Number of Fixed Asset accounts: ${balanceSheet.assets?.fixedAssets?.accounts?.length || 0}\n`);
    
    if (balanceSheet.assets?.fixedAssets?.accounts?.length > 0) {
      console.log('Fixed Asset Accounts:');
      balanceSheet.assets.fixedAssets.accounts.forEach(acc => {
        console.log(`  - ${acc.accountNo} - ${acc.accountName}: $${acc.balance}`);
      });
    } else {
      console.log('❌ No Fixed Asset accounts found');
    }
    
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('📋 CHECK SERVER LOGS');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('Look for these log messages in your server console:');
    console.log('  - "✅ Retrieved X journal entry line(s)"');
    console.log('  - "📊 Calculated balances for X account(s)"');
    console.log('  - "Fixed Assets (net): $X.XX"');
    console.log('\nIf you see "Retrieved 0 journal entry line(s)", the query is not finding the asset entry.');
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

testBalanceSheetQuery();

