const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

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

async function checkBalanceSheetCurrencyFilter() {
  try {
    await login();
    if (!TOKEN) {
      console.log('Failed to login');
      return;
    }

    console.log('🔍 Checking Balance Sheet Currency Filter Issue\n');

    // Find the asset
    const assetsResponse = await axios.get(`${BASE_URL}/api/accounting/assets`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    const assetsData = assetsResponse.data.data?.assets || assetsResponse.data.data || assetsResponse.data || [];
    const asset = assetsData.find(a => 
      a.assetName?.toLowerCase().includes('hp') || 
      a.assetName?.toLowerCase().includes('laptop')
    ) || assetsData[0];

    if (!asset) {
      console.log('Asset not found');
      return;
    }

    // Find the journal entry
    const journalEntriesResponse = await axios.get(`${BASE_URL}/api/accounting/journal-entries`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      params: {
        search: `ASSET-${asset.assetCode}`,
        status: 'POSTED'
      }
    });

    const journalEntries = journalEntriesResponse.data?.data || journalEntriesResponse.data || [];
    const assetJournalEntry = journalEntries.find(je => 
      je.referenceNumber?.includes(`ASSET-${asset.assetCode}`)
    );

    if (!assetJournalEntry) {
      console.log('Journal entry not found');
      return;
    }

    console.log(`Journal Entry Currency ID: ${assetJournalEntry.currencyId}\n`);

    // Get all currencies
    const currenciesResponse = await axios.get(`${BASE_URL}/api/accounting/currencies`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    const currencies = currenciesResponse.data.data || currenciesResponse.data || [];
    const journalEntryCurrency = currencies.find(c => c.id === assetJournalEntry.currencyId);
    
    console.log(`Journal Entry Currency: ${journalEntryCurrency?.code || 'Unknown'} (${assetJournalEntry.currencyId})\n`);

    // Test balance sheet WITHOUT currency filter
    console.log('1. Testing Balance Sheet WITHOUT currency filter...');
    const balanceSheetNoCurrency = await axios.get(`${BASE_URL}/api/accounting/balance-sheet`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      params: {
        asOfDate: '2025-11-17'
      }
    });

    const bsNoCurrency = balanceSheetNoCurrency.data.data || balanceSheetNoCurrency.data;
    const fixedAssetsNoCurrency = bsNoCurrency.assets?.fixedAssets?.accounts || [];
    const totalFixedNoCurrency = bsNoCurrency.assets?.fixedAssets?.total || 0;

    console.log(`   Total Fixed Assets: $${totalFixedNoCurrency}`);
    console.log(`   Number of accounts: ${fixedAssetsNoCurrency.length}`);
    
    const assetInBSNoCurrency = fixedAssetsNoCurrency.find(acc => 
      acc.accountNo === '1100' || acc.accountName?.includes('Office Equipment')
    );
    
    if (assetInBSNoCurrency) {
      console.log(`   ✅ Asset account found: ${assetInBSNoCurrency.accountNo} - ${assetInBSNoCurrency.accountName} (Balance: $${assetInBSNoCurrency.balance})`);
    } else {
      console.log(`   ❌ Asset account NOT found`);
    }
    console.log('');

    // Test balance sheet WITH currency filter
    console.log('2. Testing Balance Sheet WITH currency filter...');
    const balanceSheetWithCurrency = await axios.get(`${BASE_URL}/api/accounting/balance-sheet`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      params: {
        asOfDate: '2025-11-17',
        currencyId: assetJournalEntry.currencyId
      }
    });

    const bsWithCurrency = balanceSheetWithCurrency.data.data || balanceSheetWithCurrency.data;
    const fixedAssetsWithCurrency = bsWithCurrency.assets?.fixedAssets?.accounts || [];
    const totalFixedWithCurrency = bsWithCurrency.assets?.fixedAssets?.total || 0;

    console.log(`   Total Fixed Assets: $${totalFixedWithCurrency}`);
    console.log(`   Number of accounts: ${fixedAssetsWithCurrency.length}`);
    
    const assetInBSWithCurrency = fixedAssetsWithCurrency.find(acc => 
      acc.accountNo === '1100' || acc.accountName?.includes('Office Equipment')
    );
    
    if (assetInBSWithCurrency) {
      console.log(`   ✅ Asset account found: ${assetInBSWithCurrency.accountNo} - ${assetInBSWithCurrency.accountName} (Balance: $${assetInBSWithCurrency.balance})`);
    } else {
      console.log(`   ❌ Asset account NOT found`);
    }
    console.log('');

    // Summary
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📋 SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`Without Currency Filter: ${assetInBSNoCurrency ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log(`With Currency Filter: ${assetInBSWithCurrency ? '✅ FOUND' : '❌ NOT FOUND'}`);
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Full error:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

checkBalanceSheetCurrencyFilter();

