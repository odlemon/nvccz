const axios = require('axios');

const BASE_URL = 'http://localhost:3000/api';
let token = '';
let testData = {};

async function login() {
  console.log('\n🔐 Step 1: Authenticating...');
  try {
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });
    token = response.data.token || response.data.data?.token;
    if (!token) {
      console.error('❌ No token in response:', JSON.stringify(response.data, null, 2));
      return false;
    }
    console.log('✅ Authenticated successfully\n');
    return true;
  } catch (error) {
    if (error.code === 'ECONNREFUSED' || error.message.includes('connect')) {
      console.error('❌ Cannot connect to server. Is the server running on port 3000?');
      console.error('   Please start the server with: npm run dev');
    } else {
      console.error('❌ Authentication failed:', error.response?.data?.message || error.message);
    }
    return false;
  }
}

async function getTestData() {
  console.log('📋 Step 2: Getting test data (vendor, currency, expense account, bank)...');
  const headers = { Authorization: `Bearer ${token}` };
  
  try {
    // Get vendor
    const vendorsRes = await axios.get(`${BASE_URL}/accounting/vendors`, { headers, params: { limit: 1 } });
    const vendor = vendorsRes.data.data?.[0] || vendorsRes.data?.[0];
    if (!vendor) throw new Error('No vendor found');
    testData.vendorId = vendor.id;
    console.log(`   ✅ Vendor: ${vendor.name} (${vendor.id})`);

    // Get currency
    const currenciesRes = await axios.get(`${BASE_URL}/accounting/currencies`, { headers });
    const currency = (currenciesRes.data.data || currenciesRes.data || []).find(c => c.code === 'USD') || (currenciesRes.data.data || currenciesRes.data || [])[0];
    if (!currency) throw new Error('No currency found');
    testData.currencyId = currency.id;
    console.log(`   ✅ Currency: ${currency.code} (${currency.id})`);

    // Get expense account
    const accountsRes = await axios.get(`${BASE_URL}/accounting/chart-of-accounts`, { headers, params: { accountType: 'Expense', limit: 1 } });
    const expenseAccount = accountsRes.data.data?.[0] || accountsRes.data?.[0];
    if (!expenseAccount) throw new Error('No expense account found');
    testData.expenseAccountId = expenseAccount.id;
    console.log(`   ✅ Expense Account: ${expenseAccount.accountNo} - ${expenseAccount.accountName} (${expenseAccount.id})`);

    // Get bank
    let bank = null;
    try {
      const banksRes = await axios.get(`${BASE_URL}/cashbook/banks`, { headers });
      bank = (banksRes.data.data || banksRes.data || [])[0];
    } catch (e) {
      try {
        const banksRes = await axios.get(`${BASE_URL}/accounting/banks`, { headers, params: { limit: 1 } });
        bank = banksRes.data.data?.[0] || banksRes.data?.[0];
      } catch (e2) {
        throw new Error('No bank found');
      }
    }
    
    if (!bank) {
      throw new Error('No bank found');
    }
    testData.bankId = bank.id;
    console.log(`   ✅ Bank: ${bank.name} (${bank.id})`);

    console.log('');
    return true;
  } catch (error) {
    console.error('❌ Failed to get test data:', error.response?.data?.message || error.message);
    return false;
  }
}

async function createInvoice(invoiceNumber) {
  console.log(`\n📝 Creating invoice ${invoiceNumber}...`);
  const headers = { Authorization: `Bearer ${token}` };
  
  try {
    const response = await axios.post(
      `${BASE_URL}/accounting/purchase-invoices`,
      {
        vendorId: testData.vendorId,
        invoiceDate: new Date().toISOString(),
        currencyId: testData.currencyId,
        description: `Test Invoice ${invoiceNumber}`,
        items: [
          {
            itemName: `Item ${invoiceNumber}`,
            description: `Test item for ${invoiceNumber}`,
            quantity: 10,
            unitPrice: 100.00,
            unit: 'pieces',
            vatRate: 0.15
          }
        ],
        isTaxable: true,
        notes: `Test invoice for ${invoiceNumber} scenario`
      },
      { headers }
    );

    const invoice = response.data.data || response.data;
    console.log(`   ✅ Invoice created: ${invoice.invoiceNumber}`);
    console.log(`      Status: ${invoice.status}`);
    console.log(`      Total: $${invoice.totalAmount}`);
    return invoice;
  } catch (error) {
    console.error(`   ❌ Failed to create invoice:`, error.response?.data?.message || error.message);
    throw error;
  }
}

async function submitInvoice(invoiceId, paymentMethod, bankId = null) {
  console.log(`\n📤 Submitting invoice with payment method: ${paymentMethod}...`);
  const headers = { Authorization: `Bearer ${token}` };
  
  try {
    const payload = {
      paymentMethod,
      expenseAccountId: testData.expenseAccountId
    };
    
    if (paymentMethod === 'BANK' && bankId) {
      payload.bankId = bankId;
    }

    const response = await axios.post(
      `${BASE_URL}/accounting/purchase-invoices/${invoiceId}/submit`,
      payload,
      { headers }
    );

    const invoice = response.data.data || response.data;
    console.log(`   ✅ Invoice submitted successfully`);
    console.log(`      Status: ${invoice.status}`);
    console.log(`      Payment Method: ${invoice.paymentMethod}`);
    console.log(`      Payment Status: ${invoice.paymentStatus}`);
    console.log(`      Journal Entry ID: ${invoice.journalEntry?.id || invoice.journalEntryId}`);
    console.log(`      Journal Entry Ref: ${invoice.journalEntry?.referenceNumber || 'N/A'}`);
    
    return invoice;
  } catch (error) {
    console.error(`   ❌ Failed to submit invoice:`, error.response?.data?.message || error.message);
    if (error.response?.data) {
      console.error(`      Details:`, JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

async function payInvoice(invoiceId, paymentMethod, bankId = null) {
  console.log(`\n💳 Paying invoice with payment method: ${paymentMethod}...`);
  const headers = { Authorization: `Bearer ${token}` };
  
  try {
    const payload = {
      paymentMethod,
      paymentDate: new Date().toISOString(),
      paymentReference: `PAY-${Date.now()}`
    };
    
    if (paymentMethod === 'BANK' && bankId) {
      payload.bankId = bankId;
    }

    const response = await axios.post(
      `${BASE_URL}/accounting/purchase-invoices/${invoiceId}/pay`,
      payload,
      { headers }
    );

    const invoice = response.data.data || response.data;
    console.log(`   ✅ Invoice paid successfully`);
    console.log(`      Payment Status: ${invoice.paymentStatus}`);
    console.log(`      Paid Amount: $${invoice.paidAmount}`);
    console.log(`      Outstanding: $${invoice.outstandingAmount}`);
    console.log(`      Cashbook Entry ID: ${invoice.cashbookEntryId}`);
    
    return invoice;
  } catch (error) {
    console.error(`   ❌ Failed to pay invoice:`, error.response?.data?.message || error.message);
    if (error.response?.data) {
      console.error(`      Details:`, JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

async function verifyJournalEntry(journalEntryId, expectedLines) {
  console.log(`\n🔍 Verifying journal entry ${journalEntryId}...`);
  const headers = { Authorization: `Bearer ${token}` };
  
  try {
    const response = await axios.get(
      `${BASE_URL}/accounting/journal-entries/${journalEntryId}`,
      { headers }
    );

    const entry = response.data.data || response.data;
    const lines = entry.journalEntryLines || [];
    
    console.log(`   📊 Journal Entry: ${entry.referenceNumber}`);
    console.log(`      Status: ${entry.status}`);
    console.log(`      Total Amount: $${entry.totalAmount}`);
    console.log(`      Lines (${lines.length}):`);
    
    let totalDebit = 0;
    let totalCredit = 0;
    
    lines.forEach((line, idx) => {
      const debit = parseFloat(line.debitAmount || 0);
      const credit = parseFloat(line.creditAmount || 0);
      totalDebit += debit;
      totalCredit += credit;
      
      console.log(`         ${idx + 1}. ${line.chartOfAccount?.accountName || line.chartOfAccountId}`);
      console.log(`            Dr: $${debit.toFixed(2)} | Cr: $${credit.toFixed(2)}`);
      console.log(`            ${line.description}`);
    });
    
    console.log(`      Total Debit: $${totalDebit.toFixed(2)}`);
    console.log(`      Total Credit: $${totalCredit.toFixed(2)}`);
    console.log(`      Balanced: ${totalDebit === totalCredit ? '✅' : '❌'}`);
    
    // Verify expected lines
    if (expectedLines) {
      console.log(`   ✅ Verifying expected entries...`);
      expectedLines.forEach(expected => {
        const found = lines.find(line => 
          line.chartOfAccount?.accountName?.includes(expected.accountName) ||
          line.chartOfAccount?.accountNo === expected.accountNo
        );
        if (found) {
          const amount = parseFloat(found.debitAmount || found.creditAmount || 0);
          console.log(`      ✅ Found ${expected.accountName}: $${amount.toFixed(2)}`);
        } else {
          console.log(`      ❌ Missing ${expected.accountName}`);
        }
      });
    }
    
    return entry;
  } catch (error) {
    console.error(`   ❌ Failed to verify journal entry:`, error.response?.data?.message || error.message);
    return null;
  }
}

async function verifyCashbookEntry(cashbookEntryId) {
  console.log(`\n🔍 Verifying cashbook entry ${cashbookEntryId}...`);
  const headers = { Authorization: `Bearer ${token}` };
  
  try {
    const response = await axios.get(
      `${BASE_URL}/cashbook/entries/${cashbookEntryId}`,
      { headers }
    );

    const entry = response.data.data || response.data;
    
    console.log(`   💰 Cashbook Entry: ${entry.reference || entry.id}`);
    console.log(`      Type: ${entry.type}`);
    console.log(`      Amount: $${entry.amount}`);
    console.log(`      Status: ${entry.status}`);
    console.log(`      Journal Entry ID: ${entry.journalEntryId || 'N/A'}`);
    
    if (entry.journalEntryId) {
      await verifyJournalEntry(entry.journalEntryId, null);
    }
    
    return entry;
  } catch (error) {
    console.error(`   ❌ Failed to verify cashbook entry:`, error.response?.data?.message || error.message);
    return null;
  }
}

async function runTests() {
  console.log('🧪 ========================================');
  console.log('🧪 PURCHASE INVOICE - ALL SCENARIOS TEST');
  console.log('🧪 ========================================\n');

  if (!(await login())) {
    process.exit(1);
  }

  if (!(await getTestData())) {
    process.exit(1);
  }

  const results = {
    bank: { success: false, invoice: null },
    cash: { success: false, invoice: null },
    credit: { success: false, invoice: null },
    creditPaidBank: { success: false, invoice: null },
    creditPaidCash: { success: false, invoice: null }
  };

  try {
    // ============================================
    // SCENARIO 1: Submit with BANK payment
    // ============================================
    console.log('\n\n🏦 ========================================');
    console.log('🏦 SCENARIO 1: Submit with BANK payment');
    console.log('🏦 ========================================');
    
    const invoice1 = await createInvoice('BANK-001');
    results.bank.invoice = invoice1;
    
    const submitted1 = await submitInvoice(invoice1.id, 'BANK', testData.bankId);
    results.bank.success = submitted1.status === 'POSTED' && submitted1.paymentMethod === 'BANK';
    
    if (submitted1.journalEntryId) {
      await verifyJournalEntry(submitted1.journalEntryId, [
        { accountName: 'Expense', type: 'debit' },
        { accountName: 'VAT Input', type: 'debit' },
        { accountName: 'Bank', type: 'credit' }
      ]);
    }

    // ============================================
    // SCENARIO 2: Submit with CASH payment
    // ============================================
    console.log('\n\n💵 ========================================');
    console.log('💵 SCENARIO 2: Submit with CASH payment');
    console.log('💵 ========================================');
    
    const invoice2 = await createInvoice('CASH-001');
    results.cash.invoice = invoice2;
    
    const submitted2 = await submitInvoice(invoice2.id, 'CASH');
    results.cash.success = submitted2.status === 'POSTED' && submitted2.paymentMethod === 'CASH';
    
    if (submitted2.journalEntryId) {
      await verifyJournalEntry(submitted2.journalEntryId, [
        { accountName: 'Expense', type: 'debit' },
        { accountName: 'VAT Input', type: 'debit' },
        { accountName: 'Petty Cash', accountNo: '1030', type: 'credit' }
      ]);
    }

    // ============================================
    // SCENARIO 3: Submit with CREDIT payment
    // ============================================
    console.log('\n\n📋 ========================================');
    console.log('📋 SCENARIO 3: Submit with CREDIT payment');
    console.log('📋 ========================================');
    
    const invoice3 = await createInvoice('CREDIT-001');
    results.credit.invoice = invoice3;
    
    const submitted3 = await submitInvoice(invoice3.id, 'CREDIT');
    results.credit.success = submitted3.status === 'POSTED' && submitted3.paymentMethod === 'CREDIT';
    
    if (submitted3.journalEntryId) {
      await verifyJournalEntry(submitted3.journalEntryId, [
        { accountName: 'Expense', type: 'debit' },
        { accountName: 'VAT Input', type: 'debit' },
        { accountName: 'Accounts Payable', accountNo: '2000', type: 'credit' }
      ]);
    }

    // ============================================
    // SCENARIO 4: Pay CREDIT invoice with BANK
    // ============================================
    console.log('\n\n🏦💳 ========================================');
    console.log('🏦💳 SCENARIO 4: Pay CREDIT invoice with BANK');
    console.log('🏦💳 ========================================');
    
    const invoice4 = await createInvoice('CREDIT-BANK-001');
    
    const submitted4 = await submitInvoice(invoice4.id, 'CREDIT');
    results.creditPaidBank.invoice = submitted4;
    
    const paid4 = await payInvoice(submitted4.id, 'BANK', testData.bankId);
    results.creditPaidBank.success = paid4.paymentStatus === 'PAID';
    
    if (paid4.cashbookEntryId) {
      await verifyCashbookEntry(paid4.cashbookEntryId);
    }

    // ============================================
    // SCENARIO 5: Pay CREDIT invoice with CASH
    // ============================================
    console.log('\n\n💵💳 ========================================');
    console.log('💵💳 SCENARIO 5: Pay CREDIT invoice with CASH');
    console.log('💵💳 ========================================');
    
    const invoice5 = await createInvoice('CREDIT-CASH-001');
    
    const submitted5 = await submitInvoice(invoice5.id, 'CREDIT');
    results.creditPaidCash.invoice = submitted5;
    
    const paid5 = await payInvoice(submitted5.id, 'CASH');
    results.creditPaidCash.success = paid5.paymentStatus === 'PAID';
    
    if (paid5.cashbookEntryId) {
      await verifyCashbookEntry(paid5.cashbookEntryId);
    }

    // ============================================
    // SUMMARY
    // ============================================
    console.log('\n\n📊 ========================================');
    console.log('📊 TEST SUMMARY');
    console.log('📊 ========================================');
    console.log(`✅ BANK Submit: ${results.bank.success ? 'PASS' : 'FAIL'}`);
    console.log(`✅ CASH Submit: ${results.cash.success ? 'PASS' : 'FAIL'}`);
    console.log(`✅ CREDIT Submit: ${results.credit.success ? 'PASS' : 'FAIL'}`);
    console.log(`✅ CREDIT Pay (BANK): ${results.creditPaidBank.success ? 'PASS' : 'FAIL'}`);
    console.log(`✅ CREDIT Pay (CASH): ${results.creditPaidCash.success ? 'PASS' : 'FAIL'}`);
    
    const allPassed = Object.values(results).every(r => r.success);
    console.log(`\n${allPassed ? '✅' : '❌'} Overall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}\n`);

  } catch (error) {
    console.error('\n❌ Test execution failed:', error.message);
    if (error.response?.data) {
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

runTests().catch(console.error);

