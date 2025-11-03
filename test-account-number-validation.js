// Test script to verify Account Number vs Account Type validation
// UAT Test Case: Chart Of Account Type Constraint

const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'YOUR_TOKEN_HERE'; // User needs to provide this

async function testAccountNumberValidation() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  TEST: Chart Of Account Type Constraint                       ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Test Case 1: Account Number 5000 with Account Type "Revenue" - SHOULD BE REJECTED
  console.log('📋 Test Case 1: Account Number 5000 with Account Type "Revenue"');
  console.log('   Expected: REJECTED (Account number in 5000s range must be Expense type)\n');
  
  try {
    const test1Response = await axios.post(
      `${BASE_URL}/api/accounting/chart-of-accounts`,
      {
        accountNo: '5000',
        accountName: 'Test Expense Account - Wrong Type',
        accountType: 'Revenue', // ❌ WRONG: 5000s should be Expense
        financialStatement: 'Income Statement',
        isActive: true
      },
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // If we get here, the test FAILED - it should have been rejected
    console.log('   ❌ TEST FAILED: Account was created but should have been rejected!');
    console.log('   Response:', test1Response.data);
    return false;
  } catch (error) {
    if (error.response && error.response.status === 400) {
      console.log('   ✅ TEST PASSED: Account creation was correctly rejected');
      console.log('   Error message:', error.response.data.message || error.response.data);
    } else {
      console.log('   ⚠️  Unexpected error:', error.message);
      return false;
    }
  }

  console.log('\n────────────────────────────────────────────────────────────────\n');

  // Test Case 2: Account Number 5000 with Account Type "Expense" - SHOULD BE ACCEPTED
  console.log('📋 Test Case 2: Account Number 5000 with Account Type "Expense"');
  console.log('   Expected: ACCEPTED (Account number matches account type)\n');
  
  try {
    const test2Response = await axios.post(
      `${BASE_URL}/api/accounting/chart-of-accounts`,
      {
        accountNo: `5000-TEST-${Date.now()}`, // Use timestamp to avoid conflicts
        accountName: 'Test Expense Account - Correct Type',
        accountType: 'Expense', // ✅ CORRECT: 5000s should be Expense
        financialStatement: 'Income Statement',
        isActive: true
      },
      {
        headers: {
          'Authorization': `Bearer ${AUTH_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (test2Response.status === 201 || test2Response.data.success) {
      console.log('   ✅ TEST PASSED: Account was correctly created');
      console.log('   Account ID:', test2Response.data.data?.id || 'N/A');
      
      // Clean up: Delete the test account
      if (test2Response.data.data?.id) {
        try {
          await axios.delete(
            `${BASE_URL}/api/accounting/chart-of-accounts/${test2Response.data.data.id}`,
            {
              headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`
              }
            }
          );
          console.log('   🧹 Test account cleaned up');
        } catch (cleanupError) {
          console.log('   ⚠️  Could not cleanup test account (non-critical)');
        }
      }
    } else {
      console.log('   ❌ TEST FAILED: Account should have been created');
      console.log('   Response:', test2Response.data);
      return false;
    }
  } catch (error) {
    if (error.response) {
      console.log('   ❌ TEST FAILED: Account creation was rejected but should have been accepted');
      console.log('   Status:', error.response.status);
      console.log('   Error:', error.response.data.message || error.response.data);
    } else {
      console.log('   ❌ TEST FAILED: Unexpected error:', error.message);
    }
    return false;
  }

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ ALL TESTS PASSED                                           ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  return true;
}

// Run the test
testAccountNumberValidation()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Test execution error:', error);
    process.exit(1);
  });

