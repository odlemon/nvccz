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

async function checkBalanceSheetAccounts() {
  try {
    await login();
    if (!TOKEN) {
      console.log('Failed to login');
      return;
    }

    console.log('🔍 Checking Balance Sheet Chart of Accounts Reference\n');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Step 1: Get the Office Equipment account (1100)
    console.log('Step 1: Checking Office Equipment account (1100)...');
    const accountResponse = await axios.get(`${BASE_URL}/api/accounting/chart-of-accounts`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      params: {
        accountNo: '1100'
      }
    });

    const accounts = accountResponse.data.data || accountResponse.data || [];
    const officeEquipmentAccount = accounts.find(acc => acc.accountNo === '1100') || accounts[0];

    if (!officeEquipmentAccount) {
      console.log('❌ Account 1100 not found');
      return;
    }

    console.log(`✅ Found account: ${officeEquipmentAccount.accountNo} - ${officeEquipmentAccount.accountName}`);
    console.log(`   - Account Type: ${officeEquipmentAccount.accountType}`);
    console.log(`   - Financial Statement: ${officeEquipmentAccount.financialStatement || 'NOT SET'}`);
    console.log(`   - Is Active: ${officeEquipmentAccount.isActive}`);
    console.log('');

    // Step 2: Check what accounts the balance sheet would retrieve
    console.log('Step 2: Checking what accounts Balance Sheet would retrieve...');
    console.log('   Balance Sheet filter: financialStatement IN ["Balance Sheet", "Balance sheet"] AND isActive = true');
    console.log('');

    const allAccountsResponse = await axios.get(`${BASE_URL}/api/accounting/chart-of-accounts`, {
      headers: { Authorization: `Bearer ${TOKEN}` }
    });

    const allAccounts = allAccountsResponse.data.data || allAccountsResponse.data || [];
    const balanceSheetAccounts = allAccounts.filter(acc => 
      (acc.financialStatement === 'Balance Sheet' || acc.financialStatement === 'Balance sheet') &&
      acc.isActive === true
    );

    console.log(`   Total accounts in system: ${allAccounts.length}`);
    console.log(`   Accounts matching Balance Sheet filter: ${balanceSheetAccounts.length}`);
    console.log('');

    const officeEquipmentInBS = balanceSheetAccounts.find(acc => acc.accountNo === '1100');
    if (officeEquipmentInBS) {
      console.log(`   ✅ Account 1100 IS included in Balance Sheet accounts list`);
    } else {
      console.log(`   ❌ Account 1100 is NOT included in Balance Sheet accounts list`);
      console.log(`   This means the balance sheet won't look for transactions for this account!`);
    }
    console.log('');

    // Step 3: Check journal entries for account 1100
    console.log('Step 3: Checking journal entries for account 1100...');
    const journalEntriesResponse = await axios.get(`${BASE_URL}/api/accounting/journal-entries`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      params: {
        search: 'ASSET',
        status: 'POSTED'
      }
    });

    const journalEntries = journalEntriesResponse.data?.data || journalEntriesResponse.data || [];
    const assetEntries = journalEntries.filter(je => 
      je.referenceNumber?.includes('ASSET') || 
      je.description?.toLowerCase().includes('asset')
    );

    console.log(`   Total journal entries found: ${journalEntries.length}`);
    console.log(`   Asset-related entries: ${assetEntries.length}`);
    
    if (assetEntries.length > 0) {
      console.log(`   Asset entries:`);
      assetEntries.forEach(je => {
        console.log(`     - ${je.referenceNumber}: ${je.description} (Date: ${je.transactionDate})`);
      });
    }
    console.log('');

    // Step 4: Summary
    console.log('════════════════════════════════════════════════════════════════');
    console.log('📋 SUMMARY');
    console.log('════════════════════════════════════════════════════════════════');
    console.log(`Account 1100 Financial Statement: ${officeEquipmentAccount.financialStatement || 'NOT SET'}`);
    console.log(`Account 1100 in Balance Sheet filter: ${officeEquipmentInBS ? 'YES ✅' : 'NO ❌'}`);
    console.log(`Asset journal entries found: ${assetEntries.length}`);
    
    if (!officeEquipmentInBS) {
      console.log('\n❌ PROBLEM: Account 1100 is not included in Balance Sheet accounts!');
      console.log('   Solution: Update account 1100 to set financialStatement = "Balance Sheet"');
    } else if (assetEntries.length === 0) {
      console.log('\n❌ PROBLEM: No asset journal entries found!');
    } else {
      console.log('\n✅ Account and entries found - issue might be in the query logic');
    }
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Full error:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

checkBalanceSheetAccounts();

