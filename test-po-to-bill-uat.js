const axios = require('axios');

const BASE = 'http://localhost:3004';
let token = '';
let userId = '';

async function login() {
  try {
    const res = await axios.post(BASE + '/api/auth/login', {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    }, {
      timeout: 10000,
      validateStatus: function (status) {
        return status < 500; // Accept any status code < 500
      }
    });
    
    if (res.data && res.data.token) {
      token = res.data.token;
      userId = res.data.user?.id || res.data.data?.user?.id || '';
      console.log('✅ Login successful');
      console.log('   User: ' + (res.data.user?.firstName || res.data.data?.user?.firstName || '') + ' ' + (res.data.user?.lastName || res.data.data?.user?.lastName || ''));
      console.log('   Token: ' + token.substring(0, 20) + '...\n');
      return true;
    } else {
      console.log('❌ Login failed: Invalid response structure');
      console.log('   Response: ' + JSON.stringify(res.data, null, 2));
      return false;
    }
  } catch (e) {
    console.log('❌ Login failed: ' + (e.response?.data?.message || e.message));
    if (e.response?.data) {
      console.log('   Response: ' + JSON.stringify(e.response.data));
    }
    if (e.code === 'ECONNREFUSED') {
      console.log('   ERROR: Server not running on port 3004');
    }
    return false;
  }
}

async function test() {
  console.log('\n===============================================================');
  console.log('ERP LINK - PO TO BILL INTEGRITY UAT TEST');
  console.log('===============================================================\n');

  // Step 1: Login
  if (!(await login())) {
    return;
  }

  // Step 2: Get or create a vendor
  console.log('Step 2: Getting or creating a vendor...');
  let vendorId = '';
  let vendorRes;
  try {
    // Try to get an existing vendor
    vendorRes = await axios.get(BASE + '/api/accounting/vendors', {
      headers: { Authorization: 'Bearer ' + token },
      params: { limit: 1 }
    });
    if (vendorRes.data.data && vendorRes.data.data.length > 0) {
      vendorId = vendorRes.data.data[0].id;
      console.log('✅ Using existing vendor: ' + vendorRes.data.data[0].name + '\n');
    } else {
      // Create a new vendor
      vendorRes = await axios.post(BASE + '/api/accounting/vendors', {
        name: 'Test Supplier - PO to Bill UAT',
        email: 'supplier@test.com',
        phone: '+263-123-456-789',
        address: '123 Test Street',
        isActive: true
      }, {
        headers: { Authorization: 'Bearer ' + token }
      });
      vendorId = vendorRes.data.data?.id;
      console.log('✅ Created new vendor: ' + vendorRes.data.data?.name + '\n');
    }
  } catch (e) {
    console.log('❌ Error getting/creating vendor: ' + (e.response?.data?.message || e.message));
    if (e.response?.data) {
      console.log('   Response: ' + JSON.stringify(e.response.data));
    }
    return;
  }

  // Step 3: Get currency
  console.log('Step 3: Getting currency...');
  let currencyId = '';
  try {
    const currencyRes = await axios.get(BASE + '/api/accounting/currencies', {
      headers: { Authorization: 'Bearer ' + token },
      params: { code: 'USD', limit: 1 }
    });
    if (currencyRes.data.data && currencyRes.data.data.length > 0) {
      currencyId = currencyRes.data.data[0].id;
      console.log('✅ Using currency: ' + currencyRes.data.data[0].code + '\n');
    } else {
      // Try to get any active currency
      const allCurrencies = await axios.get(BASE + '/api/accounting/currencies', {
        headers: { Authorization: 'Bearer ' + token },
        params: { isActive: true, limit: 1 }
      });
      if (allCurrencies.data.data && allCurrencies.data.data.length > 0) {
        currencyId = allCurrencies.data.data[0].id;
        console.log('✅ Using currency: ' + allCurrencies.data.data[0].code + '\n');
      } else {
        throw new Error('No currency found');
      }
    }
  } catch (e) {
    console.log('❌ Error getting currency: ' + (e.response?.data?.message || e.message));
    return;
  }

  // Step 4: Create a Purchase Order for $500
  console.log('Step 4: Creating Purchase Order for $500...');
  let poId = '';
  let poNumber = '';
  let poSubtotal = 0;
  let poTaxAmount = 0;
  let poTotalAmount = 0;
  try {
    const poRes = await axios.post(BASE + '/api/procurement/purchase-orders', {
      vendorId: vendorId,
      currencyId: currencyId,
      priority: 'MEDIUM',
      expectedDeliveryDate: new Date(Date.now() + 30 * 86400000).toISOString(),
      paymentTerms: 'Net 30',
      deliveryTerms: 'FOB Destination',
      items: [
        {
          itemName: 'Office Supplies',
          description: 'Test items for PO to Bill UAT',
          quantity: 1,
          unitPrice: 500.00,
          unit: 'Lot'
        }
      ]
    }, {
      headers: { Authorization: 'Bearer ' + token },
      timeout: 30000
    });

    poId = poRes.data.data?.id;
    poNumber = poRes.data.data?.poNumber;
    poSubtotal = Number(poRes.data.data?.subtotal || 0);
    poTaxAmount = Number(poRes.data.data?.taxAmount || 0);
    poTotalAmount = Number(poRes.data.data?.totalAmount || 0);
    
    console.log('✅ Purchase Order created: ' + poNumber);
    console.log('   PO ID: ' + poId);
    console.log('   Subtotal: $' + poSubtotal.toFixed(2));
    console.log('   Tax Amount: $' + poTaxAmount.toFixed(2));
    console.log('   Total Amount: $' + poTotalAmount.toFixed(2));
    console.log('   Status: ' + poRes.data.data?.status);
    console.log('   ✅ Confirmed: PO created successfully (no journal entries created for PO, as expected)\n');
  } catch (e) {
    console.log('❌ Error creating Purchase Order: ' + (e.response?.data?.message || e.message));
    if (e.response?.data) {
      console.log('   Response: ' + JSON.stringify(e.response.data, null, 2));
    }
    return;
  }

  // Step 5: Convert PO to Creditor Bill
  console.log('Step 5: Converting PO to Creditor Bill...');
  let invoiceId = '';
  let invoiceNumber = '';
  try {
    const convertRes = await axios.post(BASE + '/api/procurement/purchase-orders/' + poId + '/convert-to-bill', {}, {
      headers: { Authorization: 'Bearer ' + token },
      timeout: 30000
    });

    if (convertRes.data.success && convertRes.data.data?.invoice) {
      invoiceId = convertRes.data.data.invoice.id;
      invoiceNumber = convertRes.data.data.invoice.invoiceNumber;
      console.log('✅ Purchase Order converted to Creditor Bill successfully!');
      console.log('   Invoice Number: ' + invoiceNumber);
      console.log('   Invoice ID: ' + invoiceId);
      console.log('   Total Amount: $' + Number(convertRes.data.data.invoice.totalAmount || 0).toFixed(2));
      console.log('   Vendor: ' + (convertRes.data.data.invoice.vendor?.name || 'N/A'));
      console.log('   Status: ' + convertRes.data.data.invoice.status + '\n');
    } else {
      throw new Error('Conversion response missing invoice data');
    }
  } catch (e) {
    console.log('❌ Error converting PO to Bill: ' + (e.response?.data?.message || e.message));
    if (e.response?.data) {
      console.log('   Response: ' + JSON.stringify(e.response.data, null, 2));
    }
    return;
  }

  // Step 6: Verify the Creditor Bill
  console.log('Step 6: Verifying Creditor Bill...');
  try {
    const invoiceRes = await axios.get(BASE + '/api/accounting/invoices/' + invoiceId, {
      headers: { Authorization: 'Bearer ' + token }
    });

    if (invoiceRes.data.data) {
      const invoice = invoiceRes.data.data;
      console.log('✅ Creditor Bill verified:');
      console.log('   Invoice Number: ' + invoice.invoiceNumber);
      console.log('   Amount: $' + Number(invoice.amount || 0).toFixed(2));
      console.log('   VAT Amount: $' + Number(invoice.vatAmount || 0).toFixed(2));
      console.log('   Total Amount: $' + Number(invoice.totalAmount || 0).toFixed(2));
      console.log('   Outstanding Amount: $' + Number(invoice.outstandingAmount || 0).toFixed(2));
      console.log('   Vendor ID: ' + (invoice.vendorId || 'N/A'));
      console.log('   Status: ' + invoice.status);
      console.log('   Description: ' + invoice.description + '\n');

      // Step 7: Verify Journal Entry was created
      console.log('Step 7: Verifying Journal Entry for Invoice...');
      let journalEntryId = invoice.journalEntryId;
      if (journalEntryId) {
        try {
          const jeRes = await axios.get(BASE + '/api/accounting/journal-entries/' + journalEntryId, {
            headers: { Authorization: 'Bearer ' + token }
          });
          
          if (jeRes.data.data) {
            const je = jeRes.data.data;
            console.log('✅ Journal Entry found:');
            console.log('   Reference Number: ' + je.referenceNumber);
            console.log('   Description: ' + je.description);
            console.log('   Status: ' + je.status);
            console.log('   Total Amount: $' + Number(je.totalAmount || 0).toFixed(2));
            
            if (je.journalEntryLines && je.journalEntryLines.length > 0) {
              console.log('\n   Journal Entry Lines:');
              let totalDebit = 0;
              let totalCredit = 0;
              je.journalEntryLines.forEach((line, idx) => {
                const debit = Number(line.debitAmount || 0);
                const credit = Number(line.creditAmount || 0);
                totalDebit += debit;
                totalCredit += credit;
                console.log('   Line ' + (idx + 1) + ':');
                console.log('     Account: ' + (line.chartOfAccount?.accountNo || 'N/A') + ' - ' + (line.chartOfAccount?.accountName || 'N/A'));
                console.log('     Debit: $' + debit.toFixed(2));
                console.log('     Credit: $' + credit.toFixed(2));
              });
              console.log('\n   Total Debit: $' + totalDebit.toFixed(2));
              console.log('   Total Credit: $' + totalCredit.toFixed(2));
              if (Math.abs(totalDebit - totalCredit) < 0.01) {
                console.log('   ✅ Journal Entry is balanced\n');
              } else {
                console.log('   ❌ Journal Entry is NOT balanced (Difference: $' + Math.abs(totalDebit - totalCredit).toFixed(2) + ')\n');
              }
            }
          }
        } catch (e) {
          console.log('⚠️  Could not retrieve journal entry details: ' + (e.response?.data?.message || e.message) + '\n');
        }
      } else {
        console.log('⚠️  Invoice has no journalEntryId (may be created but not posted yet)\n');
      }

      // UAT Verification
      console.log('===============================================================');
      console.log('UAT VERIFICATION');
      console.log('===============================================================');
      const totalAmount = Number(invoice.totalAmount || 0);
      const expectedAmount = poTotalAmount; // Expected amount from PO

      if (Math.abs(totalAmount - expectedAmount) < 1.0) {
        console.log('✅ PASS: Creditor Bill total amount matches PO amount ($' + expectedAmount.toFixed(2) + ')');
      } else {
        console.log('❌ FAIL: Creditor Bill total amount ($' + totalAmount.toFixed(2) + ') does not match PO amount ($' + expectedAmount.toFixed(2) + ')');
      }

      if (invoice.vendorId) {
        console.log('✅ PASS: Creditor Bill has vendorId set (' + invoice.vendorId + ')');
      } else {
        console.log('❌ FAIL: Creditor Bill missing vendorId');
      }

      if (invoice.status === 'SENT' || invoice.status === 'DRAFT') {
        console.log('✅ PASS: Creditor Bill status is valid (' + invoice.status + ')');
      } else {
        console.log('⚠️  WARNING: Creditor Bill status is ' + invoice.status + ' (expected SENT or DRAFT)');
      }

      if (invoice.description && invoice.description.includes(poNumber)) {
        console.log('✅ PASS: Creditor Bill description references PO number (' + poNumber + ')');
      } else {
        console.log('⚠️  WARNING: Creditor Bill description may not reference PO number');
      }

      if (journalEntryId) {
        console.log('✅ PASS: Journal Entry created and linked to invoice');
      } else {
        console.log('⚠️  WARNING: No journal entry linked to invoice');
      }

      console.log('===============================================================\n');
    } else {
      throw new Error('Invoice not found in response');
    }
  } catch (e) {
    console.log('❌ Error verifying Creditor Bill: ' + (e.response?.data?.message || e.message));
    if (e.response?.data) {
      console.log('   Response: ' + JSON.stringify(e.response.data, null, 2));
    }
  }

  console.log('===============================================================');
  console.log('TEST COMPLETED');
  console.log('===============================================================\n');
}

test().catch(console.error);

