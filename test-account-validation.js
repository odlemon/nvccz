// Test script for Account Number vs Account Type validation
// Run with: node test-account-validation.js

const axios = require('axios');

const API_BASE_URL = process.env.API_URL || 'http://localhost:3003';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

let authToken = null;

async function login() {
  console.log('🔐 Logging in to get authentication token...');
  
  try {
    const loginResponse = await axios.post(`${API_BASE_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });
    
    if (loginResponse.data.success || loginResponse.data.token) {
      authToken = loginResponse.data.data?.token || loginResponse.data.token;
      console.log('   ✅ Login successful\n');
      return true;
    } else {
      console.error('   ❌ Login failed:', loginResponse.data.message);
      return false;
    }
  } catch (error) {
    console.error('   ❌ Login error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Response:', error.response.data);
    }
    return false;
  }
}

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  UAT TEST: Chart Of Account Type Constraint                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Login first
  const loginSuccess = await login();
  if (!loginSuccess) {
    console.log('   Please ensure the server is running and credentials are correct:');
    console.log(`   Email: ${ADMIN_EMAIL}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    process.exit(1);
  }

  let testsPassed = 0;
  let testsFailed = 0;

  // Test Case 1: Account Number 5000 with Account Type "Revenue" - SHOULD BE REJECTED
  console.log('📋 Test Case 1: Account Number "5000" with Account Type "Revenue"');
  console.log('   Expected: REJECTED (5000s range must be Expense type)\n');
  
  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/accounting/chart-of-accounts`,
      {
        accountNo: '5000',
        accountName: 'Test Expense Account - Wrong Type',
        accountType: 'Revenue',
        financialStatement: 'Income Statement',
        isActive: true
      },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // If we get here, the test FAILED - it should have been rejected
    console.log('   ❌ TEST FAILED: Account was created but should have been rejected!');
    console.log('   Response:', JSON.stringify(response.data, null, 2));
    testsFailed++;
  } catch (error) {
    if (error.response && error.response.status === 400) {
      const message = error.response.data.message || '';
      if (message.includes('Account number conflict') || message.includes('5000s') || message.includes('Expense')) {
        console.log('   ✅ TEST PASSED: Account creation was correctly rejected');
        console.log('   Error message:', message);
        testsPassed++;
      } else {
        console.log('   ❌ TEST FAILED: Rejected but with wrong error message');
        console.log('   Error message:', message);
        testsFailed++;
      }
    } else {
      console.log('   ❌ TEST FAILED: Unexpected error:', error.message);
      testsFailed++;
    }
  }

  console.log('\n────────────────────────────────────────────────────────────────\n');

  // Test Case 2: Account Number 5001 with Account Type "Expense" - SHOULD BE ACCEPTED
  console.log('📋 Test Case 2: Account Number "5001-TEST-XXX" with Account Type "Expense"');
  console.log('   Expected: ACCEPTED (Account number matches account type)\n');
  
  try {
    const uniqueAccountNo = `5001-TEST-${Date.now()}`;
    const response = await axios.post(
      `${API_BASE_URL}/api/accounting/chart-of-accounts`,
      {
        accountNo: uniqueAccountNo,
        accountName: 'Test Expense Account - Correct Type',
        accountType: 'Expense',
        financialStatement: 'Income Statement',
        isActive: true
      },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (response.status === 201 || response.data.success) {
      console.log('   ✅ TEST PASSED: Account was correctly created');
      console.log('   Account ID:', response.data.data?.id || response.data.id || 'N/A');
      console.log('   Account Number:', uniqueAccountNo);
      
      // Clean up: Try to delete the test account
      if (response.data.data?.id || response.data.id) {
        const accountId = response.data.data?.id || response.data.id;
        try {
          await axios.delete(`${API_BASE_URL}/api/accounting/chart-of-accounts/${accountId}`, {
            headers: { 'Authorization': `Bearer ${authToken}` }
          });
          console.log('   🧹 Test account cleaned up');
        } catch (cleanupError) {
          console.log('   ⚠️  Could not cleanup test account (non-critical)');
        }
      }
      testsPassed++;
    } else {
      console.log('   ❌ TEST FAILED: Unexpected response');
      console.log('   Response:', JSON.stringify(response.data, null, 2));
      testsFailed++;
    }
  } catch (error) {
    console.log('   ❌ TEST FAILED: Account creation was rejected but should have been accepted');
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Error:', error.response.data.message || error.response.data);
    } else {
      console.log('   Error:', error.message);
    }
    testsFailed++;
  }

  console.log('\n────────────────────────────────────────────────────────────────\n');

  // Test Case 3: Additional validation test - Account Number 4000 with Expense (should fail)
  console.log('📋 Test Case 3: Account Number "4000" with Account Type "Expense"');
  console.log('   Expected: REJECTED (4000s range must be Revenue/Income type)\n');
  
  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/accounting/chart-of-accounts`,
      {
        accountNo: '4000',
        accountName: 'Test Revenue Account - Wrong Type',
        accountType: 'Expense',
        financialStatement: 'Income Statement',
        isActive: true
      },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // If we get here, the test FAILED
    console.log('   ❌ TEST FAILED: Account was created but should have been rejected!');
    console.log('   Response:', JSON.stringify(response.data, null, 2));
    testsFailed++;
  } catch (error) {
    if (error.response && error.response.status === 400) {
      const message = error.response.data.message || '';
      if (message.includes('Account number conflict') || message.includes('4000s') || message.includes('Revenue')) {
        console.log('   ✅ TEST PASSED: Account creation was correctly rejected');
        console.log('   Error message:', message);
        testsPassed++;
      } else {
        console.log('   ❌ TEST FAILED: Rejected but with wrong error message');
        console.log('   Error message:', message);
        testsFailed++;
      }
    } else {
      console.log('   ❌ TEST FAILED: Unexpected error:', error.message);
      testsFailed++;
    }
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

// Run the tests
runTests().catch(error => {
  console.error('Test execution error:', error);
  process.exit(1);
});
