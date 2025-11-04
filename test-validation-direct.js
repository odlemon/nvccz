// Direct test of Account Number vs Account Type validation
// Usage: TOKEN=your_token node test-validation-direct.js
// Or: node test-validation-direct.js (it will try to get token first)

const http = require('http');

const BASE_URL = 'http://localhost:3001';
const TOKEN = process.env.TOKEN;
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

function makeRequest(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const postData = data ? JSON.stringify(data) : null;
    
    const options = {
      hostname: url.hostname,
      port: url.port || 3001,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...(postData && { 'Content-Length': Buffer.byteLength(postData) })
      }
    };

    const req = http.request(options, (res) => {
      let responseData = '';
      res.on('data', (chunk) => { responseData += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseData);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: responseData });
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function getToken() {
  if (TOKEN) {
    console.log('Using provided token');
    return TOKEN;
  }
  
  console.log('Attempting to get token...');
  try {
    // Try different possible paths
    const paths = ['/api/auth/login', '/auth/login'];
    for (const path of paths) {
      try {
        const response = await makeRequest('POST', path, {
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD
        });
        if (response.status === 200 && response.data.token) {
          console.log('✅ Token obtained!');
          return response.data.token;
        }
      } catch (e) {
        // Try next path
      }
    }
    throw new Error('Could not get token automatically');
  } catch (error) {
    console.log('❌ Could not get token. Please provide TOKEN environment variable.');
    console.log('   Example: $env:TOKEN="your_token" ; node test-validation-direct.js');
    throw error;
  }
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  UAT TEST: Chart Of Account Type Constraint                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  let token;
  try {
    token = await getToken();
  } catch (error) {
    console.log(error.message);
    process.exit(1);
  }

  let testsPassed = 0;
  let testsFailed = 0;

  // Test Case 1: Account Number 5000 with Account Type "Revenue" - SHOULD BE REJECTED
  console.log('📋 Test Case 1: Account Number "5000" with Account Type "Revenue"');
  console.log('   Expected: REJECTED (5000s range must be Expense type)\n');
  
  try {
    const response = await makeRequest('POST', '/api/accounting/chart-of-accounts', {
      accountNo: '5000',
      accountName: 'Test Expense Account - Wrong Type',
      accountType: 'Revenue',
      financialStatement: 'Income Statement',
      isActive: true
    }, token);

    if (response.status === 400 && response.data.message) {
      const message = response.data.message || '';
      if (message.includes('Account number conflict') || message.includes('5000s') || message.includes('Expense')) {
        console.log('   ✅ TEST PASSED: Account creation was correctly rejected');
        console.log('   Error message:', message);
        testsPassed++;
      } else {
        console.log('   ❌ TEST FAILED: Rejected but with wrong error message');
        console.log('   Response:', JSON.stringify(response.data, null, 2));
        testsFailed++;
      }
    } else {
      console.log('   ❌ TEST FAILED: Account was created but should have been rejected!');
      console.log('   Status:', response.status);
      console.log('   Response:', JSON.stringify(response.data, null, 2));
      testsFailed++;
    }
  } catch (error) {
    console.log('   ❌ TEST FAILED: Request error:', error.message);
    testsFailed++;
  }

  console.log('\n────────────────────────────────────────────────────────────────\n');

  // Test Case 2: Account Number 5001 with Account Type "Expense" - SHOULD BE ACCEPTED
  console.log('📋 Test Case 2: Account Number "5001-TEST-xxx" with Account Type "Expense"');
  console.log('   Expected: ACCEPTED (Account number matches account type)\n');
  
  try {
    const uniqueAccountNo = `5001-TEST-${Date.now()}`;
    const response = await makeRequest('POST', '/api/accounting/chart-of-accounts', {
      accountNo: uniqueAccountNo,
      accountName: 'Test Expense Account - Correct Type',
      accountType: 'Expense',
      financialStatement: 'Income Statement',
      isActive: true
    }, token);

    if (response.status === 201 || (response.status === 200 && response.data.success)) {
      console.log('   ✅ TEST PASSED: Account was correctly created');
      console.log('   Account ID:', response.data.data?.id || response.data.id || 'N/A');
      console.log('   Account Number:', uniqueAccountNo);
      
      // Clean up
      if (response.data.data?.id || response.data.id) {
        const accountId = response.data.data?.id || response.data.id;
        try {
          await makeRequest('DELETE', `/api/accounting/chart-of-accounts/${accountId}`, null, token);
          console.log('   🧹 Test account cleaned up');
        } catch (cleanupError) {
          console.log('   ⚠️  Could not cleanup test account (non-critical)');
        }
      }
      testsPassed++;
    } else {
      console.log('   ❌ TEST FAILED: Account creation was rejected but should have been accepted');
      console.log('   Status:', response.status);
      console.log('   Response:', JSON.stringify(response.data, null, 2));
      testsFailed++;
    }
  } catch (error) {
    console.log('   ❌ TEST FAILED: Request error:', error.message);
    testsFailed++;
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  if (testsFailed === 0) {
    console.log('║  ✅ ALL TESTS PASSED                                           ║');
    console.log(`║  Tests Passed: ${testsPassed}                                                ║`);
  } else {
    console.log('║  ❌ SOME TESTS FAILED                                          ║');
    console.log(`║  Tests Passed: ${testsPassed}                                                ║`);
    console.log(`║  Tests Failed: ${testsFailed}                                                ║`);
  }
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  process.exit(testsFailed === 0 ? 0 : 1);
}

runTests().catch(error => {
  console.error('Test execution error:', error);
  process.exit(1);
});



