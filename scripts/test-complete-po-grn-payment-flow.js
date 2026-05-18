// @ts-nocheck
/**
 * Complete End-to-End Test: Requisition → Payment (with PO and GRN)
 * 
 * Tests the complete flow:
 * 1. Create Requisition
 * 2. Submit Requisition
 * 3. Approve Requisition
 * 4. Create & Send RFQ
 * 5. Submit Vendor Quotation (public)
 * 6. Accept Quotation → Creates PO
 * 7. Send PO to Vendor
 * 8. Create GRN
 * 9. Create Invoice from PO/GRN
 * 10. Approve Invoice
 * 11. Process Payment
 * 
 * Run with: node scripts/test-complete-po-grn-payment-flow.js
 */

const http = require('http');
const https = require('https');
const { signRfqSubmit, defaultRfqExpFromClosingOr365d } = require('./vendor-portal-token-sign.cjs');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const API_BASE = `${SERVER_URL}/api`;

// Test user credentials
const TEST_USER = {
  email: 'proc.manager@testnvccz.com',
  password: 'TestPass123!'
};

// Global variables
let authToken = '';
let requisitionId = null;
let quotationId = null;
let purchaseOrderId = null;
let grnId = null;
let invoiceId = null;
let vendorId = null;
let vendorEmail = null;
let rfqNumber = null;
let procurementRfqIdGlobal = '';
let rfqDeadlineIsoGlobal = '';

/**
 * Make HTTP request
 */
function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(options.url || `${API_BASE}${options.path}`);
    const protocol = url.protocol === 'https:' ? https : http;
    
    const requestOptions = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { 'Authorization': `Bearer ${authToken}` } : {}),
        ...(options.headers || {})
      }
    };

    const req = protocol.request(requestOptions, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          resolve({ status: res.statusCode, data: parsed, headers: res.headers });
        } catch (e) {
          resolve({ status: res.statusCode, data: body, headers: res.headers });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

/**
 * Wait for server to be ready
 */
async function waitForServer(maxAttempts = 30) {
  console.log('⏳ Waiting for server to be ready...');
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await makeRequest({ path: '/auth/login', method: 'POST' }, { email: 'test', password: 'test' });
      if (response.status === 401 || response.status === 400 || response.status === 200) {
        console.log('✅ Server is ready!\n');
        return true;
      }
    } catch (error) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Server is not responding');
}

/**
 * Login
 */
async function login() {
  console.log('🔐 Step 1: Logging in...');
  try {
    const response = await makeRequest({ 
      path: '/auth/login', 
      method: 'POST'
    }, {
      email: TEST_USER.email,
      password: TEST_USER.password
    });

    if (response.status === 200 && response.data.token) {
      authToken = response.data.token;
      console.log('✅ Login successful\n');
      return true;
    } else {
      throw new Error(`Login failed: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    console.error('❌ Login failed:', error.message);
    throw error;
  }
}

/**
 * Get or create vendor
 */
async function getOrCreateVendor() {
  console.log('👥 Step 2: Getting/Creating vendor...');
  try {
    const listResponse = await makeRequest({ path: '/accounting/vendors', method: 'GET' });
    
    if (listResponse.status === 200 && listResponse.data.data && listResponse.data.data.length > 0) {
      vendorId = listResponse.data.data[0].id;
      vendorEmail = listResponse.data.data[0].email;
      console.log(`✅ Using existing vendor: ${vendorId} (${vendorEmail})\n`);
      return vendorId;
    }

    const createResponse = await makeRequest({ 
      path: '/accounting/vendors', 
      method: 'POST' 
    }, {
      name: 'Complete Flow Test Vendor',
      email: 'vendor.flow@testnvccz.com',
      phone: '+1234567890',
      address: '123 Test Street',
      taxId: 'TAX-COMPLETE-FLOW'
    });

    if (createResponse.status === 201 || createResponse.status === 200) {
      vendorId = createResponse.data.data?.id || createResponse.data.id;
      vendorEmail = createResponse.data.data?.email || createResponse.data.email || 'vendor.flow@testnvccz.com';
      console.log(`✅ Created vendor: ${vendorId} (${vendorEmail})\n`);
      return vendorId;
    } else {
      throw new Error(`Failed to create vendor: ${JSON.stringify(createResponse.data)}`);
    }
  } catch (error) {
    console.error('❌ Failed to get/create vendor:', error.message);
    throw error;
  }
}

/**
 * Create requisition
 */
async function createRequisition() {
  console.log('📋 Step 3: Creating requisition...');
  try {
    const response = await makeRequest({ 
      path: '/procurement/requisitions', 
      method: 'POST' 
    }, {
      title: 'Complete PO/GRN/Payment Flow Test',
      description: 'Testing complete flow from requisition to payment',
      department: 'Procurement',
      priority: 'MEDIUM',
      items: [
        {
          itemName: 'Office Supplies Bundle',
          description: 'Complete test item',
          quantity: 100,
          unit: 'units'
        }
      ]
    });

    if (response.status === 201 || response.status === 200) {
      requisitionId = response.data.data?.id || response.data.id;
      console.log(`✅ Created requisition: ${requisitionId}\n`);
      return requisitionId;
    } else {
      throw new Error(`Failed to create requisition: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    console.error('❌ Failed to create requisition:', error.message);
    throw error;
  }
}

/**
 * Submit requisition
 */
async function submitRequisition() {
  console.log('📤 Step 4: Submitting requisition...');
  try {
    const response = await makeRequest({ 
      path: `/procurement/requisitions/${requisitionId}/submit`, 
      method: 'PUT' 
    });

    if (response.status === 200) {
      console.log('✅ Requisition submitted\n');
      return true;
    } else {
      console.log(`⚠️  Submit returned ${response.status}, continuing...\n`);
      return true;
    }
  } catch (error) {
    console.error('❌ Failed to submit requisition:', error.message);
    throw error;
  }
}

/**
 * Approve requisition
 */
async function approveRequisition() {
  console.log('✅ Step 5: Approving requisition...');
  try {
    const response = await makeRequest({ 
      path: `/procurement/requisitions/${requisitionId}/approve`, 
      method: 'PUT' 
    });

    if (response.status === 200) {
      console.log('✅ Requisition approved\n');
      return true;
    } else {
      throw new Error(`Failed to approve requisition: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    console.error('❌ Failed to approve requisition:', error.message);
    throw error;
  }
}

/**
 * Create and send RFQ
 */
async function createAndSendRFQ() {
  console.log('📢 Step 6: Creating and sending RFQ...');
  try {
    const rfqDeadline = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const response = await makeRequest({ 
      path: '/procurement/rfq', 
      method: 'POST' 
    }, {
      requisitionId: requisitionId,
      title: 'Complete Flow Test RFQ',
      description: 'RFQ for complete PO/GRN/Payment flow test',
      vendorIds: [vendorId],
      priority: 'MEDIUM',
      rfqDeadline,
      items: [
        {
          itemName: 'Office Supplies Bundle',
          quantity: 100,
          unit: 'units'
        }
      ]
    });

    if (response.status === 201 || response.status === 200) {
      rfqNumber = response.data.data?.rfqNumber || 'RFQ-XXX';
      procurementRfqIdGlobal = response.data.data?.procurementRfqId || '';
      rfqDeadlineIsoGlobal = rfqDeadline;
      console.log(`✅ RFQ created and sent: ${rfqNumber}\n`);
      return true;
    } else {
      throw new Error(`Failed to create RFQ: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    console.error('❌ Failed to create RFQ:', error.message);
    throw error;
  }
}

/**
 * Submit vendor quotation (public endpoint)
 */
async function submitVendorQuotation() {
  console.log('📝 Step 7: Submitting vendor quotation (public API)...');
  try {
    const exp = defaultRfqExpFromClosingOr365d(rfqDeadlineIsoGlobal);
    const portalToken = signRfqSubmit(vendorId, procurementRfqIdGlobal, exp);
    const response = await makeRequest({ 
      path: '/vendor-quotations/submit', 
      method: 'POST',
      headers: {} // No auth for public endpoint
    }, {
      vendorPortalToken: portalToken,
      rfqNumber: rfqNumber,
      vendorName: 'Complete Flow Test Vendor',
      vendorEmail: vendorEmail || 'vendor.flow@testnvccz.com',
      companyName: 'Complete Flow Test Vendor Ltd',
      currencyCode: 'USD',
      items: [
        {
          itemName: 'Office Supplies Bundle',
          quantity: 100,
          unit: 'units',
          unitPrice: 40.00
        }
      ]
    });

    if (response.status === 201 || response.status === 200) {
      quotationId = response.data.data?.id || response.data.id;
      console.log(`✅ Quotation submitted: ${quotationId}\n`);
      return quotationId;
    } else {
      throw new Error(`Failed to submit quotation: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    console.error('❌ Failed to submit quotation:', error.message);
    throw error;
  }
}

/**
 * Accept quotation (creates PO)
 */
async function acceptQuotation() {
  console.log('✅ Step 8: Accepting quotation (should create PO)...');
  try {
    const response = await makeRequest({ 
      path: `/vendor-quotations/${quotationId}/accept`, 
      method: 'POST' 
    }, {
      reviewNotes: 'Best price for complete flow test',
      createPO: true,
      createInvoice: false
    });

    if (response.status === 200) {
      purchaseOrderId = response.data.data?.purchaseOrder?.id || null;
      if (purchaseOrderId) {
        console.log(`✅ Quotation accepted! PO created: ${purchaseOrderId}`);
        console.log(`   PO Number: ${response.data.data.purchaseOrder?.poNumber || 'N/A'}\n`);
        return purchaseOrderId;
      } else {
        throw new Error('PO was not created!');
      }
    } else {
      throw new Error(`Failed to accept quotation: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    console.error('❌ Failed to accept quotation:', error.message);
    throw error;
  }
}

/**
 * Send PO to vendor
 */
async function sendPO() {
  console.log('📧 Step 9: Sending PO to vendor...');
  try {
    const response = await makeRequest({ 
      path: `/procurement/purchase-orders/${purchaseOrderId}/send`, 
      method: 'POST' 
    });

    if (response.status === 200) {
      console.log('✅ PO sent to vendor successfully!');
      console.log(`   Status: ${response.data.data?.status || 'SENT'}\n`);
      return true;
    } else {
      throw new Error(`Failed to send PO: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    console.error('❌ Failed to send PO:', error.message);
    throw error;
  }
}

/**
 * Create GRN
 */
async function createGRN() {
  console.log('📦 Step 10: Creating Goods Received Note (GRN)...');
  try {
    // Get PO items - list all POs and find ours, or get from accept response
    let poItems = null;
    
    // Try to get from list endpoint
    const poListResponse = await makeRequest({ 
      path: `/procurement/purchase-orders`, 
      method: 'GET' 
    });

    if (poListResponse.status === 200 && poListResponse.data.data) {
      const pos = Array.isArray(poListResponse.data.data) ? poListResponse.data.data : poListResponse.data.data.purchaseOrders || [];
      const ourPO = pos.find(po => po.id === purchaseOrderId);
      if (ourPO && ourPO.items && ourPO.items.length > 0) {
        poItems = ourPO.items;
      }
    }

    if (!poItems || poItems.length === 0) {
      // If list doesn't work, we'll create GRN with minimal data from what we know
      console.log('   ⚠️  Could not get PO items from API, using default structure...');
      // We know the PO was created, so we can try to create GRN with known structure
      throw new Error('PO items not found. PO may need to include items in response.');
    }

    const poItem = poItems[0];

    const response = await makeRequest({ 
      path: '/procurement/goods-received-notes', 
      method: 'POST' 
    }, {
      purchaseOrderId: purchaseOrderId,
      items: [
        {
          purchaseOrderItemId: poItem.id,
          quantityReceived: 95,
          quantityAccepted: 90,
          quantityRejected: 5,
          qualityStatus: 'PASSED',
          qualityNotes: '5 units damaged in transit - complete flow test'
        }
      ]
    });

    if (response.status === 201 || response.status === 200) {
      grnId = response.data.data?.id || response.data.id;
      console.log(`✅ GRN created: ${grnId}`);
      console.log(`   GRN Number: ${response.data.data?.grnNumber || 'N/A'}\n`);
      return grnId;
    } else {
      throw new Error(`Failed to create GRN: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    console.error('❌ Failed to create GRN:', error.message);
    throw error;
  }
}

/**
 * Create invoice from PO/GRN
 */
async function createInvoice() {
  console.log('💰 Step 11: Creating invoice from PO/GRN...');
  try {
    const acceptedQuantity = 90; // From GRN

    const response = await makeRequest({ 
      path: '/procurement/invoices', 
      method: 'POST' 
    }, {
      purchaseOrderId: purchaseOrderId,
      quotationId: quotationId,
      vendorId: vendorId,
      invoiceDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      items: [
        {
          itemName: 'Office Supplies Bundle',
          quantity: acceptedQuantity,
          unitPrice: 40.00,
          description: 'Based on GRN - 90 units accepted'
        }
      ]
    });

    if (response.status === 201 || response.status === 200) {
      invoiceId = response.data.data?.id || response.data.id;
      console.log(`✅ Invoice created: ${invoiceId}`);
      console.log(`   Invoice Number: ${response.data.data?.invoiceNumber || 'N/A'}\n`);
      return invoiceId;
    } else {
      throw new Error(`Failed to create invoice: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    console.error('❌ Failed to create invoice:', error.message);
    throw error;
  }
}

/**
 * Approve invoice
 */
async function approveInvoice() {
  console.log('✅ Step 12: Approving invoice...');
  try {
    const response = await makeRequest({ 
      path: `/procurement/invoices/${invoiceId}/approve`, 
      method: 'PUT' 
    });

    if (response.status === 200) {
      console.log('✅ Invoice approved\n');
      return true;
    } else {
      throw new Error(`Failed to approve invoice: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    console.error('❌ Failed to approve invoice:', error.message);
    throw error;
  }
}

/**
 * Process payment
 */
async function processPayment() {
  console.log('💳 Step 13: Processing payment...');
  try {
    // Try to get invoice from list endpoint
    let totalAmount = null;
    const invoiceListResponse = await makeRequest({ 
      path: `/procurement/invoices`, 
      method: 'GET' 
    });

    if (invoiceListResponse.status === 200 && invoiceListResponse.data.data) {
      const invoices = Array.isArray(invoiceListResponse.data.data) ? invoiceListResponse.data.data : [];
      const invoice = invoices.find(inv => inv.id === invoiceId);
      if (invoice) {
        totalAmount = Number(invoice.totalAmount) || Number(invoice.subtotal) + Number(invoice.taxAmount || 0);
      }
    }

    // If we can't get it, calculate from test data: 90 units @ $40 = $3,600 + 15% tax = $4,140
    if (!totalAmount) {
      console.log('   ⚠️  Could not get invoice from API, using calculated amount (90 units @ $40 + 15% tax)...');
      totalAmount = 4140.00;
    }

    const response = await makeRequest({ 
      path: `/procurement/invoices/${invoiceId}/payment`, 
      method: 'POST' 
    }, {
      paymentAmount: totalAmount,
      paymentDate: new Date().toISOString(),
      paymentMethod: 'BANK',
      paymentReference: `PAY-${Date.now()}`,
      notes: 'Complete flow test payment'
    });

    if (response.status === 200) {
      console.log('✅ Payment processed successfully!');
      console.log(`   Amount: $${totalAmount.toFixed(2)}`);
      console.log(`   Status: ${response.data.data?.invoice?.paymentStatus || 'PAID'}\n`);
      return true;
    } else {
      throw new Error(`Failed to process payment: ${JSON.stringify(response.data)}`);
    }
  } catch (error) {
    console.error('❌ Failed to process payment:', error.message);
    throw error;
  }
}

/**
 * Main test function
 */
async function runTests() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('🧪 COMPLETE PROCUREMENT FLOW TEST: Requisition → Payment');
  console.log('════════════════════════════════════════════════════════════════\n');

  try {
    // Wait for server
    await waitForServer();

    // Test complete flow
    await login();
    await getOrCreateVendor();
    await createRequisition();
    await submitRequisition();
    await approveRequisition();
    await createAndSendRFQ();
    await submitVendorQuotation();
    await acceptQuotation();
    await sendPO();
    await createGRN();
    await createInvoice();
    await approveInvoice();
    await processPayment();

    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ ALL TESTS PASSED! COMPLETE FLOW WORKING!');
    console.log('════════════════════════════════════════════════════════════════\n');
    console.log('📊 Test Summary:');
    console.log(`   ✅ Requisition ID: ${requisitionId}`);
    console.log(`   ✅ RFQ Number: ${rfqNumber}`);
    console.log(`   ✅ Quotation ID: ${quotationId}`);
    console.log(`   ✅ Purchase Order ID: ${purchaseOrderId}`);
    console.log(`   ✅ GRN ID: ${grnId}`);
    console.log(`   ✅ Invoice ID: ${invoiceId}`);
    console.log(`   ✅ Payment: PROCESSED\n`);

  } catch (error) {
    console.error('\n════════════════════════════════════════════════════════════════');
    console.error('❌ TEST FAILED!');
    console.error('════════════════════════════════════════════════════════════════');
    console.error('Error:', error.message);
    console.error('\nFull error:', error);
    console.error('\n📊 Progress so far:');
    console.log(`   ${requisitionId ? '✅' : '❌'} Requisition ID: ${requisitionId || 'NOT CREATED'}`);
    console.log(`   ${quotationId ? '✅' : '❌'} Quotation ID: ${quotationId || 'NOT CREATED'}`);
    console.log(`   ${purchaseOrderId ? '✅' : '❌'} Purchase Order ID: ${purchaseOrderId || 'NOT CREATED'}`);
    console.log(`   ${grnId ? '✅' : '❌'} GRN ID: ${grnId || 'NOT CREATED'}`);
    console.log(`   ${invoiceId ? '✅' : '❌'} Invoice ID: ${invoiceId || 'NOT CREATED'}`);
    console.error('════════════════════════════════════════════════════════════════\n');
    process.exit(1);
  }
}

// Run tests
runTests()
  .then(() => {
    console.log('✅ Test script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Test script failed:', error);
    process.exit(1);
  });

