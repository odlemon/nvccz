const axios = require('axios');
const BASE_URL = 'http://localhost:3004/api';

// Applicant credentials
const EMAIL = 'nyasha@lysp.io';
const PASSWORD = '0hmic0nmBR9IOROU';

let authToken = '';
let applicationId = '';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function login() {
  try {
    log('\n🔐 Logging in...', 'cyan');
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: EMAIL,
      password: PASSWORD
    });

    if (response.data.success && response.data.token) {
      authToken = response.data.token;
      log('✅ Login successful!', 'green');
      return true;
    } else {
      log('❌ Login failed', 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Login failed: ${error.message}`, 'red');
    return false;
  }
}

async function testEndpoint(method, endpoint, description, data = null) {
  try {
    log(`\n${'='.repeat(70)}`, 'cyan');
    log(`📋 ${description}`, 'blue');
    log(`   ${method.toUpperCase()} ${endpoint}`, 'yellow');
    
    const config = {
      method: method.toLowerCase(),
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);

    if (response.data.success !== false) {
      log(`   ✅ Success`, 'green');
      return { success: true, data: response.data };
    } else {
      log(`   ❌ Failed: ${response.data.message}`, 'red');
      return { success: false, error: response.data.message, data: response.data };
    }
  } catch (error) {
    log(`   ❌ Error:`, 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      const errorMsg = error.response.data.message || JSON.stringify(error.response.data);
      log(`   Message: ${errorMsg}`, 'red');
      return { success: false, error: errorMsg, status: error.response.status, data: error.response.data };
    } else {
      log(`   ${error.message}`, 'red');
      return { success: false, error: error.message };
    }
  }
}

async function analyzeTermSheet(data) {
  if (data && data.termSheet) {
    const ts = data.termSheet;
    log(`\n📄 TERM SHEET ANALYSIS:`, 'yellow');
    log(`   ID: ${ts.id}`, 'yellow');
    log(`   Status: ${ts.status}`, ts.status === 'FINAL' ? 'green' : ts.status === 'SIGNED' ? 'green' : 'yellow');
    log(`   Is Draft: ${ts.isDraft}`, 'yellow');
    log(`   Is Final: ${ts.isFinal}`, 'yellow');
    log(`   Is Signed: ${ts.isSigned}`, 'yellow');
    log(`   Can Sign: ${ts.status === 'FINAL' && !ts.isSigned ? 'YES ✅' : 'NO ❌'}`, 
        ts.status === 'FINAL' && !ts.isSigned ? 'green' : 'yellow');
    
    return ts;
  }
  return null;
}

async function runTests() {
  log('\n' + '='.repeat(70), 'cyan');
  log('🧪 TERM SHEET CHECK AND SIGN TEST', 'cyan');
  log('='.repeat(70), 'cyan');

  const loginSuccess = await login();
  if (!loginSuccess) {
    log('\n❌ Cannot proceed without authentication', 'red');
    process.exit(1);
  }

  // Step 1: Get investment details to find term sheet and application ID
  log('\n📋 Step 1: Getting investment details...', 'cyan');
  const investmentResult = await testEndpoint('GET', '/applicant/investment', 'Get Investment Details');
  
  if (investmentResult.success && investmentResult.data.data) {
    const termSheet = await analyzeTermSheet(investmentResult.data.data);
    
    if (termSheet && termSheet.applicationId) {
      applicationId = termSheet.applicationId;
      log(`\n   Found Application ID: ${applicationId}`, 'yellow');
    }
  }

  // Step 2: Check /term-sheets/my endpoint
  log('\n📋 Step 2: Checking /term-sheets/my endpoint...', 'cyan');
  const myTermSheetsResult = await testEndpoint('GET', '/term-sheets/my', 'Get My Term Sheets');
  
  if (myTermSheetsResult.success) {
    log(`   ✅ Endpoint working - returned data`, 'green');
    if (myTermSheetsResult.data.data) {
      log(`   Total term sheets: ${myTermSheetsResult.data.data.total || 0}`, 'yellow');
      log(`   Term sheets array length: ${myTermSheetsResult.data.data.termSheets?.length || 0}`, 'yellow');
    }
  } else {
    log(`   ❌ Endpoint failed with status: ${myTermSheetsResult.status}`, 'red');
  }

  // Step 3: Try to sign the term sheet
  if (applicationId) {
    log('\n📋 Step 3: Attempting to sign term sheet...', 'cyan');
    log(`   Application ID: ${applicationId}`, 'yellow');
    
    const signResult = await testEndpoint('POST', `/term-sheets/${applicationId}/sign`, 'Sign Term Sheet');
    
    if (signResult.success) {
      log(`\n   ✅ Term sheet signed successfully!`, 'green');
      if (signResult.data.data) {
        log(`   New Status: ${signResult.data.data.status}`, 'green');
        log(`   Is Signed: ${signResult.data.data.isSigned}`, 'green');
        log(`   Signed At: ${signResult.data.data.signedAt}`, 'green');
      }
    } else {
      log(`\n   ❌ Failed to sign term sheet`, 'red');
      log(`   Reason: ${signResult.error}`, 'red');
      
      // Check if it's because status is not FINAL
      if (signResult.error && signResult.error.includes('FINAL')) {
        log(`\n   ℹ️  The term sheet must be in FINAL status before it can be signed.`, 'yellow');
        log(`   Current status is DRAFT. An admin must finalize it first.`, 'yellow');
      }
    }
  } else {
    log('\n   ⚠️  No application ID found, cannot attempt to sign', 'yellow');
  }

  log('\n' + '='.repeat(70), 'cyan');
  log('📊 TEST SUMMARY', 'cyan');
  log('='.repeat(70), 'cyan');
  
  log('\n✅ All tests completed', 'green');
}

runTests().catch(error => {
  log(`\n❌ Unexpected error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

