// @ts-nocheck
/**
 * Script to verify and update approval configuration
 */

const http = require('http');
const https = require('https');

const BASE_URL = 'http://localhost:3000/api';

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

async function getActiveConfig(token) {
  try {
    const response = await makeRequest(`${BASE_URL}/procurement-approval-configs/active`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (!response.ok || !data.data) {
      return null;
    }

    return data.data;
  } catch (error) {
    return null;
  }
}

async function getAllConfigs(token) {
  try {
    const response = await makeRequest(`${BASE_URL}/procurement-approval-configs`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const data = await response.json();

    if (!response.ok || !data.data) {
      return [];
    }

    return data.data || [];
  } catch (error) {
    return [];
  }
}

async function createConfig(token) {
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

  const response = await makeRequest(`${BASE_URL}/procurement-approval-configs`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: config
  });

  const data = await response.json();
  return { ok: response.ok, data: data.data, message: data.message };
}

async function updateConfig(token, configId) {
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

  const response = await makeRequest(`${BASE_URL}/procurement-approval-configs/${configId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: config
  });

  const data = await response.json();
  return { ok: response.ok, data: data.data, message: data.message };
}

function verifyConfig(config) {
  console.log('\n🔍 VERIFYING CONFIGURATION');
  console.log('════════════════════════════════════════════════════════════════\n');

  if (!config) {
    console.log('❌ No configuration found');
    return false;
  }

  console.log(`✅ Config Found:`);
  console.log(`   ID: ${config.id}`);
  console.log(`   Name: ${config.name}`);
  console.log(`   Department: ${config.department || 'General'}`);
  console.log(`   Active: ${config.isActive}`);
  console.log(`   Total Stages: ${config.stages?.length || 0}\n`);

  const requiredStages = {
    'PURCHASE_REQUISITION': [
      { stepNumber: 1, roleCode: 'PROC_MGR' },
      { stepNumber: 2, roleCode: 'PROC_OFF' }
    ],
    'INVOICE': [
      { stepNumber: 1, roleCode: 'BUYER' },
      { stepNumber: 2, roleCode: 'PROC_COORD' },
      { stepNumber: 3, roleCode: 'PROC_MGR' }
    ],
    'PURCHASE_ORDER': [
      { stepNumber: 1, roleCode: 'PROC_MGR' }
    ]
  };

  const issues = [];
  let allGood = true;

  // Check each required stage
  for (const [stageType, requiredSteps] of Object.entries(requiredStages)) {
    const stages = config.stages?.filter(s => s.stageType === stageType) || [];
    
    console.log(`\n📋 ${stageType}:`);
    
    if (stages.length === 0) {
      console.log(`   ❌ Missing stage: ${stageType}`);
      issues.push(`Missing stage: ${stageType}`);
      allGood = false;
      continue;
    }

    // Sort by step number
    stages.sort((a, b) => a.stepNumber - b.stepNumber);
    
    // Verify steps
    for (let i = 0; i < requiredSteps.length; i++) {
      const required = requiredSteps[i];
      const actual = stages[i];

      if (!actual) {
        console.log(`   ❌ Missing Step ${required.stepNumber}: Expected roleCode ${required.roleCode}`);
        issues.push(`${stageType}: Missing Step ${required.stepNumber}`);
        allGood = false;
        continue;
      }

      if (actual.stepNumber !== required.stepNumber) {
        console.log(`   ⚠️  Step ${actual.stepNumber}: Expected step ${required.stepNumber}`);
        issues.push(`${stageType}: Wrong step number`);
        allGood = false;
      }

      if (actual.roleCode !== required.roleCode) {
        console.log(`   ❌ Step ${actual.stepNumber}: Expected roleCode "${required.roleCode}", got "${actual.roleCode}"`);
        issues.push(`${stageType} Step ${actual.stepNumber}: Wrong roleCode`);
        allGood = false;
      } else {
        console.log(`   ✅ Step ${actual.stepNumber}: ${actual.stepName || 'N/A'} - roleCode: ${actual.roleCode}`);
      }
    }

    // Check for extra steps
    if (stages.length > requiredSteps.length) {
      console.log(`   ⚠️  Extra steps found (expected ${requiredSteps.length}, got ${stages.length})`);
      for (let i = requiredSteps.length; i < stages.length; i++) {
        console.log(`      - Step ${stages[i].stepNumber}: ${stages[i].roleCode || 'N/A'}`);
      }
    }
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  
  if (allGood) {
    console.log('✅ Configuration is correct and has all required data!');
  } else {
    console.log(`❌ Configuration has ${issues.length} issue(s):`);
    issues.forEach(issue => console.log(`   - ${issue}`));
  }
  
  console.log('════════════════════════════════════════════════════════════════\n');

  return allGood;
}

async function main() {
  try {
    console.log('\n🔍 VERIFYING AND UPDATING APPROVAL CONFIGURATION');
    console.log('════════════════════════════════════════════════════════════════\n');

    // Login as admin
    console.log('🔐 Logging in as admin...');
    const token = await login('admin@nvccz.co.zw', 'admin123');
    console.log('✅ Login successful\n');

    // Get existing config
    console.log('📋 Checking for existing configuration...');
    let config = await getActiveConfig(token);
    
    if (!config) {
      const allConfigs = await getAllConfigs(token);
      if (allConfigs.length > 0) {
        config = allConfigs[0];
        console.log(`✅ Found ${allConfigs.length} config(s), using first one\n`);
      } else {
        console.log('⚠️  No configuration found\n');
      }
    } else {
      console.log('✅ Found active configuration\n');
    }

    // Verify config
    const isValid = verifyConfig(config);

    if (!isValid || !config) {
      console.log('\n🔧 FIXING CONFIGURATION...');
      console.log('════════════════════════════════════════════════════════════════\n');

      if (config) {
        console.log(`📝 Updating existing config (ID: ${config.id})...\n`);
        const result = await updateConfig(token, config.id);
        
        if (result.ok) {
          console.log('✅ Configuration updated successfully!\n');
          // Verify again
          const updatedConfig = await getActiveConfig(token) || await getAllConfigs(token)[0];
          verifyConfig(updatedConfig);
        } else {
          console.log(`❌ Failed to update: ${result.message}`);
        }
      } else {
        console.log('📝 Creating new configuration...\n');
        const result = await createConfig(token);
        
        if (result.ok) {
          console.log('✅ Configuration created successfully!\n');
          // Verify
          const newConfig = await getActiveConfig(token);
          verifyConfig(newConfig);
        } else {
          console.log(`❌ Failed to create: ${result.message}`);
        }
      }
    } else {
      console.log('\n✅ Configuration is already correct - no changes needed!\n');
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    process.exit(1);
  }
}

main();

