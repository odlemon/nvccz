const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testTrialBalanceCashAccounts() {
  let token = '';

  console.log('Checking Cash Accounts in Trial Balance...\n');

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

  const asOfDate = new Date().toISOString().split('T')[0];

  try {
    const trialBalanceRes = await axios.get(
      `${BASE_URL}/api/accounting/trial-balance`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { date: asOfDate },
        timeout: 30000
      }
    );

    const trialBalance = trialBalanceRes.data.data || trialBalanceRes.data;
    const accounts = trialBalance.accounts || [];

    console.log('Cash and Bank Accounts in Trial Balance:\n');
    
    let totalCashDebits = 0;
    let totalCashCredits = 0;
    let totalCashNet = 0;

    accounts.forEach(acc => {
      const accountName = (acc.accountName || '').toLowerCase();
      const accountNo = (acc.accountNo || '').toString();
      
      if (
        accountName.includes('cash') ||
        accountName.includes('bank') ||
        accountNo.startsWith('10')
      ) {
        const debitBalance = parseFloat(acc.debitBalance || 0);
        const creditBalance = parseFloat(acc.creditBalance || 0);
        const netBalance = debitBalance - creditBalance;
        
        totalCashDebits += debitBalance;
        totalCashCredits += creditBalance;
        totalCashNet += netBalance;
        
        console.log(`${acc.accountNo} - ${acc.accountName}`);
        console.log(`   Type: ${acc.accountType}`);
        console.log(`   Debit Balance: ${debitBalance.toFixed(2)}`);
        console.log(`   Credit Balance: ${creditBalance.toFixed(2)}`);
        console.log(`   Net Balance: ${netBalance.toFixed(2)}`);
        console.log('');
      }
    });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('Cash Accounts Summary:');
    console.log(`   Total Debits: ${totalCashDebits.toFixed(2)}`);
    console.log(`   Total Credits: ${totalCashCredits.toFixed(2)}`);
    console.log(`   Net Cash Balance: ${totalCashNet.toFixed(2)}`);
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testTrialBalanceCashAccounts();

