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

async function checkAssetJournalEntryLines() {
  try {
    await login();
    if (!TOKEN) {
      console.log('Failed to login');
      return;
    }

    console.log('🔍 Checking Asset Journal Entry Lines\n');

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

    console.log(`Asset: ${asset.assetName} (${asset.assetCode})`);
    console.log(`Asset Account ID: ${asset.assetAccountId}\n`);

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

    console.log(`Journal Entry: ${assetJournalEntry.referenceNumber}`);
    console.log(`Journal Entry ID: ${assetJournalEntry.id}`);
    console.log(`Status: ${assetJournalEntry.status}`);
    console.log(`Transaction Date: ${assetJournalEntry.transactionDate}`);
    console.log(`Currency ID: ${assetJournalEntry.currencyId}\n`);

    // Get the full journal entry with lines
    const jeResponse = await axios.get(`${BASE_URL}/api/accounting/journal-entries/${assetJournalEntry.id}`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    const journalEntry = jeResponse.data.data?.journalEntry || jeResponse.data.data || jeResponse.data;
    const lines = journalEntry.journalEntryLines || [];

    console.log(`Journal Entry Lines Count: ${lines.length}\n`);

    if (lines.length === 0) {
      console.log('❌ PROBLEM: No journal entry lines found!');
      console.log('   This means the asset acquisition journal entry was created without lines.');
      console.log('   The asset will not appear on the balance sheet.\n');
    } else {
      console.log('✅ Journal Entry Lines:');
      lines.forEach((line, index) => {
        console.log(`\n   Line ${index + 1}:`);
        console.log(`     Account: ${line.chartOfAccount?.accountNo || 'N/A'} - ${line.chartOfAccount?.accountName || 'N/A'}`);
        console.log(`     Account Type: ${line.chartOfAccount?.accountType || 'N/A'}`);
        console.log(`     Account ID: ${line.chartOfAccountId}`);
        console.log(`     Debit: $${line.debitAmount || 0}`);
        console.log(`     Credit: $${line.creditAmount || 0}`);
        console.log(`     Description: ${line.description || 'N/A'}`);
        
        if (line.chartOfAccountId === asset.assetAccountId) {
          console.log(`     ✅ This is the asset account line`);
        }
      });
    }

    // Check if the asset account line exists
    const assetLine = lines.find(line => line.chartOfAccountId === asset.assetAccountId);
    if (!assetLine) {
      console.log('\n❌ PROBLEM: No journal entry line found for the asset account!');
      console.log(`   Expected Account ID: ${asset.assetAccountId}`);
      console.log(`   This is why the asset is not appearing on the balance sheet.\n`);
    }

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

checkAssetJournalEntryLines();

