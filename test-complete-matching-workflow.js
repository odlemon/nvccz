const axios = require('axios');

async function testCompleteMatchingWorkflow() {
  try {
    // 1. Login to get token
    console.log('🔐 Logging in...');
    const loginResponse = await axios.post('http://localhost:3000/api/auth/login', {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Login successful');
    
    // 2. Get required IDs from database
    console.log('\n📋 Getting required IDs...');
    
    // Get currency ID
    const currenciesResponse = await axios.get('http://localhost:3000/api/currencies', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const currencyId = currenciesResponse.data.data[0].id;
    console.log('Currency ID:', currencyId);
    
    // Get bank ID
    const banksResponse = await axios.get('http://localhost:3000/api/banks', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const bankId = banksResponse.data.data[0].id;
    console.log('Bank ID:', bankId);
    
    // 3. Create test invoice using the invoice creation endpoint
    console.log('\n📄 Creating test invoice...');
    
    const invoiceData = {
      customerId: 'cmh3c7w4n0002uni4ocnxvljv', // Legal Associates
      amount: 1000.00,
      vatAmount: 150.00,
      totalAmount: 1150.00,
      currencyId: currencyId,
      transactionDate: '2025-10-01',
      description: 'Test Invoice for Matching',
      invoiceNumber: 'INV-MATCH-001',
      isTaxable: true,
      dueDate: '2025-10-31'
    };
    
    try {
      const invoiceResponse = await axios.post('http://localhost:3000/api/invoices', invoiceData, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Invoice created:', invoiceResponse.data);
      const invoiceId = invoiceResponse.data.data.id;
      
      // 4. Create test cashbook entry (payment)
      console.log('\n💰 Creating test cashbook entry...');
      
      const cashbookData = {
        bankId: bankId,
        transactionDate: '2025-10-26',
        description: 'Test Payment for Matching',
        amount: 500.00,
        type: 'RECEIPT',
        reference: 'PAY-MATCH-001',
        status: 'POSTED',
        counterpartyType: 'CUSTOMER',
        customerId: 'cmh3c7w4n0002uni4ocnxvljv'
      };
      
      const cashbookResponse = await axios.post('http://localhost:3000/api/cashbook', cashbookData, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Cashbook entry created:', cashbookResponse.data);
      const paymentId = cashbookResponse.data.data.id;
      
      // 5. Test open items - should now show the invoice
      console.log('\n🔍 Testing Open Items - Customer...');
      const openItemsResponse = await axios.get(`http://localhost:3000/api/cashbook/open-items/customers/cmh3c7w4n0002uni4ocnxvljv`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('Open Items:', JSON.stringify(openItemsResponse.data, null, 2));
      
      // 6. Test matching payment to invoice
      console.log('\n🔗 Testing Payment Matching...');
      
      const matchData = {
        paymentId: paymentId,
        allocations: [
          {
            openItemId: invoiceId,
            allocatedAmount: 500.00,
            discountAmount: 0.00,
            description: 'Partial payment for INV-MATCH-001'
          }
        ]
      };
      
      const matchResponse = await axios.post('http://localhost:3000/api/cashbook/open-items/match', matchData, {
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      console.log('✅ Matching successful:', JSON.stringify(matchResponse.data, null, 2));
      
      // 7. Verify payment allocations
      console.log('\n📊 Verifying Payment Allocations...');
      const allocationsResponse = await axios.get(`http://localhost:3000/api/cashbook/open-items/allocations/${paymentId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('Payment Allocations:', JSON.stringify(allocationsResponse.data, null, 2));
      
      // 8. Check open items again - should show reduced amount
      console.log('\n🔍 Checking Open Items After Matching...');
      const openItemsAfterResponse = await axios.get(`http://localhost:3000/api/cashbook/open-items/customers/cmh3c7w4n0002uni4ocnxvljv`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('Open Items After Matching:', JSON.stringify(openItemsAfterResponse.data, null, 2));
      
      console.log('\n✅ Complete matching workflow test successful!');
      
    } catch (createError) {
      console.log('❌ Error creating test data:', createError.response?.data || createError.message);
      
      // If invoice creation fails, let's try a different approach
      console.log('\n🔄 Trying alternative approach...');
      
      // Check if there are existing invoices
      console.log('\n🔍 Checking existing invoices...');
      const existingInvoicesResponse = await axios.get('http://localhost:3000/api/invoices', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('Existing invoices:', JSON.stringify(existingInvoicesResponse.data, null, 2));
      
      // Check existing cashbook entries
      console.log('\n🔍 Checking existing cashbook entries...');
      const existingCashbookResponse = await axios.get('http://localhost:3000/api/cashbook', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      console.log('Existing cashbook entries:', JSON.stringify(existingCashbookResponse.data, null, 2));
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
  }
}

testCompleteMatchingWorkflow();

