const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testForexReconciliationUAT() {
  let token = '';
  let usdCurrency, zwlCurrency, customer, bankAccount;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 UAT TEST: Forex Reconciliation (USD Invoice → ZWL Payment)');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('Test Scenario:');
  console.log('  Day 1: Invoice issued in USD 1,000 at rate 320.00 = 320,000 ZWL');
  console.log('  Day 30: Payment received in ZWL 340,000 (rate 340.00)');
  console.log('  Expected Journal Entry:');
  console.log('    DR: Cash/Bank (340,000 ZWL)');
  console.log('    CR: Accounts Receivable (320,000 ZWL)');
  console.log('    CR: Foreign Exchange Gain (20,000 ZWL)\n');

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
    return;
  }

  // Step 2: Get currencies
  console.log('💱 Step 2: Getting currencies...');
  try {
    const currenciesRes = await axios.get(`${BASE_URL}/api/accounting/currencies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const currencies = currenciesRes.data.data || [];

    usdCurrency = currencies.find(c => c.code === 'USD');
    zwlCurrency = currencies.find(c => c.code === 'ZWL' || c.code === 'ZIG');

    if (!usdCurrency || !zwlCurrency) {
      console.log('❌ Required currencies not found');
      return;
    }

    console.log(`✅ USD: ${usdCurrency.code} - ID: ${usdCurrency.id}`);
    console.log(`✅ ZWL: ${zwlCurrency.code} - ID: ${zwlCurrency.id}\n`);
  } catch (error) {
    console.error('❌ Error getting currencies:', error.response?.data || error.message);
    return;
  }

  // Step 3: Get customer
  console.log('👤 Step 3: Getting test customer...');
  try {
    const customersRes = await axios.get(`${BASE_URL}/api/accounting/customers?limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const customers = customersRes.data.data?.customers || customersRes.data.data || [];
    
    if (customers.length === 0) {
      console.log('❌ No customers found. Please create a customer first.');
      return;
    }

    customer = customers[0];
    console.log(`✅ Using customer: ${customer.name} (ID: ${customer.id})\n`);
  } catch (error) {
    console.error('❌ Error getting customer:', error.response?.data || error.message);
    return;
  }

  // Step 4: Get bank account
  console.log('🏦 Step 4: Getting bank account...');
  try {
    const banksRes = await axios.get(`${BASE_URL}/api/cashbook/banks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const banks = banksRes.data.data || [];
    
    // Find ZWL bank account
    bankAccount = banks.find(b => b.currency?.code === 'ZWL' || b.currency?.code === 'ZIG');
    if (!bankAccount) {
      bankAccount = banks[0]; // Use first available
    }

    if (!bankAccount) {
      console.log('❌ No bank accounts found');
      return;
    }

    console.log(`✅ Using bank: ${bankAccount.name} (ID: ${bankAccount.id})\n`);
  } catch (error) {
    console.error('❌ Error getting bank:', error.response?.data || error.message);
    return;
  }

  // Step 5: Create invoice in USD (Day 1)
  const day1 = new Date();
  day1.setDate(day1.getDate() - 30);
  const rateDay1 = 320.00;
  const invoiceAmountUSD = 1000;
  const invoiceTotalZWL = invoiceAmountUSD * rateDay1; // 320,000 ZWL

  console.log('📄 Step 5: Creating invoice in USD (Day 1)...');
  console.log(`   Date: ${day1.toISOString().split('T')[0]}`);
  console.log(`   Amount: ${invoiceAmountUSD} USD`);
  console.log(`   Exchange Rate at Creation: ${rateDay1} (USD:ZWL)`);
  console.log(`   Original ZWL Value: ${invoiceTotalZWL.toFixed(2)} ZWL\n`);

  let invoice;
  try {
    const invoiceRes = await axios.post(
      `${BASE_URL}/api/accounting/invoices`,
      {
        customerId: customer.id,
        invoiceDate: day1.toISOString().split('T')[0],
        dueDate: new Date(day1.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        description: 'Test Invoice - USD to ZWL Payment',
        amount: invoiceAmountUSD,
        currencyId: usdCurrency.id,
        exchangeRateAtCreation: rateDay1,
        isTaxable: false,
        items: [
          {
            description: 'Test Service - USD Invoice',
            quantity: 1,
            unitPrice: invoiceAmountUSD
          }
        ]
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    invoice = invoiceRes.data.data;
    console.log(`✅ Invoice created: ${invoice.invoiceNumber || invoice.id}`);
    console.log(`   Invoice ID: ${invoice.id}`);
    console.log(`   Exchange Rate at Creation: ${invoice.exchangeRateAtCreation || 'N/A'}\n`);
  } catch (error) {
    console.error('❌ Error creating invoice:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    }
    return;
  }

  // Step 6: Process payment in ZWL (Day 30)
  const day30 = new Date();
  const rateDay30 = 340.00;
  const paymentAmountZWL = 340000; // Payment in ZWL

  console.log('💰 Step 6: Processing payment in ZWL (Day 30)...');
  console.log(`   Payment Date: ${day30.toISOString().split('T')[0]}`);
  console.log(`   Payment Amount: ${paymentAmountZWL.toFixed(2)} ZWL`);
  console.log(`   Exchange Rate at Payment: ${rateDay30} (USD:ZWL)`);
  console.log(`   Original ZWL Value: ${invoiceTotalZWL.toFixed(2)} ZWL`);
  console.log(`   Expected Forex Gain: ${(paymentAmountZWL - invoiceTotalZWL).toFixed(2)} ZWL\n`);

  try {
    const paymentRes = await axios.post(
      `${BASE_URL}/api/accounting/multi-currency/payments`,
      {
        invoiceId: invoice.id,
        paymentCurrencyId: zwlCurrency.id,
        paymentAmount: paymentAmountZWL,
        exchangeRate: rateDay30,
        paymentDate: day30.toISOString().split('T')[0]
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const paymentResult = paymentRes.data.data;
    console.log('✅ Payment processed successfully!\n');
    console.log('Payment Result:');
    console.log(`   Forex Gain/Loss ID: ${paymentResult.forexGainLoss?.id || 'N/A'}`);
    console.log(`   Gain/Loss Type: ${paymentResult.forexGainLoss?.gainLossType || 'N/A'}`);
    console.log(`   Gain/Loss Amount: ${parseFloat(paymentResult.forexGainLoss?.gainLossAmount || 0).toFixed(2)} ZWL`);
    console.log(`   Journal Entry ID: ${paymentResult.journalEntryId || 'N/A'}\n`);

    // Step 7: Verify journal entry
    if (paymentResult.journalEntryId) {
      console.log('📖 Step 7: Verifying Journal Entry...\n');
      const journalEntryRes = await axios.get(
        `${BASE_URL}/api/accounting/journal-entries/${paymentResult.journalEntryId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const journalEntry = journalEntryRes.data.data;
      const journalEntryData = journalEntry.journalEntry || journalEntry;
      const journalEntryLines = journalEntryData.journalEntryLines || journalEntry.journalEntryLines || [];

      console.log(`   Journal Entry: ${journalEntryData.referenceNumber || 'N/A'}`);
      console.log(`   Description: ${journalEntryData.description || 'N/A'}`);
      console.log(`   Status: ${journalEntryData.status || 'N/A'}\n`);

      console.log('   Journal Entry Lines:');
      let totalDebits = 0;
      let totalCredits = 0;
      let cashDebit = 0;
      let arCredit = 0;
      let forexCredit = 0;

      journalEntryLines.forEach((line, index) => {
        const debit = parseFloat(line.debitAmount || 0);
        const credit = parseFloat(line.creditAmount || 0);
        totalDebits += debit;
        totalCredits += credit;

        const accountNo = line.chartOfAccount?.accountNo || 'N/A';
        const accountName = line.chartOfAccount?.accountName || 'N/A';

        console.log(`   ${index + 1}. ${accountNo} - ${accountName}`);
        console.log(`      Debit: ${debit.toFixed(2)}`);
        console.log(`      Credit: ${credit.toFixed(2)}`);

        // Track specific accounts
        if (accountNo === '1100' || accountNo === '1000' || accountName.toLowerCase().includes('bank') || accountName.toLowerCase().includes('cash')) {
          cashDebit = debit;
        }
        if (accountNo === '1200' || accountName.toLowerCase().includes('receivable')) {
          arCredit = credit;
        }
        if (accountName.toLowerCase().includes('foreign exchange') || accountName.toLowerCase().includes('forex')) {
          forexCredit = credit;
        }
        console.log('');
      });

      console.log(`   Total Debits: ${totalDebits.toFixed(2)}`);
      console.log(`   Total Credits: ${totalCredits.toFixed(2)}`);
      console.log(`   Difference: ${Math.abs(totalDebits - totalCredits).toFixed(2)}\n`);

      // Step 8: Verify UAT requirements
      console.log('═══════════════════════════════════════════════════════════');
      console.log('✅ Step 8: Verifying UAT Requirements...');
      console.log('═══════════════════════════════════════════════════════════\n');

      let testPassed = true;

      // Check 1: Cash/Bank Debit = 340,000 ZWL
      console.log('1. Cash/Bank Debit:');
      if (Math.abs(cashDebit - paymentAmountZWL) < 0.01) {
        console.log(`   ✅ PASS: ${cashDebit.toFixed(2)} ZWL (Expected: ${paymentAmountZWL.toFixed(2)} ZWL)`);
      } else {
        console.log(`   ❌ FAIL: ${cashDebit.toFixed(2)} ZWL (Expected: ${paymentAmountZWL.toFixed(2)} ZWL)`);
        testPassed = false;
      }

      // Check 2: AR Credit = 320,000 ZWL
      console.log('\n2. Accounts Receivable Credit:');
      if (Math.abs(arCredit - invoiceTotalZWL) < 0.01) {
        console.log(`   ✅ PASS: ${arCredit.toFixed(2)} ZWL (Expected: ${invoiceTotalZWL.toFixed(2)} ZWL)`);
      } else {
        console.log(`   ❌ FAIL: ${arCredit.toFixed(2)} ZWL (Expected: ${invoiceTotalZWL.toFixed(2)} ZWL)`);
        testPassed = false;
      }

      // Check 3: Forex Gain Credit = 20,000 ZWL
      const expectedGain = paymentAmountZWL - invoiceTotalZWL;
      console.log('\n3. Foreign Exchange Gain Credit:');
      if (Math.abs(forexCredit - expectedGain) < 0.01) {
        console.log(`   ✅ PASS: ${forexCredit.toFixed(2)} ZWL (Expected: ${expectedGain.toFixed(2)} ZWL)`);
      } else {
        console.log(`   ❌ FAIL: ${forexCredit.toFixed(2)} ZWL (Expected: ${expectedGain.toFixed(2)} ZWL)`);
        testPassed = false;
      }

      // Check 4: Debits = Credits
      console.log('\n4. Debit = Credit Balance:');
      if (Math.abs(totalDebits - totalCredits) < 0.01) {
        console.log(`   ✅ PASS: ${totalDebits.toFixed(2)} = ${totalCredits.toFixed(2)}`);
      } else {
        console.log(`   ❌ FAIL: ${totalDebits.toFixed(2)} ≠ ${totalCredits.toFixed(2)}`);
        testPassed = false;
      }

      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('📋 TEST RESULT SUMMARY');
      console.log('═══════════════════════════════════════════════════════════\n');

      if (testPassed) {
        console.log('✅ TEST PASSED');
        console.log('   ✅ Cash/Bank debited correctly (340,000 ZWL)');
        console.log('   ✅ Accounts Receivable credited correctly (320,000 ZWL)');
        console.log('   ✅ Foreign Exchange Gain credited correctly (20,000 ZWL)');
        console.log('   ✅ Journal entry is balanced (Debits = Credits)');
        console.log('   ✅ Payment successfully cleared the liability with forex gain\n');
      } else {
        console.log('❌ TEST FAILED');
        console.log('   Some requirements were not met\n');
      }
    } else {
      console.log('❌ No journal entry found for verification');
    }

  } catch (error) {
    console.error('❌ Error processing payment:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    }
  }

  console.log('═══════════════════════════════════════════════════════════\n');
}

testForexReconciliationUAT();

