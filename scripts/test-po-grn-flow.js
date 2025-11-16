// @ts-nocheck
/**
 * Test script for PO and GRN flow
 * 
 * Tests the complete workflow:
 * 1. Accept Quotation → Creates PO
 * 2. Send PO → Vendor
 * 3. Create GRN → After delivery
 * 4. Create Invoice → After GRN
 * 
 * Run with: node scripts/test-po-grn-flow.js
 */

const http = require('http');
const https = require('https');

// Configuration
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';
const API_BASE = `${SERVER_URL}/api`;

// Test user credentials (from PROCUREMENT_TEST_USERS.md)
const TEST_USER = {
  email: 'proc.manager@testnvccz.com',
  password: 'TestPass123!' // From PROCUREMENT_TEST_USERS.md
};

// Global variables
let authToken = '';
let quotationId = null;
let purchaseOrderId = null;
let grnId = null;
let invoiceId = null;
let vendorId = null;
let requisitionId = null;

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
      const response = await makeRequest({ path: '/auth/login', method: 'POST', url: `${SERVER_URL}/auth/login` }, { email: 'test', password: 'test' });
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
      method: 'POST',
      url: `${SERVER_URL}/auth/login`
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
 * Create or get vendor
 */
async function getOrCreateVendor() {
  console.log('👥 Step 2: Getting/Creating vendor...');
  try {
    // Try to get existing vendors
    const listResponse = await makeRequest({ path: '/accounting/vendors', method: 'GET' });
    
    if (listResponse.status === 200 && listResponse.data.data && listResponse.data.data.length > 0) {
      vendorId = listResponse.data.data[0].id;
      console.log(`✅ Using existing vendor: ${vendorId}\n`);
      return vendorId;
    }

    // Create new vendor if none exists
    const createResponse = await makeRequest({ 
      path: '/accounting/vendors', 
      method: 'POST' 
    }, {
      name: 'Test Vendor for PO/GRN Flow',
      email: 'vendor.po.grn@testnvccz.com',
      phone: '+1234567890',
      address: '123 Test Street',
      taxId: 'TAX-12345'
    });

    if (createResponse.status === 201 || createResponse.status === 200) {
      vendorId = createResponse.data.data?.id || createResponse.data.id;
      console.log(`✅ Created vendor: ${vendorId}\n`);
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
      title: 'PO/GRN Flow Test Requisition',
      description: 'Testing PO and GRN integration',
      department: 'Procurement',
      priority: 'MEDIUM',
      items: [
        {
          itemName: 'Office Supplies Bundle',
          description: 'Test item for PO/GRN flow',
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
 * Submit and approve requisition
 */
async function submitAndApproveRequisition() {
  console.log('✅ Step 4: Submitting and approving requisition...');
  try {
    // Submit requisition
    const submitResponse = await makeRequest({ 
      path: `/procurement/requisitions/${requisitionId}/submit`, 
      method: 'PUT' 
    });

    if (submitResponse.status !== 200) {
      console.log(`⚠️  Submit returned ${submitResponse.status}, checking status...`);
    }

    // Approve requisition
    const approveResponse = await makeRequest({ 
      path: `/procurement/requisitions/${requisitionId}/approve`, 
      method: 'PUT' 
    });

    if (approveResponse.status === 200) {
      console.log('✅ Requisition approved\n');
      return true;
    } else {
      throw new Error(`Failed to approve requisition: ${JSON.stringify(approveResponse.data)}`);
    }
  } catch (error) {
    console.error('❌ Failed to submit/approve requisition:', error.message);
    throw error;
  }
}

/**
 * Create and send RFQ
 */
async function createAndSendRFQ() {
  console.log('📢 Step 5: Creating and sending RFQ...');
  try {
    const response = await makeRequest({ 
      path: '/procurement/rfq', 
      method: 'POST' 
    }, {
      requisitionId: requisitionId,
      title: 'PO/GRN Flow Test RFQ',
      description: 'RFQ for testing PO/GRN flow',
      vendorIds: [vendorId],
      priority: 'MEDIUM',
      items: [
        {
          itemName: 'Office Supplies Bundle',
          quantity: 100,
          unit: 'units'
        }
      ]
    });

    if (response.status === 201 || response.status === 200) {
      console.log(`✅ RFQ created and sent: ${response.data.data?.rfqNumber || 'RFQ-XXX'}\n`);
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
  console.log('📝 Step 6: Submitting vendor quotation (public API)...');
  try {
    const response = await makeRequest({ 
      path: '/vendor-quotations/submit', 
      method: 'POST',
      headers: {} // No auth for public endpoint
    }, {
      rfqNumber: null, // Will use latest RFQ
      vendorName: 'Test Vendor for PO/GRN Flow',
      vendorEmail: 'vendor.po.grn@testnvccz.com',
      companyName: 'PO/GRN Test Vendor Ltd',
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
  console.log('✅ Step 7: Accepting quotation (should create PO)...');
  try {
    const response = await makeRequest({ 
      path: `/vendor-quotations/${quotationId}/accept`, 
      method: 'POST' 
    }, {
      reviewNotes: 'Best price for testing PO/GRN flow',
      createPO: true, // Create PO (default)
      createInvoice: false // Don't create invoice yet
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
  console.log('📧 Step 8: Sending PO to vendor...');
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
  console.log('📦 Step 9: Creating Goods Received Note (GRN)...');
  try {
    // First, get PO items to get purchaseOrderItemId
    const poResponse = await makeRequest({ 
      path: `/procurement/purchase-orders/${purchaseOrderId}`, 
      method: 'GET' 
    });

    if (poResponse.status !== 200 || !poResponse.data.data?.items || poResponse.data.data.items.length === 0) {
      throw new Error('Failed to get PO items');
    }

    const poItem = poResponse.data.data.items[0];

    const response = await makeRequest({ 
      path: '/procurement/goods-received-notes', 
      method: 'POST' 
    }, {
      purchaseOrderId: purchaseOrderId,
      items: [
        {
          purchaseOrderItemId: poItem.id,
          quantityReceived: 95, // Received 95 out of 100
          quantityAccepted: 90, // Accepted 90
          quantityRejected: 5, // 5 rejected
          qualityStatus: 'PASSED',
          qualityNotes: '5 units damaged in transit'
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
  console.log('💰 Step 10: Creating invoice from PO/GRN...');
  try {
    // Get PO details for invoice
    const poResponse = await makeRequest({ 
      path: `/procurement/purchase-orders/${purchaseOrderId}`, 
      method: 'GET' 
    });

    if (poResponse.status !== 200) {
      throw new Error('Failed to get PO details');
    }

    const po = poResponse.data.data;
    const acceptedQuantity = 90; // From GRN

    const response = await makeRequest({ 
      path: '/procurement/invoices', 
      method: 'POST' 
    }, {
      purchaseOrderId: purchaseOrderId,
      quotationId: quotationId,
      vendorId: vendorId,
      invoiceDate: new Date().toISOString(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      items: [
        {
          itemName: 'Office Supplies Bundle',
          quantity: acceptedQuantity, // Use accepted quantity from GRN
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
 * Main test function
 */
async function runTests() {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('🧪 PO AND GRN FLOW - COMPLETE TEST');
  console.log('════════════════════════════════════════════════════════════════\n');

  try {
    // Wait for server
    await waitForServer();

    // Test flow
    await login();
    await getOrCreateVendor();
    await createRequisition();
    await submitAndApproveRequisition();
    await createAndSendRFQ();
    await submitVendorQuotation();
    await acceptQuotation();
    await sendPO();
    await createGRN();
    await createInvoice();

    console.log('════════════════════════════════════════════════════════════════');
    console.log('✅ ALL TESTS PASSED!');
    console.log('════════════════════════════════════════════════════════════════\n');
    console.log('📊 Test Summary:');
    console.log(`   - Requisition ID: ${requisitionId}`);
    console.log(`   - Quotation ID: ${quotationId}`);
    console.log(`   - Purchase Order ID: ${purchaseOrderId}`);
    console.log(`   - GRN ID: ${grnId}`);
    console.log(`   - Invoice ID: ${invoiceId}\n`);

  } catch (error) {
    console.error('\n════════════════════════════════════════════════════════════════');
    console.error('❌ TEST FAILED!');
    console.error('════════════════════════════════════════════════════════════════');
    console.error('Error:', error.message);
    console.error('\nFull error:', error);
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

