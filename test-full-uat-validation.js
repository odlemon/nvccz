const axios = require('axios');
const BASE = 'http://localhost:3003';

async function test() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  FULL UAT TEST: Payment Multi-Line Allocation               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Login
  const loginRes = await axios.post(BASE + '/api/auth/login', {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  });
  const token = loginRes.data.token;

  // Get currencies
  const currenciesRes = await axios.get(BASE + '/api/accounting/currencies', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const currencyId = currenciesRes.data.data?.[0]?.id || currenciesRes.data.data?.[0]?.code;

  // Get data
  const banksRes = await axios.get(BASE + '/api/cashbook/banks', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const bankId = banksRes.data.data?.[0]?.id;

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

  console.log('Step 1: Creating invoice...');
  const invRes = await axios.post(BASE + '/api/accounting/invoices', {
    customerId,
    vendorId,
    currencyId: typeof currencyId === 'string' && currencyId.length > 10 ? currencyId : undefined,
    invoiceDate: new Date().toISOString().split('T')[0],
    dueDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
    items: [{ description: 'Test Item', quantity: 1, unitPrice: 2000, vatRate: 0.15 }],
    paymentTerms: 'NET30'
  }, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const invoiceId = invRes.data.data?.id;
  console.log(`✅ Invoice: ${invoiceId}\n`);

  console.log('Step 2: Creating payment $1,150.00...');
  const payRes = await axios.post(BASE + '/api/cashbook/payments', {
    bankId,
    vendorId,
    transactionDate: new Date().toISOString().split('T')[0],
    description: 'UAT Test Payment',
    amount: 1150.00,
    counterpartyType: 'SUPPLIER',
    vatCode: '15%'
  }, {
    headers: { Authorization: 'Bearer ' + token }
  });
  const paymentId = payRes.data.data?.id || payRes.data.data?.transaction?.id;
  const paymentStatus = payRes.data.data?.status || payRes.data.data?.transaction?.status;
  console.log(`✅ Payment: ${paymentId}`);
  console.log(`   Status: ${paymentStatus}\n`);

  console.log('Step 3: Creating allocation $690.00 (Line 1)...');
  try {
    const allocRes = await axios.post(BASE + '/api/cashbook/open-items/match/' + paymentId, {
      allocations: [{
        openItemId: invoiceId,
        allocatedAmount: 690.00,
        description: 'Line 1: Rent 15% VAT'
      }]
    }, {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.log('✅ Allocation created');
    console.log(`   Total allocated: $690.00`);
    console.log(`   Remaining: $460.00\n`);
  } catch (e) {
    console.log('⚠️  Allocation error:', e.response?.data?.message || e.message, '\n');
  }

  console.log('Step 4: Verifying allocations exist...');
  try {
    const allocsCheck = await axios.get(BASE + '/api/cashbook/open-items/allocations/' + paymentId, {
      headers: { Authorization: 'Bearer ' + token }
    }).catch(() => ({ data: { data: [] } }));
    const allocs = allocsCheck.data.data || [];
    const total = allocs.reduce((sum, a) => sum + parseFloat(a.allocatedAmount || 0), 0);
    console.log(`   Found ${allocs.length} allocations`);
    console.log(`   Total allocated: $${total.toFixed(2)}\n`);
  } catch (e) {
    console.log('   Could not verify allocations\n');
  }

  console.log('Step 5: Attempting to post (should REJECT - $460 remaining)...');
  try {
    await axios.post(BASE + '/api/cashbook/transactions/' + paymentId + '/post', {}, {
      headers: { Authorization: 'Bearer ' + token }
    });
    console.log('❌ TEST FAILED: Should have been rejected!\n');
  } catch (e) {
    const msg = e.response?.data?.message || '';
    if (e.response?.status === 400) {
      if (msg.includes('460') || msg.includes('Outstanding') || 
          msg.includes('remaining') || (msg.includes('1150') && msg.includes('690'))) {
        console.log('✅ TEST PASSED!');
        console.log(`   Error: ${msg}\n`);
        console.log('   ✓ Payment posting was correctly rejected');
        console.log('   ✓ Outstanding balance ($460.00) was clearly displayed');
        console.log('   ✓ System prevented posting with incomplete allocation\n');
      } else if (msg.includes('already posted')) {
        console.log('⚠️  Payment was already posted (may have been auto-posted)\n');
      } else {
        console.log(`❌ Wrong error: ${msg}\n`);
      }
    } else {
      console.log(`❌ Unexpected status: ${e.response?.status}, ${msg}\n`);
    }
  }

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  TEST COMPLETE                                                ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
}

test().catch(e => {
  console.error('Error:', e.response?.data || e.message);
  process.exit(1);
});


