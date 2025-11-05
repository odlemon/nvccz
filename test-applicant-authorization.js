const axios = require('axios');
const BASE_URL = 'http://localhost:3004/api';

// Test with applicant credentials
const APPLICANT_EMAIL = 'nyasha@lysp.io';
const APPLICANT_PASSWORD = '0hmic0nmBR9IOROU';

// Test with non-applicant credentials (if available)
// You can use any admin or other user credentials here
const NON_APPLICANT_EMAIL = 'admin@nvccz.co.zw';
const NON_APPLICANT_PASSWORD = 'Admin123!'; // You'll need to provide the actual password

let applicantToken = '';
let nonApplicantToken = '';

// Color codes for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function login(email, password, userType) {
  try {
    log(`\n🔐 Logging in as ${userType}...`, 'cyan');
    const response = await axios.post(`${BASE_URL}/auth/login`, {
      email: email,
      password: password
    });

    if (response.data.success && response.data.token) {
      const token = response.data.token;
      log(`✅ ${userType} login successful!`, 'green');
      log(`   Role: ${response.data.user?.role?.name || response.data.user?.roleCode || 'N/A'}`, 'yellow');
      return token;
    } else {
      log(`❌ ${userType} login failed`, 'red');
      return null;
    }
  } catch (error) {
    log(`❌ ${userType} login failed: ${error.message}`, 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      log(`   Message: ${error.response.data.message || JSON.stringify(error.response.data)}`, 'red');
    }
    return null;
  }
}

async function testEndpoint(method, endpoint, description, token, expectedStatus = 200) {
  try {
    log(`\n${'─'.repeat(70)}`, 'cyan');
    log(`📋 ${description}`, 'blue');
    log(`   ${method.toUpperCase()} ${endpoint}`, 'yellow');
    log(`   Using token: ${token ? token.substring(0, 30) + '...' : 'NONE'}`, 'magenta');
    
    const config = {
      method: method.toLowerCase(),
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };

    const response = await axios(config);

    if (response.status === expectedStatus) {
      if (response.data.success !== false) {
        log(`   ✅ Success (Status: ${response.status})`, 'green');
        return { success: true, data: response.data, status: response.status };
      } else {
        log(`   ⚠️  Response indicates failure but status is ${response.status}`, 'yellow');
        log(`   Message: ${response.data.message}`, 'yellow');
        return { success: false, data: response.data, status: response.status };
      }
    } else {
      log(`   ⚠️  Unexpected status: ${response.status} (expected ${expectedStatus})`, 'yellow');
      return { success: false, data: response.data, status: response.status };
    }
  } catch (error) {
    if (error.response && error.response.status === expectedStatus) {
      log(`   ✅ Expected error (Status: ${error.response.status})`, 'green');
      log(`   Message: ${error.response.data.message || JSON.stringify(error.response.data)}`, 'yellow');
      return { success: true, error: error.response.data, status: error.response.status };
    } else {
      log(`   ❌ Error:`, 'red');
      if (error.response) {
        log(`   Status: ${error.response.status}`, 'red');
        const errorMsg = error.response.data.message || JSON.stringify(error.response.data);
        if (errorMsg.length > 300) {
          log(`   Message: ${errorMsg.substring(0, 300)}...`, 'red');
        } else {
          log(`   Message: ${errorMsg}`, 'red');
        }
        return { success: false, error: errorMsg, status: error.response.status, data: error.response.data };
      } else {
        log(`   ${error.message}`, 'red');
        return { success: false, error: error.message };
      }
    }
  }
}

async function runAuthorizationTests() {
  log('\n' + '='.repeat(70), 'cyan');
  log('🧪 APPLICANT PORTAL AUTHORIZATION TESTING', 'cyan');
  log('='.repeat(70), 'cyan');

  // Login as applicant
  applicantToken = await login(APPLICANT_EMAIL, APPLICANT_PASSWORD, 'Applicant');
  if (!applicantToken) {
    log('\n❌ Cannot proceed without applicant token', 'red');
    process.exit(1);
  }

  // Try to login as non-applicant (optional - may fail if credentials don't exist)
  try {
    nonApplicantToken = await login(NON_APPLICANT_EMAIL, NON_APPLICANT_PASSWORD, 'Non-Applicant');
    if (!nonApplicantToken) {
      log('\n⚠️  Non-applicant login failed - will only test with applicant token', 'yellow');
    }
  } catch (e) {
    log('\n⚠️  Non-applicant login skipped - will only test with applicant token', 'yellow');
  }

  const results = [];

  // ==========================================
  // SCENARIO 1: Test with Applicant (Should Work)
  // ==========================================
  log('\n' + '='.repeat(70), 'cyan');
  log('📋 SCENARIO 1: Testing with Applicant (Should Allow Access)', 'cyan');
  log('='.repeat(70), 'cyan');

  const applicantEndpoints = [
    { method: 'GET', path: '/applicant/profile', desc: '1.1 Get applicant profile' },
    { method: 'GET', path: '/applicant/application', desc: '1.2 Get applicant application' },
    { method: 'GET', path: '/applicant/application/timeline', desc: '1.3 Get application timeline' },
    { method: 'GET', path: '/applicant/company', desc: '1.4 Get applicant portfolio company' },
    { method: 'GET', path: '/applicant/dashboard', desc: '1.5 Get applicant dashboard' },
    { method: 'GET', path: '/applicant/investment', desc: '1.6 Get investment details' },
    { method: 'GET', path: '/applicant/valuations', desc: '1.7 Get portfolio valuations' },
    { method: 'GET', path: '/applicant/reports', desc: '1.8 Get performance reports' },
    { method: 'GET', path: '/term-sheets/my', desc: '1.9 Get my term sheets' }
  ];

  for (const endpoint of applicantEndpoints) {
    const result = await testEndpoint(endpoint.method, endpoint.path, endpoint.desc, applicantToken, 200);
    results.push({ ...result, scenario: 'Applicant Access', endpoint: endpoint.path });
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // ==========================================
  // SCENARIO 2: Test with Non-Applicant (Should Deny)
  // ==========================================
  if (nonApplicantToken) {
    log('\n' + '='.repeat(70), 'cyan');
    log('📋 SCENARIO 2: Testing with Non-Applicant (Should Deny Access)', 'cyan');
    log('='.repeat(70), 'cyan');

    for (const endpoint of applicantEndpoints) {
      const result = await testEndpoint(endpoint.method, endpoint.path, `2.x ${endpoint.desc} (Non-Applicant)`, nonApplicantToken, 403);
      results.push({ ...result, scenario: 'Non-Applicant Access', endpoint: endpoint.path });
      await new Promise(resolve => setTimeout(resolve, 300));
    }
  } else {
    log('\n⚠️  Skipping non-applicant tests (no non-applicant token available)', 'yellow');
  }

  // ==========================================
  // SCENARIO 3: Test without Token (Should Deny)
  // ==========================================
  log('\n' + '='.repeat(70), 'cyan');
  log('📋 SCENARIO 3: Testing without Token (Should Deny Access)', 'cyan');
  log('='.repeat(70), 'cyan');

  // Test a few endpoints without token
  const sampleEndpoints = applicantEndpoints.slice(0, 3);
  for (const endpoint of sampleEndpoints) {
    const result = await testEndpoint(endpoint.method, endpoint.path, `3.x ${endpoint.desc} (No Token)`, null, 401);
    results.push({ ...result, scenario: 'No Token', endpoint: endpoint.path });
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // ==========================================
  // SUMMARY
  // ==========================================
  log('\n' + '='.repeat(70), 'cyan');
  log('📊 AUTHORIZATION TEST SUMMARY', 'cyan');
  log('='.repeat(70), 'cyan');

  const applicantTests = results.filter(r => r.scenario === 'Applicant Access');
  const nonApplicantTests = results.filter(r => r.scenario === 'Non-Applicant Access');
  const noTokenTests = results.filter(r => r.scenario === 'No Token');

  log(`\n📈 Applicant Tests: ${applicantTests.filter(r => r.success).length}/${applicantTests.length} passed`, 'cyan');
  applicantTests.forEach((r, i) => {
    if (r.success) {
      log(`   ✅ ${applicantEndpoints[i].desc}`, 'green');
    } else {
      log(`   ❌ ${applicantEndpoints[i].desc} - ${r.error || 'Unknown error'}`, 'red');
    }
  });

  if (nonApplicantTests.length > 0) {
    log(`\n📈 Non-Applicant Tests: ${nonApplicantTests.filter(r => r.success && r.status === 403).length}/${nonApplicantTests.length} correctly denied`, 'cyan');
    nonApplicantTests.forEach((r, i) => {
      if (r.success && r.status === 403) {
        log(`   ✅ ${applicantEndpoints[i].desc} - Correctly denied (403)`, 'green');
      } else if (r.status === 403) {
        log(`   ✅ ${applicantEndpoints[i].desc} - Denied (403)`, 'green');
      } else {
        log(`   ❌ ${applicantEndpoints[i].desc} - Should be denied but got ${r.status}`, 'red');
      }
    });
  }

  if (noTokenTests.length > 0) {
    log(`\n📈 No Token Tests: ${noTokenTests.filter(r => r.success && r.status === 401).length}/${noTokenTests.length} correctly denied`, 'cyan');
    noTokenTests.forEach((r, i) => {
      if (r.success && r.status === 401) {
        log(`   ✅ ${sampleEndpoints[i].desc} - Correctly denied (401)`, 'green');
      } else {
        log(`   ❌ ${sampleEndpoints[i].desc} - Should be denied but got ${r.status}`, 'red');
      }
    });
  }

  log('\n' + '='.repeat(70), 'cyan');
  log('✅ Authorization testing completed!', 'green');
  log('='.repeat(70), 'cyan');
}

runAuthorizationTests().catch(error => {
  log(`\n❌ Unexpected error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

