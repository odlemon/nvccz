const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testTrialBalanceDirect() {
  let token = '';

  console.log('Testing Trial Balance directly...\n');

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

  // Test with different dates
  const testDates = [
    '2025-11-15',
    '2025-11-14',
    '2025-12-31',
    '2025-01-01'
  ];

  for (const dateStr of testDates) {
    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`Testing Trial Balance for date: ${dateStr}`);
    console.log(`═══════════════════════════════════════════════════════════\n`);

    try {
      const trialBalanceRes = await axios.get(
        `${BASE_URL}/api/accounting/trial-balance`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { date: dateStr }
        }
      );

      const trialBalance = trialBalanceRes.data.data || trialBalanceRes.data;
      const totalDebits = parseFloat(trialBalance.totals?.totalDebits || trialBalance.totalDebits || 0);
      const totalCredits = parseFloat(trialBalance.totals?.totalCredits || trialBalance.totalCredits || 0);
      const accounts = trialBalance.accounts || [];

      console.log(`Total Debits: ${totalDebits.toFixed(2)}`);
      console.log(`Total Credits: ${totalCredits.toFixed(2)}`);
      console.log(`Difference: ${Math.abs(totalDebits - totalCredits).toFixed(2)}`);
      console.log(`Accounts with balances: ${accounts.length}`);

      if (accounts.length > 0) {
        console.log(`\nFirst 5 accounts:`);
        accounts.slice(0, 5).forEach(acc => {
          console.log(`  ${acc.accountNo} - ${acc.accountName}: ${(acc.debitBalance || 0).toFixed(2)} / ${(acc.creditBalance || 0).toFixed(2)}`);
        });
      }
    } catch (error) {
      console.error(`❌ Error for date ${dateStr}:`, error.response?.data || error.message);
    }
  }
}

testTrialBalanceDirect();

