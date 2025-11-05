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
      log(`   Token: ${authToken.substring(0, 50)}...`, 'yellow');
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
    log(`\n📋 Testing: ${description}`, 'blue');
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
        log(`   Response keys: ${Object.keys(response.data.data).join(', ')}`, 'yellow');
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
      log(`   Message: ${error.response.data.message || JSON.stringify(error.response.data)}`, 'red');
      if (error.response.data.message && error.response.data.message.includes('Invalid `prisma')) {
        log(`   🔍 This looks like a Prisma query error - check if userId is being passed correctly`, 'yellow');
      }
    } else {
      log(`   ${error.message}`, 'red');
    }
    return { success: false, error: error.message };
  }
}

async function runAllTests() {
  log('\n' + '='.repeat(60), 'cyan');
  log('🧪 APPLICANT PORTAL ENDPOINTS TEST', 'cyan');
  log('='.repeat(60), 'cyan');

  // Login first
  const loginSuccess = await login();
  if (!loginSuccess) {
    log('\n❌ Cannot proceed without authentication', 'red');
    process.exit(1);
  }

  const results = [];

  // Test all endpoints
  results.push(await testEndpoint('GET', '/applicant/profile', 'Get applicant profile'));
  results.push(await testEndpoint('GET', '/applicant/application', 'Get applicant application'));
  results.push(await testEndpoint('GET', '/applicant/application/timeline', 'Get application timeline'));
  results.push(await testEndpoint('GET', '/applicant/company', 'Get applicant portfolio company'));
  results.push(await testEndpoint('GET', '/applicant/dashboard', 'Get applicant dashboard'));
  results.push(await testEndpoint('GET', '/applicant/investment', 'Get investment details'));
  results.push(await testEndpoint('GET', '/applicant/valuations', 'Get portfolio valuations'));
  results.push(await testEndpoint('GET', '/applicant/reports', 'Get performance reports'));

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
        const endpoints = [
          'Get applicant profile',
          'Get applicant application',
          'Get application timeline',
          'Get applicant portfolio company',
          'Get applicant dashboard',
          'Get investment details',
          'Get portfolio valuations',
          'Get performance reports'
        ];
        log(`   - ${endpoints[index]}: ${result.error}`, 'red');
      }
    });
  }

  log('\n' + '='.repeat(60), 'cyan');
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  log(`\n❌ Unexpected error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

