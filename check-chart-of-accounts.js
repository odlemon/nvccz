const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function checkChartOfAccounts() {
  let token = '';

  console.log('═══════════════════════════════════════════════════════════');
  console.log('📋 CHECKING CHART OF ACCOUNTS');
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

  // Step 2: Get all chart of accounts
  console.log('📊 Getting Chart of Accounts...\n');
  try {
    const accountsRes = await axios.get(`${BASE_URL}/api/accounting/chart-of-accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const accounts = accountsRes.data.data || [];

    console.log(`✅ Found ${accounts.length} account(s)\n`);

    // Find key accounts for forex reconciliation
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔍 KEY ACCOUNTS FOR FOREX RECONCILIATION');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Accounts Receivable
    const arAccounts = accounts.filter(a => 
      a.accountName.toLowerCase().includes('receivable') || 
      a.accountNo === '1200' ||
      a.accountName.toLowerCase().includes('debtor')
    );
    console.log('📋 Accounts Receivable:');
    if (arAccounts.length > 0) {
      arAccounts.forEach(acc => {
        console.log(`   ${acc.accountNo} - ${acc.accountName} (${acc.accountType})`);
      });
    } else {
      console.log('   ❌ NOT FOUND');
    }
    console.log('');

    // Foreign Exchange accounts
    const forexAccounts = accounts.filter(a => 
      a.accountName.toLowerCase().includes('foreign exchange') ||
      a.accountName.toLowerCase().includes('forex') ||
      a.accountName.toLowerCase().includes('fx') ||
      a.accountName.toLowerCase().includes('gain') ||
      a.accountName.toLowerCase().includes('loss')
    );
    console.log('💱 Foreign Exchange Gain/Loss:');
    if (forexAccounts.length > 0) {
      forexAccounts.forEach(acc => {
        console.log(`   ${acc.accountNo} - ${acc.accountName} (${acc.accountType})`);
      });
    } else {
      console.log('   ❌ NOT FOUND - Need to create');
    }
    console.log('');

    // Bank/Cash accounts
    const bankAccounts = accounts.filter(a => 
      a.accountType === 'Current Asset' && (
        a.accountName.toLowerCase().includes('bank') ||
        a.accountName.toLowerCase().includes('cash') ||
        a.accountNo.startsWith('11') ||
        a.accountNo.startsWith('10')
      )
    );
    console.log('🏦 Bank/Cash Accounts (for payments):');
    if (bankAccounts.length > 0) {
      bankAccounts.slice(0, 5).forEach(acc => {
        console.log(`   ${acc.accountNo} - ${acc.accountName} (${acc.accountType})`);
      });
      if (bankAccounts.length > 5) {
        console.log(`   ... and ${bankAccounts.length - 5} more`);
      }
    } else {
      console.log('   ❌ NOT FOUND');
    }
    console.log('');

    // Revenue accounts
    const revenueAccounts = accounts.filter(a => 
      a.accountType === 'Revenue' && a.accountNo.startsWith('4')
    );
    console.log('💰 Revenue Accounts:');
    if (revenueAccounts.length > 0) {
      revenueAccounts.slice(0, 3).forEach(acc => {
        console.log(`   ${acc.accountNo} - ${acc.accountName} (${acc.accountType})`);
      });
      if (revenueAccounts.length > 3) {
        console.log(`   ... and ${revenueAccounts.length - 3} more`);
      }
    } else {
      console.log('   ❌ NOT FOUND');
    }
    console.log('');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(`Total Accounts: ${accounts.length}`);
    console.log(`Accounts Receivable: ${arAccounts.length > 0 ? '✅ Found' : '❌ Missing'}`);
    console.log(`Foreign Exchange: ${forexAccounts.length > 0 ? '✅ Found' : '❌ Missing'}`);
    console.log(`Bank/Cash: ${bankAccounts.length > 0 ? '✅ Found' : '❌ Missing'}`);
    console.log(`Revenue: ${revenueAccounts.length > 0 ? '✅ Found' : '❌ Missing'}\n`);

    return {
      accounts,
      arAccounts,
      forexAccounts,
      bankAccounts,
      revenueAccounts
    };

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}

checkChartOfAccounts();

