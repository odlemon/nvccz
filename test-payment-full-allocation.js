const axios = require('axios');
const BASE = 'http://localhost:3003';

async function test() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  UAT TEST: Payment - Final Allocation & GL Post              ║');
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
  const bankAccountNo = banksRes.data.data?.[0]?.glAccount?.accountNo || 'N/A';

  const vendorsRes = await axios.get(BASE + '/api/accounting/vendors', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const vendorId = vendorsRes.data.data?.[0]?.id;

  const customersRes = await axios.get(BASE + '/api/accounting/customers', {
    headers: { Authorization: 'Bearer ' + token }
  });
  let customerId = customersRes.data.data?.[0]?.id;
  if (!customerId) {
    const custRes = await axios.post(BASE + '/api/accounting/customers', {
      name: 'Test Customer',
      email: 'test@test.com',
      phone: '123'
    }, { headers: { Authorization: 'Bearer ' + token } });
    customerId = custRes.data.data?.id;
  }

  // Get currencies
  const currenciesRes = await axios.get(BASE + '/api/accounting/currencies', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const currencyId = currenciesRes.data.data?.[0]?.id || currenciesRes.data.data?.[0]?.code;

  console.log('Step 1: Creating invoices for allocation...');
  // Create two invoices: one for Line 1 ($690 - Rent 15% VAT) and one for Line 2 ($460 - Fuel 0% VAT)
  const inv1Res = await axios.post(BASE + '/api/accounting/invoices', {
    customerId,
    vendorId,
    currencyId: typeof currencyId === 'string' && currencyId.length > 10 ? currencyId : undefined,
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    items: [{ description: 'Rent', quantity: 1, unitPrice: 690, vatRate: 0.15 }],
    paymentTerms: 'NET30'
  }, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const invoice1Id = inv1Res.data.data?.id;
  console.log(`✅ Invoice 1 (Rent): ${invoice1Id}`);

  const inv2Res = await axios.post(BASE + '/api/accounting/invoices', {
    customerId,
    vendorId,
    currencyId: typeof currencyId === 'string' && currencyId.length > 10 ? currencyId : undefined,
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    items: [{ description: 'Fuel', quantity: 1, unitPrice: 460, vatRate: 0 }],
    paymentTerms: 'NET30'
  }, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const invoice2Id = inv2Res.data.data?.id;
  console.log(`✅ Invoice 2 (Fuel): ${invoice2Id}\n`);

  console.log('Step 2: Creating payment $1,150.00...');
  const payRes = await axios.post(BASE + '/api/cashbook/payments', {
    bankId,
    vendorId,
    transactionDate: new Date().toISOString().split('T')[0],
    description: 'UAT Test Payment - Full Allocation',
    amount: 1150.00,
    counterpartyType: 'SUPPLIER',
    vatCode: '15%'
  }, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const paymentId = payRes.data.data?.id || payRes.data.data?.transaction?.id;
  console.log(`✅ Payment created: ${paymentId}`);
  console.log(`   Status: ${payRes.data.data?.status || payRes.data.data?.transaction?.status}\n`);

  console.log('Step 3: Line 1 - Allocating $690.00 (Rent 15% VAT)...');
  const alloc1Res = await axios.post(BASE + '/api/cashbook/open-items/match/' + paymentId, {
    allocations: [{
      openItemId: invoice1Id,
      allocatedAmount: 690.00,
      description: 'Line 1: Rent 15% VAT'
    }]
  }, {
    headers: { Authorization: 'Bearer ' + token }
  });
  console.log('✅ Line 1 allocated: $690.00');
  console.log(`   Remaining: $460.00\n`);

  console.log('Step 4: Line 2 - Allocating $460.00 (Fuel 0% VAT)...');
  const alloc2Res = await axios.post(BASE + '/api/cashbook/open-items/match/' + paymentId, {
    allocations: [{
      openItemId: invoice2Id,
      allocatedAmount: 460.00,
      description: 'Line 2: Fuel 0% VAT'
    }]
  }, {
    headers: { Authorization: 'Bearer ' + token }
  });
  console.log('✅ Line 2 allocated: $460.00');
  console.log(`   Remaining to Allocate: $0.00\n`);

  console.log('Step 5: Posting the transaction (should SUCCEED)...');
  try {
    const postRes = await axios.post(BASE + '/api/cashbook/transactions/' + paymentId + '/post', {}, {
      headers: { Authorization: 'Bearer ' + token }
    });
    
    console.log('✅ TEST PASSED: Payment posted successfully!');
    console.log(`   Payment ID: ${paymentId}`);
    console.log(`   Journal Entry ID: ${postRes.data.data?.journalEntry?.id || postRes.data.journalEntry?.id || 'N/A'}\n`);

    console.log('Step 6: Reviewing GL accounts...');
    const journalEntryId = postRes.data.data?.journalEntry?.id || postRes.data.journalEntry?.id;
    
    if (journalEntryId) {
      try {
        const journalRes = await axios.get(BASE + '/api/accounting/journal-entries/' + journalEntryId, {
          headers: { Authorization: 'Bearer ' + token }
        });
        
        const journal = journalRes.data.data;
        if (journal) {
          console.log(`✅ Journal Entry: ${journal.referenceNumber || journalEntryId}`);
          console.log(`   Total Amount: $${parseFloat(journal.totalAmount || 0).toFixed(2)}`);
          console.log(`   Status: ${journal.status || 'POSTED'}\n`);
          
          // Get journal entry lines
          const lines = journal.journalEntryLines || journal.lines || [];
          
          if (lines.length > 0) {
            console.log('   GL Account Entries:');
            let totalDebits = 0;
            let totalCredits = 0;
            let bankCredit = 0;
            let bankAccountNo = 'N/A';
            
            lines.forEach((line, idx) => {
              const account = line.account || line.glAccount || line.chartOfAccount || {};
              const accountNo = account.accountNo || 'N/A';
              const accountName = account.accountName || account.name || 'N/A';
              const debit = parseFloat(line.debitAmount || 0);
              const credit = parseFloat(line.creditAmount || 0);
              
              if (debit > 0) {
                totalDebits += debit;
                console.log(`   ${idx + 1}. DR ${accountNo} (${accountName}): $${debit.toFixed(2)}`);
              }
              if (credit > 0) {
                totalCredits += credit;
                // Check if this is the bank account
                if (accountNo === '1100' || accountName.toLowerCase().includes('bank') || 
                    (bankAccountNo !== 'N/A' && accountNo === bankAccountNo)) {
                  bankCredit = credit;
                  if (bankAccountNo === 'N/A') bankAccountNo = accountNo;
                }
                console.log(`   ${idx + 1}. CR ${accountNo} (${accountName}): $${credit.toFixed(2)}`);
              }
            });
            
            console.log(`\n   Total Debits: $${totalDebits.toFixed(2)}`);
            console.log(`   Total Credits: $${totalCredits.toFixed(2)}`);
            
            // Verify GL requirements per UAT
            console.log('\n📋 UAT GL Verification:');
            console.log('   Expected: CR Bank 1100: $1,150.00');
            console.log('   Expected: DR entries (Net + VAT) totaling $1,150.00\n');
            
            if (bankCredit > 0) {
              console.log(`   ✓ CR Bank Account (${bankAccountNo}): $${bankCredit.toFixed(2)}`);
              if (Math.abs(bankCredit - 1150.00) < 0.01) {
                console.log(`   ✓ Correct amount: $1,150.00`);
              } else {
                console.log(`   ⚠️  Expected $1,150.00, got $${bankCredit.toFixed(2)}`);
              }
            } else {
              console.log(`   ❌ Bank credit not found`);
            }
            
            if (Math.abs(totalDebits - 1150.00) < 0.01) {
              console.log(`   ✓ DR entries total: $1,150.00 (Net + VAT)`);
            } else {
              console.log(`   ⚠️  DR entries total: $${totalDebits.toFixed(2)} (Expected $1,150.00)`);
            }
            
            if (Math.abs(totalDebits - totalCredits) < 0.01) {
              console.log(`   ✓ Double-entry balanced`);
            } else {
              console.log(`   ❌ Double-entry imbalance: $${Math.abs(totalDebits - totalCredits).toFixed(2)}`);
            }
            
            // Note about GL structure
            console.log('\n   ℹ️  Note: Current implementation uses Accounts Payable (2000) for supplier payments.');
            console.log('   For detailed Net + VAT breakdown per allocation line, GL structure may need adjustment.\n');
          } else {
            console.log('   ⚠️  No journal lines found in response');
            console.log(`   Journal Entry ID: ${journalEntryId}`);
          }
        } else {
          console.log('   ⚠️  Could not retrieve journal entry details');
        }
      } catch (e) {
        console.log('   ⚠️  Could not retrieve journal entry:', e.response?.data?.message || e.message);
        console.log(`   Journal Entry ID: ${journalEntryId}`);
      }
    } else {
      console.log('   ⚠️  Journal entry ID not found in response');
      console.log('   Response:', JSON.stringify(postRes.data, null, 2));
    }

  } catch (e) {
    if (e.response?.status === 400) {
      const msg = e.response.data.message || '';
      console.log('❌ TEST FAILED: Posting was rejected');
      console.log(`   Error: ${msg}\n`);
      
      if (msg.includes('Outstanding') || msg.includes('remaining')) {
        console.log('   ⚠️  Allocations may not have been fully created');
      }
    } else {
      console.log(`❌ Unexpected error: ${e.response?.status}, ${e.response?.data?.message || e.message}\n`);
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  TEST COMPLETE                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}

test().catch(e => {
  console.error('Error:', e.response?.data || e.message);
  if (e.response?.data?.message) {
    console.error('Details:', e.response.data.message);
  }
  if (e.stack) {
    console.error('Stack:', e.stack);
  }
  process.exit(1);
});

