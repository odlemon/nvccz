const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testRealizedFXLossUAT() {
  let token = '';
  let testPassed = true;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 UAT TEST: Realized FX Loss on Creditor Bill Payment');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('Test Scenario:');
  console.log('  1. Create a Creditor Bill (Procurement Invoice) for 500 USD at Rate 50 (Base: ZIG 25,000)');
  console.log('  2. Record the Payment via Cashbook when the rate is 52');
  console.log('  Expected: System calculates Realized FX Loss (500 USD * 2 ZIG = 1,000 ZIG)');
  console.log('  Expected: Posted to Realized FX Loss GL Account (Expense)');
  console.log('  Expected: Close the Creditor at the Base amount of ZIG 25,000\n');

  // Step 1: Login
  console.log('🔐 Step 1: Logging in...');
  try {
    const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    token = loginRes.data.token;
    console.log('✅ Login successful\n');
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    testPassed = false;
    return;
  }

  // Step 2: Get currencies (USD and ZWL/ZIG)
  console.log('💱 Step 2: Getting currencies...');
  let usdCurrency, zwlCurrency;
  try {
    const currencyRes = await axios.get(`${BASE_URL}/api/accounting/currencies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    usdCurrency = currencyRes.data.data.find(c => c.code === 'USD');
    zwlCurrency = currencyRes.data.data.find(c => c.code === 'ZWL' || c.code === 'ZIG');

    if (!usdCurrency || !zwlCurrency) {
      console.error('❌ USD or ZWL/ZIG currency not found. Please ensure both exist.');
      testPassed = false;
      return;
    }
    console.log(`✅ Found USD: ${usdCurrency.code} - ID: ${usdCurrency.id}`);
    console.log(`✅ Found Base Currency: ${zwlCurrency.code} - ID: ${zwlCurrency.id}\n`);
  } catch (error) {
    console.error('❌ Failed to get currencies:', error.response?.data || error.message);
    testPassed = false;
    return;
  }

  // Step 3: Get or create a vendor
  console.log('🏢 Step 3: Getting or creating a vendor...');
  let vendor;
  try {
    const vendorsRes = await axios.get(`${BASE_URL}/api/cashbook/vendors?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const vendors = vendorsRes.data.data?.vendors || vendorsRes.data.data || [];
    if (vendors.length > 0) {
      vendor = vendors[0];
      console.log(`✅ Using existing vendor: ${vendor.name} (ID: ${vendor.id})\n`);
    } else {
      // Create a vendor
      const createVendorRes = await axios.post(`${BASE_URL}/api/procurement/vendors`, {
        name: 'Test Vendor - FX Loss UAT',
        email: 'testvendor@example.com',
        phone: '+1234567890',
        address: '123 Test Street',
        paymentTerms: 'Net 30',
        isActive: true
      }, { headers: { Authorization: `Bearer ${token}` } });
      vendor = createVendorRes.data.data;
      console.log(`✅ Created vendor: ${vendor.name} (ID: ${vendor.id})\n`);
    }
  } catch (error) {
    console.error('❌ Failed to get/create vendor:', error.response?.data || error.message);
    testPassed = false;
    return;
  }

  // Step 4: Create exchange rate for Day 1 (Rate 50)
  console.log('📊 Step 4: Creating/updating exchange rate for Day 1 (Rate 50)...');
  const day1 = new Date('2025-10-15T00:00:00.000Z');
  const rateDay1 = 50;
  try {
    const existingRatesRes = await axios.get(`${BASE_URL}/api/accounting/multi-currency/exchange-rates`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        fromCurrencyId: usdCurrency.id,
        toCurrencyId: zwlCurrency.id,
        dateFrom: day1.toISOString().split('T')[0],
        dateTo: day1.toISOString().split('T')[0],
      }
    });
    const existingRates = existingRatesRes.data.data.exchangeRates || [];
    const existingRateOnDay1 = existingRates.find(r => {
      const rateDateStr = new Date(r.date).toISOString().split('T')[0];
      const day1Str = day1.toISOString().split('T')[0];
      return rateDateStr === day1Str;
    });

    if (existingRateOnDay1 && Number(existingRateOnDay1.rate) !== rateDay1) {
      console.log(`   ⚠️  Exchange rate exists on ${day1.toISOString().split('T')[0]} but with different rate: ${existingRateOnDay1.rate}`);
      console.log(`   🔄 Updating existing rate to ${rateDay1}...`);
      await axios.put(`${BASE_URL}/api/accounting/multi-currency/exchange-rates/${existingRateOnDay1.id}`, {
        rate: rateDay1,
      }, { headers: { Authorization: `Bearer ${token}` } });
      console.log(`   ✅ Exchange rate updated to ${rateDay1} (${usdCurrency.code}:${zwlCurrency.code})`);
    } else if (!existingRateOnDay1) {
      await axios.post(`${BASE_URL}/api/accounting/multi-currency/exchange-rates`, {
        effectiveDate: day1.toISOString().split('T')[0],
        fromCurrencyId: usdCurrency.id,
        toCurrencyId: zwlCurrency.id,
        rate: rateDay1,
      }, { headers: { Authorization: `Bearer ${token}` } });
      console.log(`   ✅ Exchange rate created: ${rateDay1} (${usdCurrency.code}:${zwlCurrency.code})`);
    } else {
      console.log(`   ✅ Exchange rate already exists: ${rateDay1} (${usdCurrency.code}:${zwlCurrency.code})`);
    }
    console.log(`   Date: ${day1.toISOString().split('T')[0]}\n`);
  } catch (error) {
    console.error('❌ Failed to create/update exchange rate:', error.response?.data || error.message);
    testPassed = false;
    return;
  }

  // Step 5: Create Creditor Bill (Procurement Invoice) for 500 USD at Rate 50
  console.log('📝 Step 5: Creating Creditor Bill (Procurement Invoice) for 500 USD at Rate 50...');
  console.log('   Amount: 500 USD');
  console.log('   Exchange Rate: 50');
  console.log('   Base Currency Value: 25,000 ZIG\n');
  
  let procurementInvoice;
  try {
    const invoiceRes = await axios.post(`${BASE_URL}/api/procurement/invoices`, {
      vendorId: vendor.id,
      invoiceNumber: `INV-FX-${Date.now()}`,
      invoiceDate: day1.toISOString(),
      dueDate: new Date(day1.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      currencyId: usdCurrency.id,
      items: [
        {
          itemName: 'Test Item for FX Loss UAT',
          description: 'Test Item for FX Loss UAT',
          quantity: 1,
          unitPrice: 500,
          taxRate: 0,
          lineTotal: 500
        }
      ],
      subtotal: 500,
      taxAmount: 0,
      totalAmount: 500,
      status: 'DRAFT'
    }, { headers: { Authorization: `Bearer ${token}` } });
    
    procurementInvoice = invoiceRes.data.data;
    console.log(`   ✅ Procurement Invoice created: ${procurementInvoice.invoiceNumber}`);
    console.log(`   Invoice ID: ${procurementInvoice.id}`);
    console.log(`   Total Amount: ${procurementInvoice.totalAmount} ${usdCurrency.code}\n`);

    // Approve the invoice
    console.log('   📋 Approving invoice...');
    const approveRes = await axios.put(`${BASE_URL}/api/procurement/invoices/${procurementInvoice.id}/approve`, {}, {
      headers: { Authorization: `Bearer ${token}` }
    });
    procurementInvoice = approveRes.data.data;
    console.log(`   ✅ Invoice approved`);
    console.log(`   Status: ${procurementInvoice.status}`);
    console.log(`   Payment Status: ${procurementInvoice.paymentStatus}\n`);

    // Check if invoice has exchangeRateAtCreation
    if (procurementInvoice.exchangeRateAtCreation) {
      console.log(`   ✅ Invoice has exchangeRateAtCreation: ${procurementInvoice.exchangeRateAtCreation}`);
    } else {
      console.log(`   ⚠️  Invoice does NOT have exchangeRateAtCreation field`);
      console.log(`   ⚠️  This may need to be added to support multi-currency payments\n`);
    }

  } catch (error) {
    console.error('❌ Failed to create/approve procurement invoice:', error.response?.data || error.message);
    testPassed = false;
    return;
  }

  // Step 6: Create exchange rate for Day 30 (Rate 52)
  console.log('📊 Step 6: Creating/updating exchange rate for Day 30 (Rate 52)...');
  const day30 = new Date('2025-11-14T00:00:00.000Z');
  const rateDay30 = 52;
  try {
    const existingRatesRes = await axios.get(`${BASE_URL}/api/accounting/multi-currency/exchange-rates`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        fromCurrencyId: usdCurrency.id,
        toCurrencyId: zwlCurrency.id,
        dateFrom: day30.toISOString().split('T')[0],
        dateTo: day30.toISOString().split('T')[0],
      }
    });
    const existingRates = existingRatesRes.data.data.exchangeRates || [];
    const existingRateOnDay30 = existingRates.find(r => {
      const rateDateStr = new Date(r.date).toISOString().split('T')[0];
      const day30Str = day30.toISOString().split('T')[0];
      return rateDateStr === day30Str;
    });

    if (existingRateOnDay30 && Number(existingRateOnDay30.rate) !== rateDay30) {
      console.log(`   ⚠️  Exchange rate exists on ${day30.toISOString().split('T')[0]} but with different rate: ${existingRateOnDay30.rate}`);
      console.log(`   🔄 Updating existing rate to ${rateDay30}...`);
      await axios.put(`${BASE_URL}/api/accounting/multi-currency/exchange-rates/${existingRateOnDay30.id}`, {
        rate: rateDay30,
      }, { headers: { Authorization: `Bearer ${token}` } });
      console.log(`   ✅ Exchange rate updated to ${rateDay30} (${usdCurrency.code}:${zwlCurrency.code})`);
    } else if (!existingRateOnDay30) {
      await axios.post(`${BASE_URL}/api/accounting/multi-currency/exchange-rates`, {
        effectiveDate: day30.toISOString().split('T')[0],
        fromCurrencyId: usdCurrency.id,
        toCurrencyId: zwlCurrency.id,
        rate: rateDay30,
      }, { headers: { Authorization: `Bearer ${token}` } });
      console.log(`   ✅ Exchange rate created: ${rateDay30} (${usdCurrency.code}:${zwlCurrency.code})`);
    } else {
      console.log(`   ✅ Exchange rate already exists: ${rateDay30} (${usdCurrency.code}:${zwlCurrency.code})`);
    }
    console.log(`   Date: ${day30.toISOString().split('T')[0]}\n`);
  } catch (error) {
    console.error('❌ Failed to create/update exchange rate:', error.response?.data || error.message);
    testPassed = false;
    return;
  }

  // Step 7: Get a ZWL bank account for payment
  console.log('🏦 Step 7: Getting ZWL bank account for payment...');
  let zwlBank;
  try {
    const banksRes = await axios.get(`${BASE_URL}/api/cashbook/banks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const banks = banksRes.data.data || [];
    zwlBank = banks.find(b => b.currency?.code === 'ZWL' || b.currency?.code === 'ZIG');
    
    if (!zwlBank) {
      console.error('❌ ZWL/ZIG bank account not found. Please create one.');
      testPassed = false;
      return;
    }
    console.log(`✅ Found ZWL bank: ${zwlBank.name} (ID: ${zwlBank.id})\n`);
  } catch (error) {
    console.error('❌ Failed to get banks:', error.response?.data || error.message);
    testPassed = false;
    return;
  }

  // Step 8: Record Payment via Cashbook when the rate is 52
  console.log('💰 Step 8: Recording Payment via Cashbook at Rate 52...');
  console.log('   Invoice Amount: 500 USD');
  console.log('   Payment Rate: 52');
  console.log('   Payment Amount in ZWL: 26,000 ZIG (500 USD * 52)');
  console.log('   Original Base Amount: 25,000 ZIG (500 USD * 50)');
  console.log('   Expected Realized FX Loss: 1,000 ZIG (26,000 - 25,000)\n');
  
  try {
    // Payment amount in ZWL at rate 52
    const paymentAmountZWL = 500 * rateDay30; // 26,000 ZIG
    
    const paymentRes = await axios.post(`${BASE_URL}/api/cashbook/payments`, {
      bankId: zwlBank.id,
      transactionDate: day30.toISOString(),
      description: `Payment for ${procurementInvoice.invoiceNumber} - FX Loss Test`,
      amount: paymentAmountZWL,
      reference: `PAY-FX-${Date.now()}`,
      counterpartyType: 'SUPPLIER',
      vendorId: vendor.id,
      vatCode: '0%'
    }, { headers: { Authorization: `Bearer ${token}` } });

    const cashbookEntry = paymentRes.data.data.transaction || paymentRes.data.data;
    console.log(`   ✅ Cashbook payment created: ${cashbookEntry.id}`);
    console.log(`   Amount: ${cashbookEntry.amount} ${zwlCurrency.code}`);
    console.log(`   Status: ${cashbookEntry.status}\n`);

    // TODO: Check if payment automatically calculates realized FX loss
    // TODO: Verify journal entry includes Realized FX Loss account
    // TODO: Verify Accounts Payable is closed at base amount (25,000 ZIG)

  } catch (error) {
    console.error('❌ Failed to record payment:', error.response?.data || error.message);
    testPassed = false;
    return;
  }

  // Final Test Result
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📋 TEST RESULT SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');
  if (testPassed) {
    console.log('✅ TEST SETUP COMPLETE');
    console.log('   ✅ Creditor Bill created for 500 USD at Rate 50');
    console.log('   ✅ Payment recorded via Cashbook at Rate 52');
    console.log('   ⚠️  NOTE: Realized FX Loss calculation needs to be verified');
    console.log('   ⚠️  NOTE: Journal entry structure needs to be verified');
  } else {
    console.log('❌ TEST FAILED');
    console.log('   Some requirements were not met. Please review the errors above.');
  }
  console.log('═══════════════════════════════════════════════════════════');
}

testRealizedFXLossUAT();

