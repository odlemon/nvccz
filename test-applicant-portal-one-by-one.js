const axios = require('axios');
const BASE_URL = 'http://localhost:3004/api';

// Applicant credentials
const EMAIL = 'nyasha@lysp.io';
const PASSWORD = '0hmic0nmBR9IOROU';

let authToken = '';

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
      log(`   User ID: ${response.data.user?.id || 'N/A'}`, 'yellow');
      return true;
    } else {
      log('❌ Login failed: Invalid response', 'red');
      console.log(response.data);
      return false;
    }
  } catch (error) {
    log('❌ Login failed:', 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      log(`   Message: ${error.response.data.message || JSON.stringify(error.response.data)}`, 'red');
    } else {
      log(`   Error: ${error.message}`, 'red');
    }
    return false;
  }
}

async function testEndpoint(method, endpoint, description, data = null) {
  try {
    log(`\n${'='.repeat(60)}`, 'cyan');
    log(`📋 Testing: ${description}`, 'blue');
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
      if (response.data.data) {
        const dataKeys = Object.keys(response.data.data);
        log(`   Response data keys: ${dataKeys.join(', ')}`, 'yellow');
        if (dataKeys.length <= 5) {
          log(`   Data: ${JSON.stringify(response.data.data, null, 2)}`, 'yellow');
        }
      }
      return { success: true, data: response.data };
    } else {
      log(`   ❌ Failed: ${response.data.message}`, 'red');
      return { success: false, error: response.data.message };
    }
  } catch (error) {
    log(`   ❌ Error:`, 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      const errorMsg = error.response.data.message || JSON.stringify(error.response.data);
      if (errorMsg.length > 500) {
        log(`   Message: ${errorMsg.substring(0, 500)}...`, 'red');
      } else {
        log(`   Message: ${errorMsg}`, 'red');
      }
      if (error.response.data.message && error.response.data.message.includes('Invalid `prisma')) {
        log(`   🔍 Prisma query error - check if userId is being passed correctly`, 'yellow');
      }
    } else {
      log(`   ${error.message}`, 'red');
    }
    return { success: false, error: error.message };
  }
}

async function waitForServer() {
  log('\n⏳ Waiting for server to start...', 'cyan');
  for (let i = 0; i < 10; i++) {
    try {
      const response = await axios.get(`${BASE_URL.replace('/api', '')}/health`).catch(() => null);
      if (response) {
        log('✅ Server is ready!', 'green');
        return true;
      }
    } catch (e) {
      // Server not ready yet
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    process.stdout.write('.');
  }
  log('\n⚠️  Server might not be ready, continuing anyway...', 'yellow');
  return false;
}

async function runTests() {
  log('\n' + '='.repeat(60), 'cyan');
  log('🧪 APPLICANT PORTAL ENDPOINTS TEST (One by One)', 'cyan');
  log('='.repeat(60), 'cyan');

  // Wait for server
  await waitForServer();

  // Login first
  const loginSuccess = await login();
  if (!loginSuccess) {
    log('\n❌ Cannot proceed without authentication', 'red');
    process.exit(1);
  }

  // Test endpoints one by one
  const endpoints = [
    { method: 'GET', path: '/applicant/profile', desc: 'Get applicant profile' },
    { method: 'GET', path: '/applicant/application', desc: 'Get applicant application' },
    { method: 'GET', path: '/applicant/application/timeline', desc: 'Get application timeline' },
    { method: 'GET', path: '/applicant/company', desc: 'Get applicant portfolio company' },
    { method: 'GET', path: '/applicant/dashboard', desc: 'Get applicant dashboard' },
    { method: 'GET', path: '/applicant/investment', desc: 'Get investment details' },
    { method: 'GET', path: '/applicant/valuations', desc: 'Get portfolio valuations' },
    { method: 'GET', path: '/applicant/reports', desc: 'Get performance reports' }
  ];

  const results = [];
  
  for (const endpoint of endpoints) {
    const result = await testEndpoint(endpoint.method, endpoint.path, endpoint.desc);
    results.push(result);
    
    // Wait a bit between tests
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Summary
  log('\n' + '='.repeat(60), 'cyan');
  log('📊 TEST SUMMARY', 'cyan');
  log('='.repeat(60), 'cyan');

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  log(`\n✅ Successful: ${successful}/${results.length}`, successful === results.length ? 'green' : 'yellow');
  log(`❌ Failed: ${failed}/${results.length}`, failed > 0 ? 'red' : 'green');

  if (failed > 0) {
    log('\n❌ Failed Tests:', 'red');
    results.forEach((result, index) => {
      if (!result.success) {
        log(`   - ${endpoints[index].desc}: ${result.error}`, 'red');
      }
    });
  }

  log('\n' + '='.repeat(60), 'cyan');
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runTests().catch(error => {
  log(`\n❌ Unexpected error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

