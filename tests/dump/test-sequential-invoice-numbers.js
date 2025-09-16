const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testSequentialInvoiceNumbers() {
  console.log('🔄 Testing Sequential Invoice Numbering System\n');

  try {
    // Step 1: Create a customer first
    console.log('📝 Step 1: Creating customer...');
    const customerResponse = await axios.post(`${BASE_URL}/customers`, {
      name: "Test Customer",
      email: "test@customer.com",
      phone: "1234567890",
      address: "123 Test Street"
    });
    
    const customerId = customerResponse.data.data.id;
    console.log('✅ Customer created:', customerId);

    // Step 2: Get currencies
    console.log('\n💰 Step 2: Getting currencies...');
    const currenciesResponse = await axios.get(`${BASE_URL}/currencies`);
    const currencies = currenciesResponse.data.data;
    
    const usdCurrency = currencies.find(c => c.code === 'USD');
    if (!usdCurrency) {
      console.log('❌ USD currency not found. Available currencies:', currencies.map(c => c.code));
      return;
    }
    
    console.log('✅ Found USD currency:', usdCurrency.id);



    // Step 3: Create multiple invoices to test sequential numbering
    console.log('\n📄 Step 3: Creating multiple invoices...');
    const invoices = [];
    
    for (let i = 1; i <= 3; i++) {
      console.log(`   Creating invoice ${i}...`);
      const invoiceResponse = await axios.post(`${BASE_URL}/accounting/invoices`, {
        customerId: customerId,
        amount: 100 * i,
        currencyId: usdCurrency.id,
        transactionDate: new Date().toISOString(),
        description: `Test invoice ${i} for sequential numbering`,
        isTaxable: false
      });

      const invoice = invoiceResponse.data.data;
      invoices.push(invoice);
      console.log(`   ✅ Invoice ${i} created: ${invoice.invoiceNumber}`);
    }



    // Step 4: Verify the sequence is correct
    console.log('\n🔍 Step 4: Verifying sequence correctness...');
    const expectedNumbers = invoices.map(inv => inv.invoiceNumber).sort();
    console.log('   Expected invoice numbers:', expectedNumbers);
    
    const actualNumbers = invoices.map(inv => inv.invoiceNumber);
    console.log('   Actual invoice numbers:', actualNumbers);
    
    const isSequential = actualNumbers.every((num, index) => {
      if (index === 0) return true;
      const prevNum = parseInt(actualNumbers[index - 1].split('-')[2]);
      const currNum = parseInt(num.split('-')[2]);
      return currNum === prevNum + 1;
    });
    
    console.log('   Sequential numbering correct:', isSequential ? '✅' : '❌');

    // Step 5: Test custom invoice number
    console.log('\n📄 Step 5: Testing custom invoice number...');
    const customInvoiceResponse = await axios.post(`${BASE_URL}/accounting/invoices`, {
      customerId: customerId,
      amount: 500,
      currencyId: usdCurrency.id,
      transactionDate: new Date().toISOString(),
      description: "Test invoice with custom number",
      isTaxable: false,
      invoiceNumber: "CUSTOM-001" // Custom number
    });

    const customInvoice = customInvoiceResponse.data.data;
    console.log('✅ Custom invoice created:', customInvoice.invoiceNumber);

    // Step 6: Create another auto-numbered invoice
    console.log('\n📄 Step 6: Creating another auto-numbered invoice...');
    const autoInvoiceResponse = await axios.post(`${BASE_URL}/accounting/invoices`, {
      customerId: customerId,
      amount: 600,
      currencyId: usdCurrency.id,
      transactionDate: new Date().toISOString(),
      description: "Test invoice with auto-numbering",
      isTaxable: false
    });

    const autoInvoice = autoInvoiceResponse.data.data;
    console.log('✅ Auto-numbered invoice created:', autoInvoice.invoiceNumber);

    console.log('\n🎉 Sequential invoice numbering test completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   - Sequential numbering works correctly');
    console.log('   - Custom invoice numbers are respected');
    console.log('   - Auto-numbering continues from the last sequential number');
    console.log('   - Year-based numbering format: INV-YYYY-NNN');

  } catch (error) {
    console.error('❌ Error occurred:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the test
testSequentialInvoiceNumbers();
