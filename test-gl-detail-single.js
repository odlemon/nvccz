const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testGLDetail() {
  let token = '';

  console.log('Testing GL Detail endpoint...\n');

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

  // Get a cash account
  try {
    const accountsRes = await axios.get(
      `${BASE_URL}/api/accounting/chart-of-accounts`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 100 }
      }
    );

    const accounts = accountsRes.data.data || accountsRes.data || [];
    const cashAccount = accounts.find(a => 
      a.accountName.toLowerCase().includes('cash') || 
      a.accountNo === '1000' || 
      a.accountNo === '1010'
    );

    if (!cashAccount) {
      console.log('No cash account found');
      return;
    }

    console.log(`Testing GL Detail for account: ${cashAccount.accountNo} - ${cashAccount.accountName}\n`);

    const yearStart = '2024-12-31';
    const yearEnd = '2025-12-30';

    try {
      const glRes = await axios.get(
        `${BASE_URL}/api/accounting/gl-ledger-detail`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            accountNo: cashAccount.accountNo,
            startDate: yearStart,
            endDate: yearEnd
          }
        }
      );

      console.log('Response status:', glRes.status);
      console.log('Response data keys:', Object.keys(glRes.data));
      
      const glData = glRes.data.data || glRes.data;
      console.log('\nGL Data structure:');
      console.log('  Has summary:', !!glData.summary);
      console.log('  Has account:', !!glData.account);
      
      if (glData.summary) {
        console.log('\nSummary:');
        console.log('  Total Debits:', glData.summary.totalDebits);
        console.log('  Total Credits:', glData.summary.totalCredits);
        console.log('  Net Change:', glData.summary.netChange);
      }
      
      if (glData.account) {
        console.log('\nAccount:');
        console.log('  Opening Balance:', glData.account.openingBalance);
        console.log('  Closing Balance:', glData.account.closingBalance);
      }

    } catch (error) {
      console.error('\n❌ Error calling GL Detail:');
      console.error('  Status:', error.response?.status);
      console.error('  Message:', error.response?.data?.message || error.message);
      console.error('  Data:', JSON.stringify(error.response?.data, null, 2));
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testGLDetail();

