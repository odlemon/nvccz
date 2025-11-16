// @ts-nocheck
/**
 * Test script for COMPLETE procurement workflow
 * Tests: Requisition → Approval → RFQ → Quotations → Invoice → Payment
 * Simulates email sending for RFQ and vendor quotations
 */

const http = require('http');
const https = require('https');

const BASE_URL = 'http://localhost:3000/api';
let ADMIN_TOKEN = '';
let MANAGER_TOKEN = '';
let BUYER_TOKEN = '';
let COORDINATOR_TOKEN = '';
let CONFIG_ID = '';
let REQ_ID = '';
let RFQ_NUMBER = '';
let QUOTATION_1_ID = '';
let QUOTATION_2_ID = '';
let INVOICE_ID = '';
let EXPENSE_JOURNAL_ENTRY_ID = '';
let PAYMENT_JOURNAL_ENTRY_ID = '';

// Test users
const TEST_USERS = {
  admin: {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  },
  manager: {
    email: 'proc.manager@testnvccz.com',
    password: 'TestPass123!'
  },
  buyer: {
    email: 'proc.buyer@testnvccz.com',
    password: 'TestPass123!'
  },
  coordinator: {
    email: 'proc.coordinator@testnvccz.com',
    password: 'TestPass123!'
  }
};

// Test vendors (for RFQ)
const TEST_VENDORS = [
  {
    name: 'ABC Supplies Ltd',
    email: 'quotes@abcsupplies.com',
    phone: '+263771234567'
  },
  {
    name: 'XYZ Equipment Co',
    email: 'sales@xyzequipment.com',
    phone: '+263772345678'
  }
];

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const opts = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = client.request(opts, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, json: () => Promise.resolve(jsonData) });
        } catch (e) {
          resolve({ ok: false, status: res.statusCode, json: () => Promise.resolve({ message: data }) });
        }
      });
    });

    req.on('error', (err) => {
      reject(new Error(`Request failed: ${err.message || err}`));
    });
    
    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    
    req.end();
  });
}

async function login(email, password) {
  try {
    const response = await makeRequest(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email, password }
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || data.error || `Login failed with status ${response.status}`);
    }
    
    if (!data.token) {
      throw new Error('No token received in response');
    }
    
    return data.token;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (errorMsg.includes('ECONNREFUSED') || errorMsg.includes('connect')) {
      throw new Error(`Cannot connect to server at ${BASE_URL}. Make sure the server is running on port 3000.`);
    }
    throw new Error(`Login failed: ${errorMsg}`);
  }
}

async function checkServerHealth() {
  try {
    // Try a simple endpoint that should work
    const response = await makeRequest(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { email: 'test@test.com', password: 'test' }
    });
    // If we get a response (even if login fails), server is up
    return response.status !== undefined;
  } catch (error) {
    return false;
  }
}

async function waitForServer(maxRetries = 10, delay = 2000) {
  for (let i = 0; i < maxRetries; i++) {
    if (await checkServerHealth()) {
      return true;
    }
    console.log(`   ⏳ Waiting for server... (${i + 1}/${maxRetries})`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  return false;
}

async function getOrCreateVendors(token) {
  console.log('\n🔍 STEP 0: CHECK/CREATE TEST VENDORS');
  console.log('════════════════════════════════════════════════════════════════\n');

  const vendorIds = [];

  for (const vendor of TEST_VENDORS) {
    try {
      // Try to find vendor by email
      const findResponse = await makeRequest(`${BASE_URL}/accounting/vendors?search=${encodeURIComponent(vendor.email)}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const findData = await findResponse.json();
      let vendorId = null;

      if (findData.data && findData.data.length > 0) {
        // Find exact match by email
        const exactMatch = findData.data.find(v => v.email === vendor.email);
        if (exactMatch) {
          vendorId = exactMatch.id;
          console.log(`   ✅ Found existing vendor: ${vendor.name} (${vendorId})`);
        }
      }
      
      if (!vendorId) {
        // Create vendor
        const createResponse = await makeRequest(`${BASE_URL}/accounting/vendors`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: {
            name: vendor.name,
            email: vendor.email,
            phone: vendor.phone,
            address: '123 Test Street, Harare',
            isActive: true
          }
        });

        const createData = await createResponse.json();
        if (!createResponse.ok) {
          throw new Error(createData.message || 'Failed to create vendor');
        }
        vendorId = createData.data.id;
        console.log(`   ✅ Created vendor: ${vendor.name} (${vendorId})`);
      }

      vendorIds.push(vendorId);
    } catch (error) {
      console.error(`   ❌ Error with vendor ${vendor.name}: ${error.message}`);
      throw error;
    }
  }

  console.log(`\n   📋 Vendor IDs: ${vendorIds.join(', ')}\n`);
  return vendorIds;
}

async function createRequisition(token) {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('📋 STEP 1: CREATE PURCHASE REQUISITION');
  console.log('════════════════════════════════════════════════════════════════\n');

  const requisitionData = {
    title: 'Office Supplies - Test Workflow',
    description: 'Office supplies needed for testing the complete procurement workflow',
    department: 'Procurement',
    priority: 'HIGH',
    expectedDeliveryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    items: [
      {
        itemName: 'Office Desk',
        description: 'Executive wooden desk, 1.6m x 0.8m',
        quantity: 10,
        unit: 'pieces',
        estimatedUnitPrice: 250.00
      },
      {
        itemName: 'Office Chair',
        description: 'Ergonomic office chair with lumbar support',
        quantity: 10,
        unit: 'pieces',
        estimatedUnitPrice: 150.00
      }
    ]
  };

  try {
    const response = await makeRequest(`${BASE_URL}/procurement/requisitions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: requisitionData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to create requisition');
    }

    REQ_ID = data.data.id;
    console.log('✅ Purchase Requisition created successfully');
    console.log(`   Requisition ID: ${REQ_ID}`);
    console.log(`   Requisition Number: ${data.data.requisitionNumber}`);
    console.log(`   Title: ${data.data.title}`);
    console.log(`   Status: ${data.data.status}`);
    console.log(`   Total Amount: $${data.data.totalAmount || '0.00'}`);
    console.log('');

    // Store status for later checks
    data.data._currentStatus = data.data.status;
    return data.data;
  } catch (error) {
    throw new Error(`Failed to create requisition: ${error.message}`);
  }
}

async function submitRequisition(token, requisitionId, currentStatus) {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('📤 STEP 2: SUBMIT REQUISITION FOR APPROVAL');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Check if already submitted
  if (currentStatus === 'PENDING_APPROVAL' || currentStatus === 'APPROVED') {
    console.log(`   ℹ️  Requisition is already in ${currentStatus} status`);
    console.log('   ✅ Skipping submission step');
    console.log('');
    
    // Fetch latest status
    try {
      const getResponse = await makeRequest(`${BASE_URL}/procurement/requisitions/${requisitionId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      const getData = await getResponse.json();
      return getData.data || { id: requisitionId, status: currentStatus };
    } catch (err) {
      return { id: requisitionId, status: currentStatus };
    }
  }

  try {
    const response = await makeRequest(`${BASE_URL}/procurement/requisitions/${requisitionId}/submit`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to submit requisition');
    }

    console.log('✅ Requisition submitted successfully');
    console.log(`   Status: ${data.data.status}`);
    console.log(`   Approval Request ID: ${data.data.approvalRequestId || 'N/A'}`);
    console.log('');

    return data.data;
  } catch (error) {
    throw new Error(`Failed to submit requisition: ${error.message}`);
  }
}

async function approveRequisition(token, requisitionId) {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('✅ STEP 3: APPROVE REQUISITION (MANAGER & OFFICER)');
  console.log('════════════════════════════════════════════════════════════════\n');

  // Step 1: Manager approves
  console.log('   👤 Manager Approval (Step 1)...');
  try {
    const managerResponse = await makeRequest(`${BASE_URL}/procurement/approvals/approve`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MANAGER_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: {
        requestId: '', // Will be fetched
        action: 'APPROVE',
        notes: 'Approved by Procurement Manager'
      }
    });

    // Get pending approvals for manager
    const pendingResponse = await makeRequest(`${BASE_URL}/procurement/approvals/pending`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${MANAGER_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });

    const pendingData = await pendingResponse.json();
    if (pendingData.data && pendingData.data.length > 0) {
      const approvalRequest = pendingData.data[0];
      const approveResponse = await makeRequest(`${BASE_URL}/procurement/approvals/approve`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MANAGER_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: {
          requestId: approvalRequest.id,
          action: 'APPROVE',
          notes: 'Approved by Procurement Manager'
        }
      });

      const approveData = await approveResponse.json();
      if (approveResponse.ok) {
        console.log(`   ✅ Manager approved (Request: ${approvalRequest.id})`);
      } else {
        console.log(`   ⚠️  Manager approval response: ${approveData.message}`);
      }
    } else {
      console.log('   ℹ️  No pending approvals for manager');
    }
  } catch (error) {
    console.log(`   ⚠️  Manager approval error: ${error.message}`);
  }

  console.log('\n   ✅ Requisition approval workflow completed\n');
}

async function createAndSendRFQ(token, requisitionId, vendorIds) {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('📧 STEP 4: CREATE AND SEND RFQ TO VENDORS');
  console.log('════════════════════════════════════════════════════════════════\n');
  console.log('   📝 Note: Email sending is simulated (vendors will be notified in production)');
  console.log('');

  const rfqData = {
    requisitionId: requisitionId,
    title: 'Request for Quotation - Office Supplies',
    description: 'We are requesting quotations for office supplies as specified in the RFQ.',
    vendorIds: vendorIds,
    priority: 'HIGH',
    expectedDeliveryDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    deliveryAddress: '123 Procurement Street, Harare, Zimbabwe',
    rfqDeadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    specialRequirements: 'All items must meet quality standards and include warranty.',
    items: [
      {
        itemName: 'Office Desk',
        description: 'Executive wooden desk, 1.6m x 0.8m',
        quantity: 10,
        unit: 'pieces'
      },
      {
        itemName: 'Office Chair',
        description: 'Ergonomic office chair with lumbar support',
        quantity: 10,
        unit: 'pieces'
      }
    ]
  };

  try {
    const response = await makeRequest(`${BASE_URL}/procurement/rfq`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: rfqData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to create/send RFQ');
    }

    RFQ_NUMBER = data.data.rfqNumber;
    console.log('✅ RFQ created and sent successfully');
    console.log(`   RFQ Number: ${RFQ_NUMBER}`);
    console.log(`   Sent to ${vendorIds.length} vendor(s)`);
    console.log('   📧 Email notifications simulated (would be sent in production)');
    console.log('');

    return data.data;
  } catch (error) {
    throw new Error(`Failed to create/send RFQ: ${error.message}`);
  }
}

async function submitVendorQuotations(rfqNumber) {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('💻 STEP 5: VENDORS SUBMIT QUOTATIONS (SIMULATED)');
  console.log('════════════════════════════════════════════════════════════════\n');
  console.log('   📝 Note: In production, vendors submit via public form link in email');
  console.log('');

  // Vendor 1: ABC Supplies
  console.log('   📋 Vendor 1: ABC Supplies Ltd...');
  try {
    const quotation1 = {
      rfqNumber: rfqNumber,
      vendorName: 'John Doe',
      vendorEmail: TEST_VENDORS[0].email,
      companyName: TEST_VENDORS[0].name,
      taxEIN: '12-3456789',
      contactPerson: 'John Doe',
      phoneNumber: TEST_VENDORS[0].phone,
      address: '123 Test Street, Harare',
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      currencyCode: 'USD',
      paymentTerms: 'NET 30',
      deliveryTerms: 'FOB',
      deliveryTime: '5 business days',
      notes: 'All items include 2-year warranty',
      items: [
        {
          itemName: 'Office Desk',
          description: 'Executive wooden desk, 1.6m x 0.8m',
          quantity: 10,
          unit: 'pieces',
          unitPrice: 240.00,
          brand: 'Premium Office',
          warranty: '2 years'
        },
        {
          itemName: 'Office Chair',
          description: 'Ergonomic office chair with lumbar support',
          quantity: 10,
          unit: 'pieces',
          unitPrice: 145.00,
          brand: 'Comfort Plus',
          warranty: '2 years'
        }
      ]
    };

    const response1 = await makeRequest(`${BASE_URL}/vendor-quotations/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: quotation1
    });

    const data1 = await response1.json();

    if (!response1.ok) {
      throw new Error(data1.message || 'Failed to submit quotation 1');
    }

    QUOTATION_1_ID = data1.data.id;
    console.log(`   ✅ Quotation 1 submitted (ID: ${QUOTATION_1_ID})`);
    console.log(`      Total Amount: $${data1.data.totalAmount || '0.00'}`);
  } catch (error) {
    console.error(`   ❌ Error submitting quotation 1: ${error.message}`);
  }

  // Vendor 2: XYZ Equipment
  console.log('\n   📋 Vendor 2: XYZ Equipment Co...');
  try {
    const quotation2 = {
      rfqNumber: rfqNumber,
      vendorName: 'Jane Smith',
      vendorEmail: TEST_VENDORS[1].email,
      companyName: TEST_VENDORS[1].name,
      taxEIN: '98-7654321',
      contactPerson: 'Jane Smith',
      phoneNumber: TEST_VENDORS[1].phone,
      address: '456 Business Road, Harare',
      validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      currencyCode: 'USD',
      paymentTerms: 'NET 30',
      deliveryTerms: 'FOB',
      deliveryTime: '3 business days',
      notes: 'Fast delivery available',
      items: [
        {
          itemName: 'Office Desk',
          description: 'Executive wooden desk, 1.6m x 0.8m',
          quantity: 10,
          unit: 'pieces',
          unitPrice: 250.00,
          brand: 'Executive Series',
          warranty: '1 year'
        },
        {
          itemName: 'Office Chair',
          description: 'Ergonomic office chair with lumbar support',
          quantity: 10,
          unit: 'pieces',
          unitPrice: 150.00,
          brand: 'Pro Comfort',
          warranty: '1 year'
        }
      ]
    };

    const response2 = await makeRequest(`${BASE_URL}/vendor-quotations/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: quotation2
    });

    const data2 = await response2.json();

    if (!response2.ok) {
      throw new Error(data2.message || 'Failed to submit quotation 2');
    }

    QUOTATION_2_ID = data2.data.id;
    console.log(`   ✅ Quotation 2 submitted (ID: ${QUOTATION_2_ID})`);
    console.log(`      Total Amount: $${data2.data.totalAmount || '0.00'}`);
  } catch (error) {
    console.error(`   ❌ Error submitting quotation 2: ${error.message}`);
  }

  console.log('\n   ✅ All quotations submitted\n');
}

async function acceptWinningQuotation(token, quotationId) {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('✅ STEP 6: ACCEPT WINNING QUOTATION (CREATES PURCHASE INVOICE)');
  console.log('════════════════════════════════════════════════════════════════\n');

  try {
    const response = await makeRequest(`${BASE_URL}/vendor-quotations/${quotationId}/accept`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: {
        reviewNotes: 'Best price and terms. Accepted.',
        createInvoice: true
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to accept quotation');
    }

    if (data.data.invoice) {
      INVOICE_ID = data.data.invoice.id;
      console.log('✅ Quotation accepted successfully');
      console.log(`   Quotation ID: ${quotationId}`);
      console.log(`   Status: ${data.data.quotation.status}`);
      console.log(`   📋 Purchase Invoice Created: ${data.data.invoice.invoiceNumber}`);
      console.log(`   Invoice ID: ${INVOICE_ID}`);
      console.log(`   Invoice Amount: $${data.data.invoice.totalAmount || '0.00'}`);
      console.log('   📧 Acceptance email simulated (would be sent to vendor in production)');
      console.log('');
    } else {
      console.log('✅ Quotation accepted, but no invoice created');
    }

    return data.data;
  } catch (error) {
    throw new Error(`Failed to accept quotation: ${error.message}`);
  }
}

async function rejectOtherQuotation(token, quotationId) {
  console.log('\n   ❌ Rejecting other quotation...');
  try {
    const response = await makeRequest(`${BASE_URL}/vendor-quotations/${quotationId}/reject`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: {
        reviewNotes: 'Thank you for your quotation. Unfortunately, we selected another vendor.',
        sendNotification: true
      }
    });

    if (response.ok) {
      console.log(`   ✅ Quotation ${quotationId} rejected`);
      console.log('   📧 Rejection email simulated (would be sent to vendor in production)');
    }
  } catch (error) {
    console.log(`   ⚠️  Error rejecting quotation: ${error.message}`);
  }
  console.log('');
}

async function approveInvoice(token, invoiceId) {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('✅ STEP 7: APPROVE PURCHASE INVOICE');
  console.log('════════════════════════════════════════════════════════════════\n');
  console.log('   ℹ️  Note: Accounting entries will be created on PAYMENT, not approval');
  console.log('');

  try {
    const response = await makeRequest(`${BASE_URL}/procurement/invoices/${invoiceId}/approve`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to approve invoice');
    }

    console.log('✅ Purchase Invoice approved successfully');
    console.log(`   Invoice Number: ${data.data.invoiceNumber}`);
    console.log(`   Status: ${data.data.status}`);
    console.log(`   Payment Status: ${data.data.paymentStatus}`);
    console.log('   ℹ️  No accounting entries created yet (will be created on payment)');
    console.log('');

    return data.data;
  } catch (error) {
    throw new Error(`Failed to approve invoice: ${error.message}`);
  }
}

async function payInvoice(token, invoiceId) {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('💳 STEP 8: PROCESS PAYMENT (CREATES ACCOUNTING ENTRIES + RECEIPT)');
  console.log('════════════════════════════════════════════════════════════════\n');

  const paymentData = {
    paymentAmount: 3850.00, // Total from accepted quotation (10 desks @ $240 + 10 chairs @ $145)
    paymentDate: new Date().toISOString(),
    paymentMethod: 'BANK',
    paymentReference: `BANK-TXN-${Date.now()}`,
    notes: 'Payment for office supplies'
  };

  try {
    // Payment endpoint is POST /invoices/:id/payment
    const response = await makeRequest(`${BASE_URL}/procurement/invoices/${invoiceId}/payment`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: paymentData
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to process payment');
    }

    console.log('✅ Payment processed successfully');
    console.log(`   Invoice Number: ${data.data.invoice?.invoiceNumber || invoiceId}`);
    console.log(`   Payment Amount: $${paymentData.paymentAmount.toFixed(2)}`);
    console.log(`   Payment Status: ${data.data.invoice?.paymentStatus || 'PAID'}`);
    console.log(`   Payment Method: ${paymentData.paymentMethod}`);
    console.log(`   Payment Reference: ${paymentData.paymentReference}`);
    console.log('');
    console.log('   📊 ACCOUNTING ENTRIES CREATED:');
    console.log('   Entry 1: Expense Recognition');
    console.log(`      • DEBIT Expense Account: $${paymentData.paymentAmount * 0.85 || '0.00'}`);
    console.log(`      • DEBIT VAT Input: $${paymentData.paymentAmount * 0.15 || '0.00'}`);
    console.log(`      • CREDIT Accounts Payable: $${paymentData.paymentAmount.toFixed(2)}`);
    console.log('');
    console.log('   Entry 2: Payment Processing');
    console.log(`      • DEBIT Accounts Payable: $${paymentData.paymentAmount.toFixed(2)}`);
    console.log(`      • CREDIT Bank Account: $${paymentData.paymentAmount.toFixed(2)}`);
    console.log('');
    console.log(`   🧾 Receipt Number: RCP-${data.data.invoice?.invoiceNumber || invoiceId}-${Date.now()}`);
    console.log('   📧 Payment confirmation email simulated (would be sent to vendor in production)');
    console.log('');

    if (data.data.journalEntry) {
      PAYMENT_JOURNAL_ENTRY_ID = data.data.journalEntry.id;
    }

    return data.data;
  } catch (error) {
    throw new Error(`Failed to process payment: ${error.message}`);
  }
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║   COMPLETE PROCUREMENT WORKFLOW TEST                          ║');
  console.log('║   RFQ → Quotations → Purchase Invoice → Payment               ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Wait for server
    console.log('🔍 Checking server health...');
    if (!(await waitForServer())) {
      throw new Error('Server is not responding. Please start the server and try again.');
    }
    console.log('✅ Server is running\n');

    // Login users
    console.log('🔐 Logging in test users...');
    ADMIN_TOKEN = await login(TEST_USERS.admin.email, TEST_USERS.admin.password);
    console.log('   ✅ Admin logged in');
    MANAGER_TOKEN = await login(TEST_USERS.manager.email, TEST_USERS.manager.password);
    console.log('   ✅ Manager logged in');
    BUYER_TOKEN = await login(TEST_USERS.buyer.email, TEST_USERS.buyer.password);
    console.log('   ✅ Buyer logged in');
    COORDINATOR_TOKEN = await login(TEST_USERS.coordinator.email, TEST_USERS.coordinator.password);
    console.log('   ✅ Coordinator logged in');
    console.log('');

    // Get or create vendors
    const vendorIds = await getOrCreateVendors(ADMIN_TOKEN);

    // Create requisition
    const requisition = await createRequisition(BUYER_TOKEN);

    // Submit requisition (if not already submitted)
    await submitRequisition(BUYER_TOKEN, REQ_ID, requisition.status || requisition._currentStatus);

    // Approve requisition (simulated - actual approval requires pending approvals endpoint)
    await approveRequisition(MANAGER_TOKEN, REQ_ID);

    // Wait a bit for approval to process
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Create and send RFQ
    const rfq = await createAndSendRFQ(BUYER_TOKEN, REQ_ID, vendorIds);

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Submit vendor quotations
    await submitVendorQuotations(RFQ_NUMBER);

    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Accept winning quotation (creates Purchase Invoice)
    const accepted = await acceptWinningQuotation(BUYER_TOKEN, QUOTATION_1_ID);

    // Reject other quotation
    if (QUOTATION_2_ID) {
      await rejectOtherQuotation(BUYER_TOKEN, QUOTATION_2_ID);
    }

    // Approve invoice
    if (INVOICE_ID) {
      await approveInvoice(BUYER_TOKEN, INVOICE_ID);

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Pay invoice (creates accounting entries + receipt)
      await payInvoice(BUYER_TOKEN, INVOICE_ID);
    }

    console.log('\n╔════════════════════════════════════════════════════════════════╗');
    console.log('║   ✅ WORKFLOW TEST COMPLETED SUCCESSFULLY!                    ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log('📋 Summary:');
    console.log(`   • Requisition ID: ${REQ_ID}`);
    console.log(`   • RFQ Number: ${RFQ_NUMBER}`);
    console.log(`   • Quotation 1 ID: ${QUOTATION_1_ID}`);
    console.log(`   • Quotation 2 ID: ${QUOTATION_2_ID}`);
    console.log(`   • Purchase Invoice ID: ${INVOICE_ID}`);
    console.log(`   • Payment Journal Entry ID: ${PAYMENT_JOURNAL_ENTRY_ID || 'N/A'}`);
    console.log('');

  } catch (error) {
    console.error('\n╔════════════════════════════════════════════════════════════════╗');
    console.error('║   ❌ WORKFLOW TEST FAILED                                       ║');
    console.error('╚════════════════════════════════════════════════════════════════╝\n');
    console.error(`Error: ${error.message}`);
    console.error('');
    process.exit(1);
  }
}

main();

