const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testLiabilityAccountDetail() {
  let token = '';

  console.log('Testing Liability Account Detail...\n');

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

  // Get currency
  let currencyId = null;
  try {
    const currenciesRes = await axios.get(`${BASE_URL}/api/accounting/currencies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const currencies = currenciesRes.data.data || [];
    if (currencies.length > 0) {
      const defaultCurrency = currencies.find(c => c.isDefault) || currencies[0];
      currencyId = defaultCurrency.id;
    }
  } catch (error) {
    console.error('⚠️  Could not get currencies:', error.message);
    return;
  }

  // Test Accounts Payable (2000) - showing -28,413.10
  console.log('Testing Account 2000 - Accounts Payable\n');
  try {
    const yearStart = '2025-01-01';
    const yearEnd = '2025-12-31';
    
    const glRes = await axios.get(
      `${BASE_URL}/api/accounting/gl-ledger-detail`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          accountNo: '2000',
          startDate: yearStart,
          endDate: yearEnd
        },
        timeout: 30000
      }
    );

    const glData = glRes.data.data || glRes.data;
    if (glData.summary) {
      console.log(`Account: ${glData.account.accountName} (${glData.account.accountNo})`);
      console.log(`Account Type: ${glData.account.accountType}`);
      console.log(`Opening Balance: ${parseFloat(glData.account.openingBalance || 0).toFixed(2)}`);
      console.log(`Closing Balance: ${parseFloat(glData.account.closingBalance || 0).toFixed(2)}`);
      console.log(`Total Debits: ${parseFloat(glData.summary.totalDebits || 0).toFixed(2)}`);
      console.log(`Total Credits: ${parseFloat(glData.summary.totalCredits || 0).toFixed(2)}`);
      console.log(`Net Change: ${parseFloat(glData.summary.netChange || 0).toFixed(2)}`);
      console.log(`Transactions: ${glData.transactions?.length || 0}\n`);
      
      // Show first few transactions
      if (glData.transactions && glData.transactions.length > 0) {
        console.log('First 5 transactions:');
        glData.transactions.slice(0, 5).forEach((txn, idx) => {
          console.log(`  ${idx + 1}. ${txn.date} - ${txn.reference}`);
          console.log(`     Debit: ${txn.debitAmount.toFixed(2)}, Credit: ${txn.creditAmount.toFixed(2)}, Balance: ${txn.runningBalance.toFixed(2)}`);
        });
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testLiabilityAccountDetail();

