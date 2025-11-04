const axios = require('axios');

async function test() {
  const BASE = 'http://localhost:3003';
  
  // Login
  const loginRes = await axios.post(`${BASE}/api/auth/login`, {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  });
  const token = loginRes.data.token;
  console.log('✅ Login successful\n');

  // Test 1: Should reject
  console.log('Test 1: 5000 + Revenue (should REJECT)');
  try {
    await axios.post(`${BASE}/api/accounting/chart-of-accounts`, {
      accountNo: '5000',
      accountName: 'Test',
      accountType: 'Revenue',
      financialStatement: 'Income Statement',
      isActive: true
    }, { headers: { Authorization: `Bearer ${token}` } });
    console.log('❌ FAILED: Should have been rejected\n');
  } catch (e) {
    if (e.response?.status === 400 && e.response.data.message?.includes('5000s')) {
      console.log('✅ PASSED: Correctly rejected\n');
    } else {
      console.log('❌ FAILED:', e.response?.data?.message || e.message, '\n');
    }
  }

  // Test 2: Should accept
  console.log('Test 2: 5001-TEST + Expense (should ACCEPT)');
  try {
    const unique = `5001-TEST-${Date.now()}`;
    const res = await axios.post(`${BASE}/api/accounting/chart-of-accounts`, {
      accountNo: unique,
      accountName: 'Test Expense',
      accountType: 'Expense',
      financialStatement: 'Income Statement',
      isActive: true
    }, { headers: { Authorization: `Bearer ${token}` } });
    console.log('✅ PASSED: Account created');
    const accountId = res.data.data?.id || res.data.id;
    if (accountId) {
      await axios.delete(`${BASE}/api/accounting/chart-of-accounts/${accountId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log('  Cleaned up\n');
    }
  } catch (e) {
    console.log('❌ FAILED:', e.response?.data?.message || e.message, '\n');
  }

  // Test 3: Should reject
  console.log('Test 3: 4000 + Expense (should REJECT)');
  try {
    await axios.post(`${BASE}/api/accounting/chart-of-accounts`, {
      accountNo: '4000',
      accountName: 'Test',
      accountType: 'Expense',
      financialStatement: 'Income Statement',
      isActive: true
    }, { headers: { Authorization: `Bearer ${token}` } });
    console.log('❌ FAILED: Should have been rejected\n');
  } catch (e) {
    if (e.response?.status === 400 && e.response.data.message?.includes('4000s')) {
      console.log('✅ PASSED: Correctly rejected\n');
    } else {
      console.log('❌ FAILED:', e.response?.data?.message || e.message, '\n');
    }
  }

  console.log('✅ ALL TESTS COMPLETE');
}

test().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});


