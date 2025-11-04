// Test script for Payment Multi-Line Allocation Check
// UAT Test Case: Cashbook Module & Transaction Integration
// Run with: node test-payment-allocation-validation.js

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
    }, {
      headers: {
        'Content-Type': 'application/json'
      },
      validateStatus: function (status) {
        return status < 500; // Don't throw on 4xx errors
      }
    });
    
    if (loginResponse.status === 200 && (loginResponse.data.success || loginResponse.data.token)) {
      authToken = loginResponse.data.data?.token || loginResponse.data.token;
      console.log('   ✅ Login successful\n');
      return true;
    } else {
      console.error('   ❌ Login failed:', loginResponse.data?.message || 'Unknown error');
      console.error('   Status:', loginResponse.status);
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
  console.log('║  UAT TEST: Payment - Multi-Line Allocation Check             ║');
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

  // Test Case 1: Payment with Total Gross $1,150.00, Line 1 $690.00, Remaining $460.00
  // Expected: Should REJECT posting and show outstanding balance
  console.log('📋 Test Case 1: Payment Total $1,150.00, Allocation $690.00, Remaining $460.00');
  console.log('   Expected: REJECTED when attempting to post (outstanding balance $460.00)\n');
  
  try {
    // First, we need a vendor and bank account
    // For this test, we'll assume they exist or create them
    // Let's get existing data first
    console.log('   📊 Setting up test data...');
    
    // Get a bank account
    const banksResponse = await axios.get(`${API_BASE_URL}/api/cashbook/banks`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    let bankId;
    if (banksResponse.data.data && banksResponse.data.data.length > 0) {
      bankId = banksResponse.data.data[0].id;
    } else {
      console.log('   ⚠️  No bank accounts found. Please create a bank account first.');
      testsFailed++;
      return;
    }
    
    // Get a vendor
    const vendorsResponse = await axios.get(`${API_BASE_URL}/api/accounting/vendors`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    let vendorId;
    if (vendorsResponse.data.data && vendorsResponse.data.data.length > 0) {
      vendorId = vendorsResponse.data.data[0].id;
    } else {
      console.log('   ⚠️  No vendors found. Please create a vendor first.');
      testsFailed++;
      return;
    }
    
    // Get a vendor invoice
    const invoicesResponse = await axios.get(`${API_BASE_URL}/api/accounting/invoices?vendorId=${vendorId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    let invoiceId;
    if (invoicesResponse.data.data && invoicesResponse.data.data.length > 0) {
      invoiceId = invoicesResponse.data.data[0].id;
    } else {
      console.log('   ⚠️  No invoices found for vendor. Creating test scenario...');
      // We'll create a payment and try to allocate partially
      console.log('   ℹ️  Will create payment and attempt partial allocation...');
    }
    
    // Step 1: Create Payment transaction with Total Gross: $1,150.00
    console.log('\n   Step 1: Creating payment transaction with Total Gross: $1,150.00');
    const paymentResponse = await axios.post(
      `${API_BASE_URL}/api/cashbook/payments`,
      {
        bankId: bankId,
        transactionDate: new Date().toISOString().split('T')[0],
        description: 'Test Payment - Multi-Line Allocation',
        amount: 1150.00,
        counterpartyType: 'SUPPLIER',
        vendorId: vendorId,
        vatCode: '15%',
        isActive: true
      },
      {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!paymentResponse.data.success && !paymentResponse.data.data) {
      console.log('   ❌ Failed to create payment:', paymentResponse.data.message);
      testsFailed++;
      return;
    }

    const paymentId = paymentResponse.data.data?.id || paymentResponse.data.data?.transaction?.id;
    console.log(`   ✅ Payment created: ${paymentId}`);

    // Step 2: Create allocation line for $690.00
    console.log('\n   Step 2: Creating allocation line: $690.00');
    
    // We need an invoice to allocate to - let's create one or use existing
    if (!invoiceId) {
      // Try to create a test invoice or use a different approach
      console.log('   ⚠️  No invoice available for allocation. Skipping allocation step.');
      console.log('   ℹ️  Testing with zero allocations (should require full payment allocation)');
    } else {
      try {
        const allocationResponse = await axios.post(
          `${API_BASE_URL}/api/cashbook/open-items/match/${paymentId}`,
          {
            allocations: [
              {
                openItemId: invoiceId,
                allocatedAmount: 690.00,
                description: 'Line 1: Rent 15% VAT'
              }
            ]
          },
          {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (allocationResponse.data.success) {
          console.log('   ✅ Allocation created: $690.00');
        } else {
          console.log('   ⚠️  Allocation creation returned:', allocationResponse.data.message);
        }
      } catch (allocationError) {
        console.log('   ⚠️  Allocation creation failed (may not be required):', allocationError.response?.data?.message || allocationError.message);
      }
    }

    // Step 3: Attempt to post with remaining balance $460.00
    console.log('\n   Step 3: Attempting to post payment (should be rejected)');
    
    try {
      const postResponse = await axios.post(
        `${API_BASE_URL}/api/cashbook/transactions/${paymentId}/post`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      // If we get here, posting succeeded but it should have been rejected
      console.log('   ❌ TEST FAILED: Payment was posted but should have been rejected!');
      console.log('   Response:', JSON.stringify(postResponse.data, null, 2));
      testsFailed++;
      
      // Cleanup
      try {
        await axios.delete(`${API_BASE_URL}/api/cashbook/transactions/${paymentId}`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
      } catch (e) {}
      
    } catch (postError) {
      if (postError.response && postError.response.status === 400) {
        const message = postError.response.data.message || '';
        if (message.includes('Outstanding balance') || message.includes('remaining amount') || 
            message.includes('460') || message.includes('allocated amount')) {
          console.log('   ✅ TEST PASSED: Posting was correctly rejected');
          console.log('   Error message:', message);
          testsPassed++;
        } else {
          console.log('   ❌ TEST FAILED: Rejected but with wrong error message');
          console.log('   Error message:', message);
          testsFailed++;
        }
      } else {
        console.log('   ❌ TEST FAILED: Unexpected error:', postError.message);
        if (postError.response) {
          console.log('   Status:', postError.response.status);
          console.log('   Response:', postError.response.data);
        }
        testsFailed++;
      }
      
      // Cleanup
      try {
        await axios.delete(`${API_BASE_URL}/api/cashbook/transactions/${paymentId}`, {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
      } catch (e) {}
    }

  } catch (error) {
    console.log('   ❌ TEST FAILED: Unexpected error:', error.message);
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Response:', error.response.data);
    }
    testsFailed++;
  }

  console.log('\n────────────────────────────────────────────────────────────────\n');

  // Test Case 2: Payment with full allocation - should be ACCEPTED
  console.log('📋 Test Case 2: Payment Total $1,150.00, Full Allocation $1,150.00');
  console.log('   Expected: ACCEPTED when posting (fully allocated)\n');
  
  try {
    console.log('   📊 Setting up test data...');
    
    // Get bank and vendor (reuse from above)
    const banksRes = await axios.get(`${API_BASE_URL}/api/cashbook/banks`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const bankId = banksRes.data.data?.[0]?.id;
    
    const vendorsRes = await axios.get(`${API_BASE_URL}/api/accounting/vendors`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const vendorId = vendorsRes.data.data?.[0]?.id;
    
    if (!bankId || !vendorId) {
      console.log('   ⚠️  Missing test data. Skipping test case 2.');
      testsFailed++;
    } else {
      // Create payment
      const paymentRes = await axios.post(
        `${API_BASE_URL}/api/cashbook/payments`,
        {
          bankId: bankId,
          transactionDate: new Date().toISOString().split('T')[0],
          description: 'Test Payment - Fully Allocated',
          amount: 1150.00,
          counterpartyType: 'SUPPLIER',
          vendorId: vendorId,
          vatCode: '15%'
        },
        {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const paymentId2 = paymentRes.data.data?.id || paymentRes.data.data?.transaction?.id;
      
      // Get invoice and allocate full amount
      const invoicesRes = await axios.get(`${API_BASE_URL}/api/accounting/invoices?vendorId=${vendorId}`, {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      
      if (invoicesRes.data.data && invoicesRes.data.data.length > 0) {
        const invoiceId = invoicesRes.data.data[0].id;
        
        // Allocate full amount
        await axios.post(
          `${API_BASE_URL}/api/cashbook/open-items/match/${paymentId2}`,
          {
            allocations: [
              {
                openItemId: invoiceId,
                allocatedAmount: 1150.00,
                description: 'Full allocation'
              }
            ]
          },
          {
            headers: {
              'Authorization': `Bearer ${authToken}`,
              'Content-Type': 'application/json'
            }
          }
        );
        
        // Now try to post - should succeed
        const postRes = await axios.post(
          `${API_BASE_URL}/api/cashbook/transactions/${paymentId2}/post`,
          {},
          {
            headers: {
              'Authorization': `Bearer ${authToken}`
            }
          }
        );
        
        if (postRes.data.success || postRes.status === 200) {
          console.log('   ✅ TEST PASSED: Payment was correctly posted when fully allocated');
          testsPassed++;
          
          // Cleanup would delete the posted transaction, but let's leave it for verification
        } else {
          console.log('   ❌ TEST FAILED: Posting was rejected but should have been accepted');
          testsFailed++;
        }
      } else {
        console.log('   ⚠️  No invoices found. Skipping full allocation test.');
        testsFailed++;
      }
    }
  } catch (error) {
    console.log('   ❌ TEST FAILED:', error.response?.data?.message || error.message);
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

// Run the tests
runTests().catch(error => {
  console.error('Test execution error:', error);
  process.exit(1);
});

