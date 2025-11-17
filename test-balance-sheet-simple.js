const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function testBalanceSheet() {
  try {
    console.log('🔍 Testing Balance Sheet API\n');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Call balance sheet for today (2025-11-17)
    const asOfDate = '2025-11-17';
    console.log(`Calling balance sheet API for date: ${asOfDate}\n`);

    const response = await axios.get(`${BASE_URL}/api/accounting/balance-sheet`, {
      params: {
        asOfDate: asOfDate
      }
    });

    const balanceSheet = response.data;

    console.log('✅ Balance Sheet Retrieved\n');
    console.log(`Fixed Assets:`);
    console.log(`  Total: $${balanceSheet.assets.fixedAssets.total.toFixed(2)}`);
    console.log(`  Number of accounts: ${balanceSheet.assets.fixedAssets.accounts.length}\n`);

    if (balanceSheet.assets.fixedAssets.accounts.length > 0) {
      console.log('Fixed Asset Accounts:');
      balanceSheet.assets.fixedAssets.accounts.forEach(account => {
        console.log(`  - ${account.accountNo} - ${account.accountName}: $${account.balance.toFixed(2)}`);
      });
    } else {
      console.log('❌ No fixed asset accounts found');
    }

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('📋 CHECK YOUR SERVER CONSOLE LOGS');
    console.log('════════════════════════════════════════════════════════════════');
    console.log('Look for these messages:');
    console.log('  - "✅ Retrieved X journal entry line(s)"');
    console.log('  - "📦 Found X asset-related journal entry line(s)"');
    console.log('  - "Fixed Assets (net): $X.XX"');
    console.log('\nIf you see "Retrieved 0 journal entry line(s)", the query is not finding entries.');
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    if (error.response) {
      console.error('❌ API Error:', error.response.status, error.response.data);
    } else if (error.request) {
      console.error('❌ No response from server. Is it running on port 3000?');
    } else {
      console.error('❌ Error:', error.message);
    }
  }
}

testBalanceSheet();

