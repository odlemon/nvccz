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
      if (error.response?.data) {
        console.error('   Response:', JSON.stringify(error.response.data, null, 2));
      }
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

    // Get bank - try different endpoints
    let bank = null;
    try {
      const banksRes = await axios.get(`${BASE_URL}/accounting/banks`, { headers, params: { limit: 1 } });
      bank = banksRes.data.data?.[0] || banksRes.data?.[0];
    } catch (e) {
      // Try cashbook banks endpoint
      try {
        const banksRes = await axios.get(`${BASE_URL}/cashbook/banks`, { headers });
        bank = (banksRes.data.data || banksRes.data || [])[0];
      } catch (e2) {
        // Try to get from database directly via a test endpoint or use a known bank ID
        console.log('   ⚠️  Could not fetch bank via API, will try to use database query...');
      }
    }
    
    if (!bank) {
      // Try to get bank ID from a known account (1010 - Main Bank Account)
      try {
        const accountRes = await axios.get(`${BASE_URL}/accounting/chart-of-accounts`, { headers, params: { accountNo: '1010' } });
        const bankAccount = accountRes.data.data?.[0] || accountRes.data?.[0];
        if (bankAccount) {
          // We'll need to find the bank linked to this account
          // For now, let's just use a placeholder and handle it in the pay step
          console.log('   ⚠️  Bank API not available, will handle in payment step');
          testData.bankAccountNo = '1010';
        }
      } catch (e) {
        throw new Error('No bank found and could not get bank account');
      }
    } else {
      testData.bankId = bank.id;
      console.log(`   ✅ Bank: ${bank.name} (${bank.id})`);
    }

    console.log('');
    return true;
  } catch (error) {
    console.error('❌ Failed to get test data:', error.response?.data?.message || error.message);
    return false;
  }
}

async function createPurchaseInvoice() {
  console.log('📝 Step 3: Creating Purchase Invoice...');
  const headers = { Authorization: `Bearer ${token}` };
  
  try {
    const invoiceData = {
      vendorId: testData.vendorId,
      invoiceDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days from now
      currencyId: testData.currencyId,
      description: 'Test Purchase Invoice - Office Supplies',
      items: [
        {
          itemName: 'Office Chairs',
          description: 'Ergonomic office chairs',
          quantity: 5,
          unitPrice: 150.00,
          unit: 'pcs',
          vatRate: 0.15
        },
        {
          itemName: 'Desks',
          description: 'Standing desks',
          quantity: 3,
          unitPrice: 300.00,
          unit: 'pcs',
          vatRate: 0.15
        }
      ],
      isTaxable: true,
      notes: 'Test invoice for CRUD verification'
    };

    const response = await axios.post(`${BASE_URL}/accounting/purchase-invoices`, invoiceData, { headers });
    testData.invoiceId = response.data.data.id;
    const invoice = response.data.data;
    
    console.log(`   ✅ Invoice created: ${invoice.invoiceNumber}`);
    console.log(`      ID: ${invoice.id}`);
    console.log(`      Subtotal: $${Number(invoice.subtotal).toFixed(2)}`);
    console.log(`      VAT: $${Number(invoice.vatAmount).toFixed(2)}`);
    console.log(`      Total: $${Number(invoice.totalAmount).toFixed(2)}`);
    console.log(`      Status: ${invoice.status}`);
    console.log(`      Payment Status: ${invoice.paymentStatus}\n`);
    
    return true;
  } catch (error) {
    console.error('❌ Failed to create invoice:', error.response?.data?.message || error.message);
    if (error.response?.data) console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    return false;
  }
}

async function getPurchaseInvoice() {
  console.log('📖 Step 4: Getting Purchase Invoice...');
  const headers = { Authorization: `Bearer ${token}` };
  
  try {
    const response = await axios.get(`${BASE_URL}/accounting/purchase-invoices/${testData.invoiceId}`, { headers });
    const invoice = response.data.data;
    
    console.log(`   ✅ Invoice retrieved: ${invoice.invoiceNumber}`);
    console.log(`      Items: ${invoice.items?.length || 0}`);
    console.log(`      Vendor: ${invoice.vendor?.name}\n`);
    
    return true;
  } catch (error) {
    console.error('❌ Failed to get invoice:', error.response?.data?.message || error.message);
    return false;
  }
}

async function getAllPurchaseInvoices() {
  console.log('📚 Step 5: Getting All Purchase Invoices...');
  const headers = { Authorization: `Bearer ${token}` };
  
  try {
    const response = await axios.get(`${BASE_URL}/accounting/purchase-invoices`, { headers, params: { page: 1, limit: 10 } });
    const result = response.data.data;
    
    console.log(`   ✅ Retrieved ${result.invoices?.length || 0} invoices`);
    console.log(`      Total: ${result.total || 0}`);
    console.log(`      Page: ${result.page || 1}/${result.totalPages || 1}\n`);
    
    return true;
  } catch (error) {
    console.error('❌ Failed to get invoices:', error.response?.data?.message || error.message);
    return false;
  }
}

async function updatePurchaseInvoice() {
  console.log('✏️  Step 6: Updating Purchase Invoice...');
  const headers = { Authorization: `Bearer ${token}` };
  
  try {
    const updateData = {
      description: 'Updated: Test Purchase Invoice - Office Supplies and Equipment',
      items: [
        {
          itemName: 'Office Chairs',
          description: 'Ergonomic office chairs (updated)',
          quantity: 6, // Changed from 5
          unitPrice: 150.00,
          unit: 'pcs',
          vatRate: 0.15
        },
        {
          itemName: 'Desks',
          description: 'Standing desks',
          quantity: 3,
          unitPrice: 300.00,
          unit: 'pcs',
          vatRate: 0.15
        },
        {
          itemName: 'Monitors',
          description: '27" 4K monitors',
          quantity: 4,
          unitPrice: 250.00,
          unit: 'pcs',
          vatRate: 0.15
        }
      ],
      notes: 'Updated invoice with additional items'
    };

    const response = await axios.put(`${BASE_URL}/accounting/purchase-invoices/${testData.invoiceId}`, updateData, { headers });
    const invoice = response.data.data;
    
    console.log(`   ✅ Invoice updated: ${invoice.invoiceNumber}`);
    console.log(`      New Subtotal: $${Number(invoice.subtotal).toFixed(2)}`);
    console.log(`      New VAT: $${Number(invoice.vatAmount).toFixed(2)}`);
    console.log(`      New Total: $${Number(invoice.totalAmount).toFixed(2)}`);
    console.log(`      Items: ${invoice.items?.length || 0}\n`);
    
    return true;
  } catch (error) {
    console.error('❌ Failed to update invoice:', error.response?.data?.message || error.message);
    if (error.response?.data) console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    return false;
  }
}

async function markAsCredit() {
  console.log('💳 Step 7: Marking Invoice as Credit (Creating Accounts Payable Journal Entry)...');
  const headers = { Authorization: `Bearer ${token}` };
  
  try {
    const response = await axios.post(
      `${BASE_URL}/accounting/purchase-invoices/${testData.invoiceId}/mark-as-credit`,
      { expenseAccountId: testData.expenseAccountId },
      { headers }
    );
    const invoice = response.data.data;
    
    console.log(`   ✅ Invoice marked as credit`);
    console.log(`      Status: ${invoice.status}`);
    console.log(`      Payment Method: ${invoice.paymentMethod}`);
    
    if (invoice.journalEntry) {
      testData.journalEntryId = invoice.journalEntry.id;
      console.log(`      Journal Entry: ${invoice.journalEntry.referenceNumber}`);
      console.log(`      Journal Entry Status: ${invoice.journalEntry.status}`);
    }
    
    // Verify journal entry
    console.log('\n   📊 Verifying Journal Entry...');
    const jeResponse = await axios.get(`${BASE_URL}/accounting/journal-entries/${testData.journalEntryId}`, { headers });
    const journalEntry = jeResponse.data.data;
    
    console.log(`      ✅ Journal Entry Found: ${journalEntry.referenceNumber}`);
    console.log(`      Total Amount: $${Number(journalEntry.totalAmount).toFixed(2)}`);
    console.log(`      Status: ${journalEntry.status}`);
    console.log(`      Lines: ${journalEntry.journalEntryLines?.length || 0}`);
    
    if (journalEntry.journalEntryLines) {
      console.log('\n      Journal Entry Lines:');
      journalEntry.journalEntryLines.forEach((line, idx) => {
        const account = line.chartOfAccount;
        console.log(`        ${idx + 1}. ${account.accountNo} - ${account.accountName}`);
        console.log(`           Debit: $${Number(line.debitAmount).toFixed(2)}`);
        console.log(`           Credit: $${Number(line.creditAmount).toFixed(2)}`);
      });
      
      // Verify accounting equation
      const totalDebit = journalEntry.journalEntryLines.reduce((sum, line) => sum + Number(line.debitAmount), 0);
      const totalCredit = journalEntry.journalEntryLines.reduce((sum, line) => sum + Number(line.creditAmount), 0);
      console.log(`\n      📐 Accounting Equation Check:`);
      console.log(`         Total Debit: $${totalDebit.toFixed(2)}`);
      console.log(`         Total Credit: $${totalCredit.toFixed(2)}`);
      console.log(`         Balanced: ${Math.abs(totalDebit - totalCredit) < 0.01 ? '✅ YES' : '❌ NO'}`);
    }
    
    console.log('');
    return true;
  } catch (error) {
    console.error('❌ Failed to mark as credit:', error.response?.data?.message || error.message);
    if (error.response?.data) console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    return false;
  }
}

async function payInvoice() {
  console.log('💰 Step 8: Paying Invoice (Creating Cashbook Payment Entry)...');
  const headers = { Authorization: `Bearer ${token}` };
  
  try {
    // If we don't have bankId, try to get it from the bank account
    if (!testData.bankId && testData.bankAccountNo) {
      // Try to find bank linked to account 1010
      try {
        const { PrismaClient } = require('@prisma/client');
        const prisma = new PrismaClient();
        const bankAccount = await prisma.chartOfAccounts.findFirst({
          where: { accountNo: testData.bankAccountNo },
          include: { banks: true }
        });
        if (bankAccount?.banks?.[0]) {
          testData.bankId = bankAccount.banks[0].id;
          console.log(`   ✅ Found bank via account: ${bankAccount.banks[0].name} (${testData.bankId})`);
        }
        await prisma.$disconnect();
      } catch (e) {
        console.log('   ⚠️  Could not get bank from database, trying alternative method...');
      }
    }
    
    if (!testData.bankId) {
      throw new Error('Bank ID is required for payment');
    }
    
    const paymentData = {
      bankId: testData.bankId,
      paymentDate: new Date().toISOString(),
      paymentReference: `PAY-${Date.now()}`,
      notes: 'Payment for test purchase invoice'
    };

    const response = await axios.post(
      `${BASE_URL}/accounting/purchase-invoices/${testData.invoiceId}/pay`,
      paymentData,
      { headers }
    );
    const invoice = response.data.data;
    
    console.log(`   ✅ Invoice paid`);
    console.log(`      Payment Status: ${invoice.paymentStatus}`);
    console.log(`      Paid Amount: $${Number(invoice.paidAmount).toFixed(2)}`);
    console.log(`      Outstanding Amount: $${Number(invoice.outstandingAmount).toFixed(2)}`);
    
    if (invoice.cashbookEntryId) {
      testData.cashbookEntryId = invoice.cashbookEntryId;
      console.log(`      Cashbook Entry ID: ${invoice.cashbookEntryId}`);
      
      // Verify cashbook entry
      console.log('\n   📊 Verifying Cashbook Entry...');
      try {
        const cbResponse = await axios.get(`${BASE_URL}/accounting/cashbook/entries/${invoice.cashbookEntryId}`, { headers });
        const cashbookEntry = cbResponse.data.data;
        
        console.log(`      ✅ Cashbook Entry Found: ${cashbookEntry.id}`);
        console.log(`      Type: ${cashbookEntry.type}`);
        console.log(`      Amount: $${Number(cashbookEntry.amount).toFixed(2)}`);
        console.log(`      Status: ${cashbookEntry.status}`);
        
        if (cashbookEntry.journalEntryId) {
          console.log(`      Journal Entry ID: ${cashbookEntry.journalEntryId}`);
          
          // Verify payment journal entry
          const payJeResponse = await axios.get(`${BASE_URL}/accounting/journal-entries/${cashbookEntry.journalEntryId}`, { headers });
          const payJournalEntry = payJeResponse.data.data;
          
          console.log(`\n      📊 Payment Journal Entry: ${payJournalEntry.referenceNumber}`);
          console.log(`      Total Amount: $${Number(payJournalEntry.totalAmount).toFixed(2)}`);
          console.log(`      Status: ${payJournalEntry.status}`);
          
          if (payJournalEntry.journalEntryLines) {
            console.log('\n      Payment Journal Entry Lines:');
            payJournalEntry.journalEntryLines.forEach((line, idx) => {
              const account = line.chartOfAccount;
              console.log(`        ${idx + 1}. ${account.accountNo} - ${account.accountName}`);
              console.log(`           Debit: $${Number(line.debitAmount).toFixed(2)}`);
              console.log(`           Credit: $${Number(line.creditAmount).toFixed(2)}`);
            });
            
            // Verify accounting equation
            const totalDebit = payJournalEntry.journalEntryLines.reduce((sum, line) => sum + Number(line.debitAmount), 0);
            const totalCredit = payJournalEntry.journalEntryLines.reduce((sum, line) => sum + Number(line.creditAmount), 0);
            console.log(`\n      📐 Accounting Equation Check:`);
            console.log(`         Total Debit: $${totalDebit.toFixed(2)}`);
            console.log(`         Total Credit: $${totalCredit.toFixed(2)}`);
            console.log(`         Balanced: ${Math.abs(totalDebit - totalCredit) < 0.01 ? '✅ YES' : '❌ NO'}`);
          }
        }
      } catch (cbError) {
        console.log(`      ⚠️  Could not verify cashbook entry: ${cbError.response?.data?.message || cbError.message}`);
      }
    }
    
    console.log('');
    return true;
  } catch (error) {
    console.error('❌ Failed to pay invoice:', error.response?.data?.message || error.message);
    if (error.response?.data) console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    return false;
  }
}

async function runTests() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🧪 PURCHASE INVOICE CRUD & JOURNAL ENTRY VERIFICATION TEST');
  console.log('═══════════════════════════════════════════════════════════════');
  
  if (!(await login())) return;
  if (!(await getTestData())) return;
  if (!(await createPurchaseInvoice())) return;
  if (!(await getPurchaseInvoice())) return;
  if (!(await getAllPurchaseInvoices())) return;
  if (!(await updatePurchaseInvoice())) return;
  if (!(await markAsCredit())) return;
  if (!(await payInvoice())) return;
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('✅ ALL TESTS PASSED!');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n📋 Summary:');
  console.log(`   Invoice ID: ${testData.invoiceId}`);
  console.log(`   Credit Journal Entry ID: ${testData.journalEntryId || 'N/A'}`);
  console.log(`   Cashbook Entry ID: ${testData.cashbookEntryId || 'N/A'}`);
  console.log('');
}

runTests().catch(console.error);

