const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';

async function testCurrencyConversion() {
  console.log('🔄 Testing Currency Conversion Functionality\n');

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
    const eurCurrency = currencies.find(c => c.code === 'EUR');
    
    if (!usdCurrency || !eurCurrency) {
      console.log('❌ USD or EUR currency not found. Available currencies:', currencies.map(c => c.code));
      return;
    }
    
    console.log('✅ Found currencies - USD:', usdCurrency.id, 'EUR:', eurCurrency.id);

    // Step 3: Create invoice in EUR with exchange rate
    console.log('\n📄 Step 3: Creating invoice in EUR...');
    const invoiceResponse = await axios.post(`${BASE_URL}/invoices`, {
      customerId: customerId,
      amount: 1000,
      currencyId: eurCurrency.id,
      transactionDate: new Date().toISOString(),
      description: "Test invoice with currency conversion",
      isTaxable: false,
      exchangeRateAtCreation: 1.15 // EUR to USD rate when invoice was created
    });

    const invoice = invoiceResponse.data.data;
    console.log('✅ Invoice created:', invoice.id);
    console.log('   Amount:', invoice.amount, 'EUR');
    console.log('   Exchange Rate at Creation:', invoice.exchangeRateAtCreation);
    console.log('   Status:', invoice.status);

    // Step 4: Send the invoice
    console.log('\n📤 Step 4: Sending invoice...');
    await axios.patch(`${BASE_URL}/invoices/${invoice.id}/send`);
    console.log('✅ Invoice sent');

    // Step 5: Mark as paid in USD (different currency)
    console.log('\n💳 Step 5: Marking as paid in USD...');
    const paymentResponse = await axios.patch(`${BASE_URL}/invoices/${invoice.id}/mark-as-paid`, {
      paymentMethod: "BANK",
      paymentCurrencyId: usdCurrency.id,
  
    });

    const paidInvoice = paymentResponse.data.data;
    console.log('✅ Invoice marked as paid!');
    console.log('   Original Amount:', paidInvoice.amount, 'EUR');
    console.log('   Payment Currency:', paidInvoice.paymentCurrency?.code);
    console.log('   Amount in Payment Currency:', paidInvoice.amountInPaymentCurrency, 'USD');
  
    console.log('   Payment Date:', paidInvoice.paymentDate);

    // Step 6: Verify the conversion calculation
    console.log('\n🧮 Step 6: Verifying conversion calculation...');
    const expectedAmount = 1000 * 1.15; // EUR amount * rate at creation
    const actualAmount = Number(paidInvoice.amountInPaymentCurrency);
    
    console.log('   Expected amount in USD:', expectedAmount);
    console.log('   Actual amount in USD:', actualAmount);
    console.log('   Conversion correct:', Math.abs(expectedAmount - actualAmount) < 0.01 ? '✅' : '❌');

    // Step 7: Test same currency payment (no conversion)
    console.log('\n🔄 Step 7: Testing same currency payment...');
    const invoice2Response = await axios.post(`${BASE_URL}/invoices`, {
      customerId: customerId,
      amount: 500,
      currencyId: usdCurrency.id,
      transactionDate: new Date().toISOString(),
      description: "Test invoice in USD",
      isTaxable: false
    });

    const invoice2 = invoice2Response.data.data;
    await axios.patch(`${BASE_URL}/invoices/${invoice2.id}/send`);
    
    const payment2Response = await axios.patch(`${BASE_URL}/invoices/${invoice2.id}/mark-as-paid`, {
      paymentMethod: "CASH",
      paymentCurrencyId: usdCurrency.id // Same currency
    });

    const paidInvoice2 = payment2Response.data.data;
    console.log('✅ Same currency payment completed');
    console.log('   Amount:', paidInvoice2.amount, 'USD');
    console.log('   Payment Currency:', paidInvoice2.paymentCurrency?.code);
    console.log('   Amount in Payment Currency:', paidInvoice2.amountInPaymentCurrency);
    console.log('   No conversion needed:', paidInvoice2.amountInPaymentCurrency === null ? '✅' : '❌');

    console.log('\n🎉 Currency conversion test completed successfully!');

  } catch (error) {
    console.error('❌ Error occurred:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

// Run the test
testCurrencyConversion();

