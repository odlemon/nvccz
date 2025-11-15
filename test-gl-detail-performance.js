const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testGLDetailPerformance() {
  let token = '';

  console.log('Testing GL Detail Performance with Different Date Ranges...\n');

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

  // Test with different date ranges
  const tests = [
    { name: 'Full Year (2025-01-01 to 2025-12-31)', start: '2025-01-01', end: '2025-12-31' },
    { name: 'Last 3 Months', start: '2025-09-01', end: '2025-11-30' },
    { name: 'Last Month', start: '2025-10-01', end: '2025-10-31' },
    { name: 'Current Month', start: '2025-11-01', end: '2025-11-30' },
  ];

  for (const test of tests) {
    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`Testing: ${test.name}`);
    console.log(`═══════════════════════════════════════════════════════════\n`);
    
    const startTime = Date.now();
    
    try {
      const glRes = await axios.get(
        `${BASE_URL}/api/accounting/gl-ledger-detail`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            accountNo: '1000',
            startDate: test.start,
            endDate: test.end
          },
          timeout: 60000
        }
      );

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      const glData = glRes.data.data || glRes.data;
      
      console.log(`✅ Success in ${elapsed}s`);
      console.log(`   Transactions: ${glData.transactions?.length || 0}`);
      console.log(`   Total Debits: ${parseFloat(glData.summary?.totalDebits || 0).toFixed(2)}`);
      console.log(`   Total Credits: ${parseFloat(glData.summary?.totalCredits || 0).toFixed(2)}`);
      
    } catch (error) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
      console.error(`❌ Failed after ${elapsed}s`);
      if (error.code === 'ECONNABORTED') {
        console.error(`   Timeout exceeded`);
      } else {
        console.error(`   Error: ${error.message}`);
      }
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('CONCLUSION:');
  console.log('The frontend likely uses shorter date ranges (month/quarter)');
  console.log('and loads one account at a time, which is why it works there!');
  console.log('═══════════════════════════════════════════════════════════\n');
}

testGLDetailPerformance();

