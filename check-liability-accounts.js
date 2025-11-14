const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function checkLiabilityAccounts() {
  let token = '';

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 CHECKING LIABILITY ACCOUNTS 2150 and 2250');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Step 1: Login
  console.log('🔐 Logging in...');
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

  // Step 2: Check if accounts exist in Chart of Accounts
  console.log('📋 Step 1: Checking Chart of Accounts...\n');
  try {
    const accountsRes = await axios.get(`${BASE_URL}/api/accounting/chart-of-accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const accounts = accountsRes.data.data || [];

    const account2150 = accounts.find(acc => acc.accountNo === '2150');
    const account2250 = accounts.find(acc => acc.accountNo === '2250');

    console.log('Account 2150 (PAYE Payable):');
    if (account2150) {
      console.log(`   ✅ Found: ${account2150.accountName}`);
      console.log(`   Account Type: ${account2150.accountType}`);
      console.log(`   Financial Statement: ${account2150.financialStatement}`);
      console.log(`   Is Active: ${account2150.isActive}`);
    } else {
      console.log('   ❌ Not found in Chart of Accounts');
    }
    console.log('');

    console.log('Account 2250 (Net Wages Payable):');
    if (account2250) {
      console.log(`   ✅ Found: ${account2250.accountName}`);
      console.log(`   Account Type: ${account2250.accountType}`);
      console.log(`   Financial Statement: ${account2250.financialStatement}`);
      console.log(`   Is Active: ${account2250.isActive}`);
    } else {
      console.log('   ❌ Not found in Chart of Accounts');
    }
    console.log('');

    // Step 3: Check journal entries for these accounts
    if (account2150 || account2250) {
      console.log('📊 Step 2: Checking Journal Entries...\n');
      
      const today = new Date();
      const asOfDate = today.toISOString().split('T')[0];

      // Get journal entries by date range
      const startDate = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
      
      const journalEntriesRes = await axios.get(
        `${BASE_URL}/api/accounting/journal-entries/by-date-range`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            startDate: startDate,
            endDate: asOfDate
          }
        }
      );

      const journalEntries = journalEntriesRes.data.data || [];

      console.log(`Found ${journalEntries.length} journal entries in period\n`);

      // Check for entries involving account 2150
      if (account2150) {
        const entries2150 = journalEntries.filter(je => 
          je.journalEntryLines?.some(line => line.chartOfAccount?.accountNo === '2150')
        );
        console.log(`Account 2150 (PAYE Payable) - Journal Entries: ${entries2150.length}`);
        if (entries2150.length > 0) {
          console.log('   Recent entries:');
          entries2150.slice(0, 5).forEach(je => {
            const line = je.journalEntryLines.find(l => l.chartOfAccount?.accountNo === '2150');
            console.log(`   - ${je.referenceNumber} (${je.transactionDate}): Debit ${parseFloat(line.debitAmount || 0).toFixed(2)}, Credit ${parseFloat(line.creditAmount || 0).toFixed(2)}`);
          });
        }
        console.log('');
      }

      // Check for entries involving account 2250
      if (account2250) {
        const entries2250 = journalEntries.filter(je => 
          je.journalEntryLines?.some(line => line.chartOfAccount?.accountNo === '2250')
        );
        console.log(`Account 2250 (Net Wages Payable) - Journal Entries: ${entries2250.length}`);
        if (entries2250.length > 0) {
          console.log('   Recent entries:');
          entries2250.slice(0, 5).forEach(je => {
            const line = je.journalEntryLines.find(l => l.chartOfAccount?.accountNo === '2250');
            console.log(`   - ${je.referenceNumber} (${je.transactionDate}): Debit ${parseFloat(line.debitAmount || 0).toFixed(2)}, Credit ${parseFloat(line.creditAmount || 0).toFixed(2)}`);
          });
        }
        console.log('');
      }
    }

    // Step 4: Check trial balance for these accounts
    console.log('💰 Step 3: Checking Trial Balance...\n');
    try {
      const trialBalanceRes = await axios.get(
        `${BASE_URL}/api/accounting/trial-balance`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            asOfDate: asOfDate
          }
        }
      );

      const trialBalance = trialBalanceRes.data.data || {};
      const accounts = trialBalance.accounts || [];

      const tb2150 = accounts.find(acc => acc.accountNo === '2150');
      const tb2250 = accounts.find(acc => acc.accountNo === '2250');

      console.log('Trial Balance Balances:');
      if (tb2150) {
        console.log(`   Account 2150: ${parseFloat(tb2150.balance || 0).toFixed(2)}`);
      } else {
        console.log('   Account 2150: Not found in trial balance');
      }

      if (tb2250) {
        console.log(`   Account 2250: ${parseFloat(tb2250.balance || 0).toFixed(2)}`);
      } else {
        console.log('   Account 2250: Not found in trial balance');
      }
      console.log('');

    } catch (error) {
      console.log('⚠️  Could not fetch trial balance:', error.response?.data?.message || error.message);
      console.log('');
    }

    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

checkLiabilityAccounts();

