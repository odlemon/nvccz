/**
 * Test Control Account Integration
 * This script tests the new control account integration functionality
 */

const API_BASE = 'https://nvccz-pi.vercel.app/api';

async function testControlAccountIntegration() {
  console.log('🧪 Testing Control Account Integration...\n');
  
  try {
    // Test 1: Get customer payment summary
    console.log('1️⃣ Testing customer payment summary...');
    const customerId = 'cmh3c8jk60000un0ke5broxit'; // ABC Investment Fund
    const customerSummaryResponse = await fetch(`${API_BASE}/cashbook/customers/${customerId}/payment-summary`);
    
    if (customerSummaryResponse.ok) {
      const customerSummary = await customerSummaryResponse.json();
      console.log('✅ Customer payment summary:', customerSummary.data);
    } else {
      console.log('❌ Customer payment summary failed:', customerSummaryResponse.status);
    }
    
    // Test 2: Get supplier payment summary
    console.log('\n2️⃣ Testing supplier payment summary...');
    const vendorId = 'cmh3c8jk60000un0ke5broxit'; // Using same ID for testing
    const supplierSummaryResponse = await fetch(`${API_BASE}/cashbook/suppliers/${vendorId}/payment-summary`);
    
    if (supplierSummaryResponse.ok) {
      const supplierSummary = await supplierSummaryResponse.json();
      console.log('✅ Supplier payment summary:', supplierSummary.data);
    } else {
      console.log('❌ Supplier payment summary failed:', supplierSummaryResponse.status);
    }
    
    // Test 3: Test cashbook entry creation with control account integration
    console.log('\n3️⃣ Testing cashbook entry creation with control account integration...');
    
    // First, let's get a valid bank ID
    const banksResponse = await fetch(`${API_BASE}/cashbook/banks`);
    if (banksResponse.ok) {
      const banks = await banksResponse.json();
      if (banks.data && banks.data.length > 0) {
        const bankId = banks.data[0].id;
        console.log(`📊 Using bank ID: ${bankId}`);
        
        // Create a test customer receipt
        const testReceipt = {
          bankId: bankId,
          transactionDate: new Date().toISOString(),
          description: 'Test Control Account Integration - Customer Payment',
          amount: 1000,
          reference: 'TEST-CTRL-001',
          counterpartyType: 'CUSTOMER',
          customerId: customerId,
          createdById: 'cmh3by4p40002unl07zgzpgrb' // Admin user
        };
        
        console.log('📝 Creating test customer receipt...');
        const receiptResponse = await fetch(`${API_BASE}/cashbook/receipts`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer your-token-here' // Replace with actual token
          },
          body: JSON.stringify(testReceipt)
        });
        
        if (receiptResponse.ok) {
          const receiptResult = await receiptResponse.json();
          console.log('✅ Customer receipt created with control account integration:', {
            transactionId: receiptResult.data?.transaction?.id,
            controlAccountResult: receiptResult.data?.controlAccountResult
          });
        } else {
          console.log('❌ Customer receipt creation failed:', receiptResponse.status);
          const error = await receiptResponse.text();
          console.log('Error details:', error);
        }
      }
    }
    
    console.log('\n🎉 Control Account Integration test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run the test
testControlAccountIntegration();
