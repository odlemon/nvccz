const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

// Admin credentials - update these if your admin credentials are different
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

let TOKEN = null;

async function login() {
  try {
    console.log(`🔐 Logging in as admin...`);
    console.log(`   Email: ${ADMIN_EMAIL}`);
    console.log(`   Password: ${'*'.repeat(ADMIN_PASSWORD.length)}\n`);
    
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });

    if (loginResponse.data.success || loginResponse.data.token) {
      TOKEN = loginResponse.data.token || loginResponse.data.data?.token;
      console.log('✅ Login successful!\n');
      return true;
    } else {
      console.log('❌ Login failed:', loginResponse.data);
      return false;
    }
  } catch (error) {
    console.error('❌ Login error:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, error.response.data);
    } else if (error.request) {
      console.error(`   No response from server. Is it running on ${BASE_URL}?`);
    } else {
      console.error(`   Error:`, error.message);
    }
    console.error(`\n💡 Tip: If these credentials are incorrect, set ADMIN_EMAIL and ADMIN_PASSWORD environment variables`);
    return false;
  }
}

async function debugAssetOnBalanceSheet() {
  try {
    // Login first
    const loggedIn = await login();
    if (!loggedIn || !TOKEN) {
      console.log('❌ Failed to login. Cannot proceed.');
      return;
    }

    console.log('🔍 Debugging Asset on Balance Sheet\n');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Step 1: Find the asset
    console.log('Step 1: Finding the asset...');
    const assetsResponse = await axios.get(`${BASE_URL}/api/accounting/assets`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    }).catch(err => {
      console.error('Error fetching assets:', err.response?.data || err.message);
      throw err;
    });

    const assetsData = assetsResponse.data.data?.assets || assetsResponse.data.data || assetsResponse.data || [];
    const asset = assetsData.find(a => 
      a.assetName?.toLowerCase().includes('hp') || 
      a.assetName?.toLowerCase().includes('laptop')
    ) || assetsData[0];

    if (!asset) {
      console.log('❌ Asset not found. Please check the asset name or provide the asset ID.');
      return;
    }

    console.log(`✅ Found asset: ${asset.assetName} (${asset.assetCode})`);
    console.log(`   - Asset Account ID: ${asset.assetAccountId}`);
    console.log(`   - Cost: $${asset.cost}`);
    console.log(`   - Purchase Date: ${asset.purchaseDate}`);
    console.log('');

    // Step 2: Get the asset account details
    console.log('Step 2: Checking asset GL account...');
    const accountResponse = await axios.get(`${BASE_URL}/api/accounting/chart-of-accounts/${asset.assetAccountId}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    }).catch(err => {
      console.error('Error fetching account:', err.response?.data || err.message);
      throw err;
    });

    const assetAccount = accountResponse.data.data || accountResponse.data;
    console.log(`✅ Asset GL Account:`);
    console.log(`   - Account No: ${assetAccount.accountNo}`);
    console.log(`   - Account Name: ${assetAccount.accountName}`);
    console.log(`   - Account Type: ${assetAccount.accountType}`);
    console.log(`   - Is Active: ${assetAccount.isActive}`);
    console.log('');

    // Check if account type is correct
    if (assetAccount.accountType !== 'Fixed Asset' && assetAccount.accountType !== 'Long-Term Asset') {
      console.log('❌ PROBLEM FOUND:');
      console.log(`   The asset account "${assetAccount.accountName}" has account type "${assetAccount.accountType}"`);
      console.log(`   But the Balance Sheet only shows accounts with type "Fixed Asset" or "Long-Term Asset"`);
      console.log(`   Please update the account type in Chart of Accounts.`);
      console.log('');
    } else {
      console.log('✅ Account type is correct for Fixed Assets section');
      console.log('');
    }

    // Step 3: Check journal entries for this asset
    console.log('Step 3: Checking journal entries for asset acquisition...');
    const journalEntriesResponse = await axios.get(`${BASE_URL}/api/accounting/journal-entries`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      params: {
        search: `ASSET-${asset.assetCode}`,
        status: 'POSTED'
      }
    }).catch(err => {
      console.error('Error fetching journal entries:', err.response?.data || err.message);
      return { data: { data: [] } };
    });

    const journalEntries = journalEntriesResponse.data?.data || journalEntriesResponse.data || [];
    const assetJournalEntry = journalEntries.find(je => 
      je.referenceNumber?.includes(`ASSET-${asset.assetCode}`) ||
      je.description?.toLowerCase().includes(asset.assetName.toLowerCase())
    );

    if (!assetJournalEntry) {
      console.log('❌ PROBLEM FOUND:');
      console.log(`   No journal entry found for asset acquisition`);
      console.log(`   Expected reference: ASSET-${asset.assetCode}`);
      console.log('');
    } else {
      console.log(`✅ Found journal entry: ${assetJournalEntry.referenceNumber}`);
      console.log(`   - Status: ${assetJournalEntry.status}`);
      console.log(`   - Transaction Date: ${assetJournalEntry.transactionDate}`);
      console.log(`   - Description: ${assetJournalEntry.description}`);
      console.log('');

      // Check journal entry lines
      const journalEntryLinesResponse = await axios.get(
        `${BASE_URL}/api/accounting/journal-entries/${assetJournalEntry.id}/lines`,
        {
          headers: { Authorization: `Bearer ${TOKEN}` }
        }
      ).catch(err => {
        console.error('Error fetching journal entry lines:', err.response?.data || err.message);
        return { data: { data: [] } };
      });

      const lines = journalEntryLinesResponse.data?.data || journalEntryLinesResponse.data || [];
      const assetLine = lines.find(line => line.chartOfAccountId === asset.assetAccountId);

      if (assetLine) {
        console.log(`✅ Found journal entry line for asset account:`);
        console.log(`   - Debit Amount: $${assetLine.debitAmount}`);
        console.log(`   - Credit Amount: $${assetLine.creditAmount}`);
        console.log('');
      } else {
        console.log('❌ PROBLEM FOUND:');
        console.log(`   No journal entry line found for asset account ${assetAccount.accountNo}`);
        console.log('');
      }
    }

    // Step 4: Check balance sheet
    console.log('Step 4: Checking Balance Sheet...');
    const today = new Date().toISOString().split('T')[0];
    const assetPurchaseDate = new Date(asset.purchaseDate).toISOString().split('T')[0];
    
    // Use the later of today or asset purchase date to ensure asset is included
    const balanceSheetDate = assetPurchaseDate > today ? assetPurchaseDate : today;
    
    console.log(`   - Today's date: ${today}`);
    console.log(`   - Asset purchase date: ${assetPurchaseDate}`);
    console.log(`   - Using balance sheet date: ${balanceSheetDate}`);
    console.log('');
    
    const balanceSheetResponse = await axios.get(`${BASE_URL}/api/accounting/balance-sheet`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      params: {
        asOfDate: balanceSheetDate
      }
    }).catch(err => {
      console.error('Error fetching balance sheet:', err.response?.data || err.message);
      throw err;
    });

    const balanceSheet = balanceSheetResponse.data.data || balanceSheetResponse.data;
    const fixedAssets = balanceSheet.assets?.fixedAssets?.accounts || [];

    console.log(`✅ Balance Sheet Fixed Assets:`);
    console.log(`   - Total Fixed Assets: $${balanceSheet.assets?.fixedAssets?.total || 0}`);
    console.log(`   - Number of accounts: ${fixedAssets.length}`);
    console.log('');

    // Check if asset account is in the list
    const assetInBalanceSheet = fixedAssets.find(acc => 
      acc.accountNo === assetAccount.accountNo ||
      acc.accountName === assetAccount.accountName
    );

    if (assetInBalanceSheet) {
      console.log(`✅ Asset account found in Balance Sheet:`);
      console.log(`   - Account: ${assetInBalanceSheet.accountNo} - ${assetInBalanceSheet.accountName}`);
      console.log(`   - Balance: $${assetInBalanceSheet.balance}`);
      console.log('');
    } else {
      console.log('❌ PROBLEM FOUND:');
      console.log(`   Asset account "${assetAccount.accountNo} - ${assetAccount.accountName}" is NOT in the Balance Sheet`);
      console.log('');
      console.log('   Possible reasons:');
      console.log('   1. Account type is not "Fixed Asset" or "Long-Term Asset"');
      console.log('   2. Journal entry is not POSTED');
      console.log('   3. Journal entry date is after the balance sheet as-of date');
      console.log('   4. Account balance is zero (though this shouldn\'t happen for a new asset)');
      console.log('   5. Currency mismatch (if balance sheet is filtered by currency)');
      console.log('');
    }

    // Summary
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📋 SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`Asset: ${asset.assetName}`);
    console.log(`GL Account: ${assetAccount.accountNo} - ${assetAccount.accountName} (${assetAccount.accountType})`);
    console.log(`Journal Entry Status: ${assetJournalEntry?.status || 'NOT FOUND'}`);
    console.log(`In Balance Sheet: ${assetInBalanceSheet ? 'YES ✅' : 'NO ❌'}`);
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Response:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the diagnostic
debugAssetOnBalanceSheet();

