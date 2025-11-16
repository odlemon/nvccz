// @ts-nocheck
/**
 * Test script for procurement approval workflow
 * Tests: Create config → Create requisition → Approve steps
 */

const http = require('http');
const https = require('https');

const BASE_URL = 'http://localhost:3000/api';
let ADMIN_TOKEN = '';
let MANAGER_TOKEN = '';
let OFFICER_TOKEN = '';
let BUYER_TOKEN = '';
let CONFIG_ID = '';
let REQ_ID = '';
let APPROVAL_REQUEST_ID = '';
let STAGE_1_ID = '';
let STAGE_2_ID = '';

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
  officer: {
    email: 'proc.officer@testnvccz.com',
    password: 'TestPass123!'
  },
  buyer: {
    email: 'proc.buyer@testnvccz.com',
    password: 'TestPass123!'
  }
};

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

async function createApprovalConfig(token) {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('📋 STEP 1: CREATE APPROVAL CONFIGURATION');
  console.log('════════════════════════════════════════════════════════════════\n');

  const config = {
    name: "Procurement Department Approval Workflow",
    description: "Multi-step approval workflow for Procurement department",
    department: "Procurement",
    isActive: true,
    stages: [
      {
        stageType: "PURCHASE_REQUISITION",
        steps: [
          {
            stepNumber: 1,
            stepName: "Department Head Approval",
            stepType: "ROLE",
            roleCode: "PROC_MGR",
            isRequired: true,
            canDelegate: false,
            autoApprove: false,
            approvalOrder: "SEQUENTIAL"
          },
          {
            stepNumber: 2,
            stepName: "Deputy Head Approval",
            stepType: "ROLE",
            roleCode: "PROC_OFF",
            isRequired: true,
            canDelegate: false,
            autoApprove: false,
            approvalOrder: "SEQUENTIAL"
          }
        ]
      },
      {
        stageType: "INVOICE",
        steps: [
          {
            stepNumber: 1,
            stepName: "Buyer Review",
            stepType: "ROLE",
            roleCode: "BUYER",
            isRequired: true,
            canDelegate: false,
            autoApprove: false,
            approvalOrder: "SEQUENTIAL"
          },
          {
            stepNumber: 2,
            stepName: "Coordinator Verification",
            stepType: "ROLE",
            roleCode: "PROC_COORD",
            isRequired: true,
            canDelegate: false,
            autoApprove: false,
            approvalOrder: "SEQUENTIAL"
          },
          {
            stepNumber: 3,
            stepName: "Manager Final Approval",
            stepType: "ROLE",
            roleCode: "PROC_MGR",
            isRequired: true,
            canDelegate: false,
            autoApprove: false,
            approvalOrder: "SEQUENTIAL"
          }
        ]
      },
      {
        stageType: "PURCHASE_ORDER",
        steps: [
          {
            stepNumber: 1,
            stepName: "Manager Approval",
            stepType: "ROLE",
            roleCode: "PROC_MGR",
            isRequired: true,
            canDelegate: false,
            autoApprove: false,
            approvalOrder: "SEQUENTIAL"
          }
        ]
      }
    ]
  };

  try {
    const response = await makeRequest(`${BASE_URL}/procurement-approval-configs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: config
    });

    const data = await response.json();

    if (!response.ok) {
      if (data.message && data.message.includes('already exists')) {
        console.log('⚠️  Config already exists (single config system enforced)');
        if (data.existingConfigId) {
          console.log(`   Existing Config ID: ${data.existingConfigId}`);
          console.log(`   Use PUT to update it instead`);
          // Fetch and return existing config
          return await getActiveConfig(token);
        }
        // Try to fetch existing config
        return await getActiveConfig(token);
      }
      throw new Error(data.message || 'Failed to create config');
    }

    console.log('✅ Approval configuration created successfully');
    console.log(`   Config ID: ${data.data.id}`);
    console.log(`   Name: ${data.data.name}`);
    console.log(`   Department: ${data.data.department || 'General'}`);
    console.log(`   Active: ${data.data.isActive}`);
    console.log(`   Total Stages: ${data.data.stages?.length || 0}`);
    console.log('');

    // Extract stage IDs
    if (data.data.stages) {
      const reqStages = data.data.stages.filter(s => s.stageType === 'PURCHASE_REQUISITION');
      if (reqStages.length >= 1) STAGE_1_ID = reqStages[0].id;
      if (reqStages.length >= 2) STAGE_2_ID = reqStages[1].id;
      console.log(`   Stage IDs:`);
      console.log(`   - Step 1 (PROC_MGR): ${STAGE_1_ID || 'Not found'}`);
      console.log(`   - Step 2 (PROC_OFF): ${STAGE_2_ID || 'Not found'}`);
    }

    return data.data;
  } catch (error) {
    throw new Error(`Failed to create approval config: ${error.message}`);
  }
}

async function getActiveConfig(token) {
  const response = await makeRequest(`${BASE_URL}/procurement-approval-configs/active`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const data = await response.json();

  if (!response.ok || !data.data) {
    throw new Error('No active config found');
  }

  console.log('✅ Using existing active config');
  console.log(`   Config ID: ${data.data.id}`);
  
  const reqStages = data.data.stages?.filter(s => s.stageType === 'PURCHASE_REQUISITION') || [];
  if (reqStages.length >= 1) STAGE_1_ID = reqStages[0].id;
  if (reqStages.length >= 2) STAGE_2_ID = reqStages[1].id;

  return data.data;
}

async function createRequisition(token) {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('📝 STEP 2: CREATE PURCHASE REQUISITION');
  console.log('════════════════════════════════════════════════════════════════\n');

  const requisition = {
    title: "Test Requisition - Office Supplies Q1 2025",
    description: "Testing approval workflow with office supplies requisition",
    department: "Procurement",
    priority: "HIGH",
    justification: "Essential supplies for Q1 operations",
    items: [
      {
        itemName: "Printer Paper - A4",
        description: "Standard A4 printer paper, 500 sheets per ream",
        quantity: 10,
        unit: "reams"
      },
      {
        itemName: "Office Pens",
        description: "Blue ink ballpoint pens, 12-pack",
        quantity: 5,
        unit: "packs"
      }
    ]
  };

  try {
    const response = await makeRequest(`${BASE_URL}/procurement/requisitions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: requisition
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to create requisition');
    }

    console.log('✅ Purchase requisition created successfully');
    console.log(`   Requisition ID: ${data.data.id}`);
    console.log(`   Requisition Number: ${data.data.requisitionNumber}`);
    console.log(`   Status: ${data.data.status}`);
    console.log(`   Department: ${data.data.department}`);
    console.log(`   Items: ${data.data.items?.length || 0}`);
    console.log('');

    if (data.data.status === 'PENDING_APPROVAL') {
      console.log('✅ Approval request automatically created');
      console.log('   Status: PENDING_APPROVAL');
      console.log('   Waiting for Step 1 approval (PROC_MGR)...');
    }

    return data.data;
  } catch (error) {
    throw new Error(`Failed to create requisition: ${error.message}`);
  }
}

async function getPendingApprovals(token) {
  try {
    const response = await makeRequest(`${BASE_URL}/procurement-approval-configs/requests/my?status=PENDING`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to get approvals');
    }

    return data.data || [];
  } catch (error) {
    console.log(`⚠️  Failed to get approvals: ${error.message}`);
    return [];
  }
}

async function approveStep(token, requestId, stageId, comments) {
  try {
    const response = await makeRequest(`${BASE_URL}/procurement-approval-configs/requests/${requestId}/stages/${stageId}/approve`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: {
        status: 'APPROVED',
        comments: comments
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to approve');
    }

    return data.data;
  } catch (error) {
    throw new Error(`Failed to approve step: ${error.message}`);
  }
}

async function getRequisition(token, reqId) {
  try {
    const response = await makeRequest(`${BASE_URL}/procurement/requisitions/${reqId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to get requisition');
    }

    return data.data;
  } catch (error) {
    throw new Error(`Failed to get requisition: ${error.message}`);
  }
}

async function updateApprovalConfig(token, configId) {
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('📝 UPDATE APPROVAL CONFIGURATION (SINGLE CONFIG SYSTEM)');
  console.log('════════════════════════════════════════════════════════════════\n');

  const config = {
    name: "Procurement Department Approval Workflow",
    description: "Multi-step approval workflow for Procurement department",
    department: "Procurement",
    isActive: true,
    stages: [
      {
        stageType: "PURCHASE_REQUISITION",
        steps: [
          {
            stepNumber: 1,
            stepName: "Department Head Approval",
            stepType: "ROLE",
            roleCode: "PROC_MGR",
            isRequired: true,
            canDelegate: false,
            autoApprove: false,
            approvalOrder: "SEQUENTIAL"
          },
          {
            stepNumber: 2,
            stepName: "Deputy Head Approval",
            stepType: "ROLE",
            roleCode: "PROC_OFF",
            isRequired: true,
            canDelegate: false,
            autoApprove: false,
            approvalOrder: "SEQUENTIAL"
          }
        ]
      },
      {
        stageType: "INVOICE",
        steps: [
          {
            stepNumber: 1,
            stepName: "Buyer Review",
            stepType: "ROLE",
            roleCode: "BUYER",
            isRequired: true,
            canDelegate: false,
            autoApprove: false,
            approvalOrder: "SEQUENTIAL"
          },
          {
            stepNumber: 2,
            stepName: "Coordinator Verification",
            stepType: "ROLE",
            roleCode: "PROC_COORD",
            isRequired: true,
            canDelegate: false,
            autoApprove: false,
            approvalOrder: "SEQUENTIAL"
          },
          {
            stepNumber: 3,
            stepName: "Manager Final Approval",
            stepType: "ROLE",
            roleCode: "PROC_MGR",
            isRequired: true,
            canDelegate: false,
            autoApprove: false,
            approvalOrder: "SEQUENTIAL"
          }
        ]
      },
      {
        stageType: "PURCHASE_ORDER",
        steps: [
          {
            stepNumber: 1,
            stepName: "Manager Approval",
            stepType: "ROLE",
            roleCode: "PROC_MGR",
            isRequired: true,
            canDelegate: false,
            autoApprove: false,
            approvalOrder: "SEQUENTIAL"
          }
        ]
      }
    ]
  };

  try {
    const response = await makeRequest(`${BASE_URL}/procurement-approval-configs/${configId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: config
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to update config');
    }

    console.log('✅ Approval configuration updated successfully');
    console.log(`   Config ID: ${data.data.id}`);
    console.log(`   Name: ${data.data.name}`);
    console.log(`   Department: ${data.data.department || 'General'}`);
    console.log(`   Active: ${data.data.isActive}`);
    console.log(`   Total Stages: ${data.data.stages?.length || 0}`);
    console.log('');

    // Extract stage IDs
    if (data.data.stages) {
      const reqStages = data.data.stages.filter(s => s.stageType === 'PURCHASE_REQUISITION');
      if (reqStages.length >= 1) STAGE_1_ID = reqStages[0].id;
      if (reqStages.length >= 2) STAGE_2_ID = reqStages[1].id;
      console.log(`   Stage IDs:`);
      console.log(`   - Step 1 (PROC_MGR): ${STAGE_1_ID || 'Not found'}`);
      console.log(`   - Step 2 (PROC_OFF): ${STAGE_2_ID || 'Not found'}`);
    }

    return data.data;
  } catch (error) {
    throw new Error(`Failed to update approval config: ${error.message}`);
  }
}

async function checkServer() {
  try {
    const response = await makeRequest(`${BASE_URL}/health`, {
      method: 'GET'
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

async function testApprovalWorkflow() {
  try {
    console.log('\n🧪 TESTING PROCUREMENT APPROVAL WORKFLOW');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Check server
    console.log('🔍 Checking server availability...');
    const serverRunning = await checkServer();
    if (!serverRunning) {
      console.log('⚠️  Server health check failed, but continuing...');
    } else {
      console.log('✅ Server is running\n');
    }

    // Step 0: Login as Admin
    console.log('🔐 STEP 0: LOGIN AS ADMIN');
    console.log('────────────────────────────────────────────────────────────────\n');
    
    let retryCount = 0;
    let loginSuccess = false;
    while (retryCount < 3 && !loginSuccess) {
      try {
        ADMIN_TOKEN = await login(TEST_USERS.admin.email, TEST_USERS.admin.password);
        loginSuccess = true;
      } catch (error) {
        retryCount++;
        if (retryCount < 3) {
          console.log(`⚠️  Login failed, retrying (${retryCount}/3)...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          throw error;
        }
      }
    }
    
    console.log('✅ Admin login successful');
    console.log(`   Token: ${ADMIN_TOKEN.substring(0, 20)}...\n`);

    // Step 1: Get or Create Approval Config (SINGLE CONFIG SYSTEM)
    console.log('🔍 Checking for existing approval configuration...\n');
    
    let config;
    try {
      const activeConfig = await getActiveConfig(ADMIN_TOKEN);
      config = activeConfig;
      CONFIG_ID = config.id;
      console.log('📝 Existing config found - updating it instead...\n');
      config = await updateApprovalConfig(ADMIN_TOKEN, CONFIG_ID);
      CONFIG_ID = config.id;
    } catch (error) {
      // No config exists, create new one
      console.log('📝 No existing config found - creating new one...\n');
      config = await createApprovalConfig(ADMIN_TOKEN);
      CONFIG_ID = config.id;
    }

    // Step 2: Login as Buyer
    console.log('🔐 STEP 2: LOGIN AS BUYER');
    console.log('────────────────────────────────────────────────────────────────\n');
    BUYER_TOKEN = await login(TEST_USERS.buyer.email, TEST_USERS.buyer.password);
    console.log('✅ Buyer login successful\n');

    // Step 3: Create Requisition
    const requisition = await createRequisition(BUYER_TOKEN);
    REQ_ID = requisition.id;

    // Step 4: Submit Requisition if still in DRAFT
    if (requisition.status === 'DRAFT') {
      console.log('\n📤 STEP 3: SUBMIT REQUISITION FOR APPROVAL');
      console.log('────────────────────────────────────────────────────────────────\n');
      console.log('⚠️  Requisition is in DRAFT status, submitting for approval...');
      
      try {
        const submitResponse = await makeRequest(`${BASE_URL}/procurement/requisitions/${REQ_ID}/submit`, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${BUYER_TOKEN}`
          }
        });

        const submitData = await submitResponse.json();
        
        if (submitResponse.ok) {
          console.log('✅ Requisition submitted successfully');
          console.log(`   Status: ${submitData.data.status}`);
          requisition.status = submitData.data.status;
        } else {
          console.log(`⚠️  Submit failed: ${submitData.message}`);
        }
      } catch (error) {
        console.log(`⚠️  Error submitting: ${error.message}`);
      }
      
      console.log('');
      
      // Wait for approval creation
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log('🔍 STEP 3: CHECK PENDING APPROVALS (as Manager)');
    console.log('────────────────────────────────────────────────────────────────\n');

    // Login as Manager
    MANAGER_TOKEN = await login(TEST_USERS.manager.email, TEST_USERS.manager.password);
    console.log('✅ Manager login successful\n');

    const approvals = await getPendingApprovals(MANAGER_TOKEN);

    if (approvals.length === 0) {
      console.log('⚠️  No pending approvals found for Manager');
      console.log('   This might mean:');
      console.log('   - Approval request not created automatically');
      console.log('   - Manager is not assigned to Step 1');
      console.log('   - Approval config not found\n');
      return;
    }

    const approvalRequest = approvals[0];
    APPROVAL_REQUEST_ID = approvalRequest.id;

    console.log(`✅ Found ${approvals.length} pending approval(s)`);
    console.log(`   Approval Request ID: ${APPROVAL_REQUEST_ID}`);
    console.log(`   Stage Type: ${approvalRequest.stageType}`);
    console.log(`   Entity ID: ${approvalRequest.entityId}`);
    console.log(`   Current Step: ${approvalRequest.currentStep}/${approvalRequest.totalSteps}`);
    console.log('');

    // Get step IDs from approvals
    if (approvalRequest.approvals && approvalRequest.approvals.length > 0) {
      const step1Approval = approvalRequest.approvals.find(a => a.stage?.stepNumber === 1);
      const step2Approval = approvalRequest.approvals.find(a => a.stage?.stepNumber === 2);

      if (step1Approval) {
        STAGE_1_ID = step1Approval.stageId;
        console.log(`   Step 1 Stage ID: ${STAGE_1_ID}`);
        console.log(`   Step 1 Status: ${step1Approval.status}`);
      }
      if (step2Approval) {
        STAGE_2_ID = step2Approval.stageId;
        console.log(`   Step 2 Stage ID: ${STAGE_2_ID}`);
        console.log(`   Step 2 Status: ${step2Approval.status}`);
      }
    }

    if (!STAGE_1_ID) {
      console.log('⚠️  Step 1 stage ID not found. Getting from config...');
      // Try to get from config stages
      if (config.stages) {
        const reqStages = config.stages.filter(s => s.stageType === 'PURCHASE_REQUISITION');
        if (reqStages.length >= 1) STAGE_1_ID = reqStages[0].id;
        if (reqStages.length >= 2) STAGE_2_ID = reqStages[1].id;
        console.log(`   Step 1 Stage ID: ${STAGE_1_ID || 'Still not found'}`);
        console.log(`   Step 2 Stage ID: ${STAGE_2_ID || 'Still not found'}`);
      }
    }

    // Step 5: Approve Step 1 (Manager)
    console.log('\n✅ STEP 4: APPROVE STEP 1 (as Manager - PROC_MGR)');
    console.log('────────────────────────────────────────────────────────────────\n');

    if (!STAGE_1_ID) {
      console.log('❌ Cannot proceed - Stage 1 ID not found');
      return;
    }

    const step1Result = await approveStep(
      MANAGER_TOKEN,
      APPROVAL_REQUEST_ID,
      STAGE_1_ID,
      "Step 1 approved - Office supplies are essential for operations"
    );

    console.log('✅ Step 1 approved successfully');
    console.log(`   Approved by: Manager (PROC_MGR)`);
    console.log(`   Comments: ${step1Result.comments || 'N/A'}`);
    console.log(`   Approved At: ${step1Result.approvedAt || 'N/A'}`);
    console.log('');
    console.log('⏭️  Moving to Step 2...\n');

    // Wait a bit for system to process
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 6: Approve Step 2 (Officer)
    console.log('✅ STEP 5: APPROVE STEP 2 (as Officer - PROC_OFF)');
    console.log('────────────────────────────────────────────────────────────────\n');

    OFFICER_TOKEN = await login(TEST_USERS.officer.email, TEST_USERS.officer.password);
    console.log('✅ Officer login successful\n');

    // Get updated approvals to find Step 2 stage ID
    const officerApprovals = await getPendingApprovals(OFFICER_TOKEN);
    
    if (officerApprovals.length === 0) {
      console.log('⚠️  No pending approvals found for Officer');
      console.log('   Checking if we can use saved Stage 2 ID...\n');
    } else {
      const officerApproval = officerApprovals[0];
      const step2Approval = officerApproval.approvals?.find(a => a.stage?.stepNumber === 2);
      if (step2Approval) {
        STAGE_2_ID = step2Approval.stageId;
        APPROVAL_REQUEST_ID = officerApproval.id;
      }
      console.log(`✅ Found ${officerApprovals.length} pending approval(s) for Officer`);
      console.log(`   Approval Request ID: ${APPROVAL_REQUEST_ID}`);
      console.log(`   Step 2 Stage ID: ${STAGE_2_ID || 'Not found'}\n`);
    }

    if (!STAGE_2_ID) {
      console.log('⚠️  Step 2 stage ID not found. Using config stage ID...');
      if (config.stages) {
        const reqStages = config.stages.filter(s => s.stageType === 'PURCHASE_REQUISITION');
        if (reqStages.length >= 2) STAGE_2_ID = reqStages[1].id;
        console.log(`   Step 2 Stage ID: ${STAGE_2_ID || 'Still not found'}\n`);
      }
      if (!STAGE_2_ID) {
        console.log('❌ Cannot proceed - Stage 2 ID not found');
        return;
      }
    }

    const step2Result = await approveStep(
      OFFICER_TOKEN,
      APPROVAL_REQUEST_ID,
      STAGE_2_ID,
      "Step 2 approved - Final approval granted. Proceed with RFQ process"
    );

    console.log('✅ Step 2 approved successfully');
    console.log(`   Approved by: Officer (PROC_OFF)`);
    console.log(`   Comments: ${step2Result.comments || 'N/A'}`);
    console.log(`   Approved At: ${step2Result.approvedAt || 'N/A'}`);
    console.log('');

    // Wait for system to process
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Step 7: Verify Requisition Status
    console.log('\n🔍 STEP 6: VERIFY REQUISITION STATUS');
    console.log('────────────────────────────────────────────────────────────────\n');

    const finalRequisition = await getRequisition(BUYER_TOKEN, REQ_ID);

    console.log('📊 Final Requisition Status:');
    console.log(`   ID: ${finalRequisition.id}`);
    console.log(`   Number: ${finalRequisition.requisitionNumber}`);
    console.log(`   Status: ${finalRequisition.status}`);
    console.log(`   Department: ${finalRequisition.department}`);
    console.log('');

    if (finalRequisition.status === 'APPROVED') {
      console.log('🎉 SUCCESS! Requisition fully approved after 2 steps!');
      console.log('   ✅ Step 1: PROC_MGR (Manager) approved');
      console.log('   ✅ Step 2: PROC_OFF (Officer) approved');
      console.log('   ✅ Requisition status: APPROVED');
    } else {
      console.log(`⚠️  Requisition status is: ${finalRequisition.status}`);
      console.log('   Expected: APPROVED');
      console.log('   Approval workflow may not have completed correctly');
    }

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('✅ APPROVAL WORKFLOW TEST COMPLETE');
    console.log('════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Run the test
testApprovalWorkflow();

