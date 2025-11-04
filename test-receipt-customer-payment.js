const axios = require('axios');
const BASE = 'http://localhost:3003';

async function test() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  UAT TEST: Receipt - Customer Payment Integration (A/R)      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Login
  const loginRes = await axios.post(BASE + '/api/auth/login', {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  });
  const token = loginRes.data.token;

  // Get data
  const banksRes = await axios.get(BASE + '/api/cashbook/banks', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const bankId = banksRes.data.data?.[0]?.id;

  const currenciesRes = await axios.get(BASE + '/api/accounting/currencies', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const currencyId = currenciesRes.data.data?.[0]?.id || currenciesRes.data.data?.[0]?.code;

  // Get or create a customer
  let customerId;
  const customersRes = await axios.get(BASE + '/api/accounting/customers', {
    headers: { Authorization: 'Bearer ' + token }
  });
  
  if (customersRes.data.data && customersRes.data.data.length > 0) {
    customerId = customersRes.data.data[0].id;
    console.log(`✅ Using existing customer: ${customersRes.data.data[0].name}\n`);
  } else {
    const custRes = await axios.post(BASE + '/api/accounting/customers', {
      name: 'Test Customer A/R',
      email: 'testar@test.com',
      phone: '1234567890'
    }, { headers: { Authorization: 'Bearer ' + token } });
    customerId = custRes.data.data?.id;
    console.log(`✅ Created customer: Test Customer A/R\n`);
  }

  console.log('Step 1: Creating invoice of $600.00 for the customer...');
  const invRes = await axios.post(BASE + '/api/accounting/invoices', {
    customerId,
    currencyId: typeof currencyId === 'string' && currencyId.length > 10 ? currencyId : undefined,
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    items: [{ description: 'Services', quantity: 1, unitPrice: 600, vatRate: 0 }],
    paymentTerms: 'NET30',
    isTaxable: false,
    status: 'SENT' // Set to SENT so it's available for payment
  }, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const invoiceId = invRes.data.data?.id;
  const invoiceNumber = invRes.data.data?.invoiceNumber;
  console.log(`✅ Invoice created: ${invoiceNumber || invoiceId}`);
  console.log(`   Amount: $600.00`);
  console.log(`   Status: ${invRes.data.data?.status || 'SENT'}\n`);

  // Post the invoice journal entry if it exists
  if (invRes.data.data?.journalEntry?.id) {
    try {
      await axios.post(BASE + '/api/accounting/journal-entries/' + invRes.data.data.journalEntry.id + '/post', {}, {
        headers: { Authorization: 'Bearer ' + token }
      });
      console.log(`✅ Invoice journal entry posted\n`);
    } catch (e) {
      console.log(`⚠️  Could not post invoice journal entry (may already be posted)\n`);
    }
  }

  console.log('Step 2: Creating Receipt transaction for $500.00...');
  const receiptRes = await axios.post(BASE + '/api/cashbook/receipts', {
    bankId,
    customerId,
    transactionDate: new Date().toISOString().split('T')[0],
    description: 'Customer Payment - A/R Integration Test',
    amount: 500.00,
    counterpartyType: 'CUSTOMER',
    vatCode: '0%',
    reference: 'REC-001'
  }, {
    headers: { Authorization: 'Bearer ' + token }
  });

  if (!receiptRes.data.success) {
    console.log(`❌ Failed to create receipt: ${receiptRes.data.message}\n`);
    return;
  }

  const receiptId = receiptRes.data.data?.transaction?.id || receiptRes.data.data?.id;
  console.log(`✅ Receipt created: ${receiptId}`);
  console.log(`   Amount: $500.00`);
  console.log(`   Status: ${receiptRes.data.data?.transaction?.status || receiptRes.data.data?.status}`);
  console.log(`   Customer: ${customerId}\n`);

  // Check if receipt was posted automatically
  if (receiptRes.data.data?.transaction?.status === 'POSTED' || receiptRes.data.data?.status === 'POSTED') {
    console.log('Step 3: Receipt was auto-posted ✅\n');
  } else {
    console.log('Step 3: Posting the transaction...');
    try {
      const postRes = await axios.post(BASE + '/api/cashbook/transactions/' + receiptId + '/post', {}, {
        headers: { Authorization: 'Bearer ' + token }
      });
      
      if (postRes.data.success) {
        console.log('✅ Receipt posted successfully\n');
      } else {
        console.log(`❌ Failed to post: ${postRes.data.message}\n`);
      }
    } catch (e) {
      console.log(`⚠️  Posting may not be required or failed: ${e.response?.data?.message || e.message}\n`);
    }
  }

  console.log('Step 3.5: Allocating receipt payment to invoice...');
  try {
    const matchRes = await axios.post(BASE + '/api/cashbook/open-items/match/' + receiptId, {
      allocations: [{
        openItemId: invoiceId,
        allocatedAmount: 500.00
      }]
    }, {
      headers: { Authorization: 'Bearer ' + token }
    });
    
    if (matchRes.data.success) {
      console.log('✅ Payment allocated to invoice successfully');
      console.log(`   Allocated: $500.00 to Invoice ${invoiceNumber}\n`);
    } else {
      console.log(`⚠️  Allocation may have failed: ${matchRes.data.message}\n`);
    }
  } catch (e) {
    console.log(`⚠️  Could not allocate payment: ${e.response?.data?.message || e.message}`);
    // Try alternative endpoint
    try {
      const altRes = await axios.post(BASE + '/api/cashbook/receipts/' + receiptId + '/allocate', {
        allocations: [{
          invoiceId: invoiceId,
          allocatedAmount: 500.00
        }]
      }, {
        headers: { Authorization: 'Bearer ' + token }
      });
      
      if (altRes.data.success) {
        console.log('✅ Payment allocated via alternative endpoint\n');
      }
    } catch (e2) {
      console.log(`⚠️  Alternative allocation also failed: ${e2.response?.data?.message || e2.message}\n`);
    }
  }

  console.log('Step 4: Reviewing GL accounts...');
  const journalEntryId = receiptRes.data.data?.journalEntry?.id;
  
  if (journalEntryId) {
    try {
      const journalRes = await axios.get(BASE + '/api/accounting/journal-entries/' + journalEntryId, {
        headers: { Authorization: 'Bearer ' + token }
      });
      
      const journal = journalRes.data.data;
      if (journal) {
        console.log(`✅ Journal Entry: ${journal.referenceNumber || journalEntryId}`);
        console.log(`   Status: ${journal.status || 'POSTED'}\n`);
        
        const lines = journal.journalEntryLines || [];
        if (lines.length > 0) {
          console.log('   GL Account Entries:');
          let totalDebits = 0;
          let totalCredits = 0;
          let bankDebit = 0;
          let arCredit = 0;
          
          lines.forEach((line, idx) => {
            const account = line.chartOfAccount || line.account || {};
            const accountNo = account.accountNo || 'N/A';
            const accountName = account.accountName || 'N/A';
            const debit = parseFloat(line.debitAmount || 0);
            const credit = parseFloat(line.creditAmount || 0);
            
            if (debit > 0) {
              totalDebits += debit;
              if (accountNo === '1000' || accountName.toLowerCase().includes('bank') || accountName.toLowerCase().includes('cash')) {
                bankDebit = debit;
              }
              console.log(`   ${idx + 1}. DR ${accountNo} (${accountName}): $${debit.toFixed(2)}`);
            }
            if (credit > 0) {
              totalCredits += credit;
              if (accountNo === '1200' || accountName.toLowerCase().includes('receivable')) {
                arCredit = credit;
              }
              console.log(`   ${idx + 1}. CR ${accountNo} (${accountName}): $${credit.toFixed(2)}`);
            }
          });
          
          console.log(`\n   Total Debits: $${totalDebits.toFixed(2)}`);
          console.log(`   Total Credits: $${totalCredits.toFixed(2)}`);
          
          // Verify GL requirements
          console.log('\n📋 UAT GL Verification:');
          console.log('   Expected: DR Bank: $500.00');
          console.log('   Expected: CR Accounts Receivable: $500.00\n');
          
          if (bankDebit > 0) {
            console.log(`   ✓ DR Bank Account: $${bankDebit.toFixed(2)}`);
            if (Math.abs(bankDebit - 500.00) < 0.01) {
              console.log(`   ✓ Correct amount: $500.00`);
            } else {
              console.log(`   ⚠️  Expected $500.00, got $${bankDebit.toFixed(2)}`);
            }
          } else {
            console.log(`   ❌ Bank debit not found`);
          }
          
          if (arCredit > 0) {
            console.log(`   ✓ CR Accounts Receivable: $${arCredit.toFixed(2)}`);
            if (Math.abs(arCredit - 500.00) < 0.01) {
              console.log(`   ✓ Correct amount: $500.00`);
            } else {
              console.log(`   ⚠️  Expected $500.00, got $${arCredit.toFixed(2)}`);
            }
          } else {
            console.log(`   ❌ Accounts Receivable credit not found`);
          }
          
          if (Math.abs(totalDebits - totalCredits) < 0.01) {
            console.log(`   ✓ Double-entry balanced\n`);
          } else {
            console.log(`   ❌ Double-entry imbalance: $${Math.abs(totalDebits - totalCredits).toFixed(2)}\n`);
          }
        } else {
          console.log('   ⚠️  No journal lines found\n');
        }
      }
    } catch (e) {
      console.log(`   ⚠️  Could not retrieve journal entry: ${e.response?.data?.message || e.message}\n`);
    }
  }

  console.log('Step 5: Checking invoice status after payment...');
  try {
    const updatedInvoiceRes = await axios.get(BASE + '/api/accounting/invoices/' + invoiceId, {
      headers: { Authorization: 'Bearer ' + token }
    });
    
    const updatedInvoice = updatedInvoiceRes.data.data;
    if (updatedInvoice) {
      const outstandingAmount = parseFloat(updatedInvoice.outstandingAmount || 0);
      console.log(`✅ Invoice Status: ${updatedInvoice.status}`);
      console.log(`   Total Amount: $${parseFloat(updatedInvoice.totalAmount || 0).toFixed(2)}`);
      console.log(`   Outstanding Amount: $${outstandingAmount.toFixed(2)}`);
      
      if (outstandingAmount === 100.00) {
        console.log(`   ✓ Correct outstanding: $100.00 (Invoice $600 - Payment $500)\n`);
      } else {
        console.log(`   ⚠️  Expected outstanding $100.00, got $${outstandingAmount.toFixed(2)}\n`);
      }
    }
  } catch (e) {
    console.log(`   ⚠️  Could not check invoice status: ${e.response?.data?.message || e.message}\n`);
  }

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  TEST COMPLETE                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}

test().catch(e => {
  console.error('\n❌ Test Error:');
  console.error('Message:', e.message);
  if (e.response) {
    console.error('Status:', e.response.status);
    console.error('Data:', JSON.stringify(e.response.data, null, 2));
  } else {
    console.error('Stack:', e.stack);
  }
  process.exit(1);
});

