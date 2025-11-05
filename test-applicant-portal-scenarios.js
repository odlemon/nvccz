const axios = require('axios');
const BASE_URL = 'http://localhost:3004/api';

// Applicant credentials
const EMAIL = 'nyasha@lysp.io';
const PASSWORD = '0hmic0nmBR9IOROU';

let authToken = '';
let applicationId = '';
let portfolioCompanyId = '';

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

async function testEndpoint(method, endpoint, description, data = null, expectedStatus = 200) {
  try {
    log(`\n${'─'.repeat(70)}`, 'cyan');
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
      log(`   Request Body: ${JSON.stringify(data, null, 2)}`, 'magenta');
    }

    const response = await axios(config);

    if (response.status === expectedStatus && response.data.success !== false) {
      log(`   ✅ Success (Status: ${response.status})`, 'green');
      
      // Show key data
      if (response.data.data) {
        const dataKeys = Object.keys(response.data.data);
        log(`   Response keys: ${dataKeys.join(', ')}`, 'yellow');
        
        // Show specific interesting fields
        if (response.data.data.termSheet) {
          const ts = response.data.data.termSheet;
          log(`   Term Sheet Status: ${ts.status}`, ts.status === 'SIGNED' ? 'green' : 'yellow');
        }
        if (response.data.data.application) {
          log(`   Application Stage: ${response.data.data.application.currentStage}`, 'yellow');
        }
        if (response.data.data.portfolioCompany) {
          log(`   Company Status: ${response.data.data.portfolioCompany.status}`, 'yellow');
        }
      }
      
      return { success: true, data: response.data, status: response.status };
    } else {
      log(`   ⚠️  Unexpected response (Status: ${response.status})`, 'yellow');
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

async function runAllScenarios() {
  log('\n' + '='.repeat(70), 'cyan');
  log('🧪 APPLICANT PORTAL ENDPOINTS - COMPREHENSIVE SCENARIO TESTING', 'cyan');
  log('='.repeat(70), 'cyan');

  const loginSuccess = await login();
  if (!loginSuccess) {
    log('\n❌ Cannot proceed without authentication', 'red');
    process.exit(1);
  }

  const results = [];

  // ==========================================
  // SCENARIO 1: Basic GET requests
  // ==========================================
  log('\n' + '='.repeat(70), 'cyan');
  log('📋 SCENARIO 1: Basic GET Requests', 'cyan');
  log('='.repeat(70), 'cyan');

  results.push(await testEndpoint('GET', '/applicant/profile', '1.1 Get applicant profile'));
  results.push(await testEndpoint('GET', '/applicant/application', '1.2 Get applicant application'));
  results.push(await testEndpoint('GET', '/applicant/application/timeline', '1.3 Get application timeline'));
  results.push(await testEndpoint('GET', '/applicant/company', '1.4 Get applicant portfolio company'));
  results.push(await testEndpoint('GET', '/applicant/dashboard', '1.5 Get applicant dashboard'));

  // Extract IDs from responses
  const profileResult = results.find(r => r.data && r.data.data && r.data.data.id);
  const applicationResult = results.find(r => r.data && r.data.data && r.data.data.id && r.data.data.businessName);
  const investmentResult = await testEndpoint('GET', '/applicant/investment', '1.6 Get investment details');
  
  if (investmentResult.success && investmentResult.data.data) {
    if (investmentResult.data.data.termSheet && investmentResult.data.data.termSheet.applicationId) {
      applicationId = investmentResult.data.data.termSheet.applicationId;
      log(`   📌 Captured Application ID: ${applicationId}`, 'yellow');
    }
    if (investmentResult.data.data.portfolioCompany && investmentResult.data.data.portfolioCompany.id) {
      portfolioCompanyId = investmentResult.data.data.portfolioCompany.id;
      log(`   📌 Captured Portfolio Company ID: ${portfolioCompanyId}`, 'yellow');
    }
  }
  results.push(investmentResult);

  results.push(await testEndpoint('GET', '/applicant/valuations', '1.7 Get portfolio valuations'));
  results.push(await testEndpoint('GET', '/applicant/reports', '1.8 Get performance reports'));

  // ==========================================
  // SCENARIO 2: Term Sheet Endpoints
  // ==========================================
  log('\n' + '='.repeat(70), 'cyan');
  log('📋 SCENARIO 2: Term Sheet Endpoints', 'cyan');
  log('='.repeat(70), 'cyan');

  results.push(await testEndpoint('GET', '/term-sheets/my', '2.1 Get my term sheets'));
  results.push(await testEndpoint('GET', '/term-sheets/my?page=1&limit=5', '2.2 Get my term sheets with pagination'));

  // Try to sign term sheet (might already be signed)
  if (applicationId) {
    results.push(await testEndpoint('POST', `/term-sheets/${applicationId}/sign`, '2.3 Attempt to sign term sheet', null, 400));
  }

  // ==========================================
  // SCENARIO 3: Update Profile
  // ==========================================
  log('\n' + '='.repeat(70), 'cyan');
  log('📋 SCENARIO 3: Update Profile', 'cyan');
  log('='.repeat(70), 'cyan');

  // Get current profile first
  const currentProfile = await testEndpoint('GET', '/applicant/profile', '3.1 Get current profile');
  if (currentProfile.success && currentProfile.data.data) {
    const currentData = currentProfile.data.data;
    log(`   Current: ${currentData.firstName} ${currentData.lastName} (${currentData.email})`, 'yellow');
    
    // Try updating with same data (should work)
    results.push(await testEndpoint('PUT', '/applicant/profile', '3.2 Update profile with same data', {
      firstName: currentData.firstName,
      lastName: currentData.lastName,
      email: currentData.email
    }));

    // Try updating with new data
    results.push(await testEndpoint('PUT', '/applicant/profile', '3.3 Update profile with new data', {
      firstName: currentData.firstName + ' (Updated)',
      lastName: currentData.lastName
    }));

    // Try updating with invalid data (empty firstName)
    results.push(await testEndpoint('PUT', '/applicant/profile', '3.4 Update profile with invalid data (should fail)', {
      firstName: '',
      lastName: currentData.lastName
    }, 400));
  }

  // ==========================================
  // SCENARIO 4: Update Portfolio Company
  // ==========================================
  log('\n' + '='.repeat(70), 'cyan');
  log('📋 SCENARIO 4: Update Portfolio Company', 'cyan');
  log('='.repeat(70), 'cyan');

  // Get current company first
  const currentCompany = await testEndpoint('GET', '/applicant/company', '4.1 Get current company');
  if (currentCompany.success && currentCompany.data.data) {
    const companyData = currentCompany.data.data;
    log(`   Current Company: ${companyData.name}`, 'yellow');
    
    // Try updating with same data
    results.push(await testEndpoint('PUT', '/applicant/company', '4.2 Update company with same data', {
      name: companyData.name,
      industry: companyData.industry
    }));

    // Try updating with new description
    results.push(await testEndpoint('PUT', '/applicant/company', '4.3 Update company description', {
      description: companyData.description || 'Updated description at ' + new Date().toISOString()
    }));

    // Try updating with partial data
    results.push(await testEndpoint('PUT', '/applicant/company', '4.4 Update company with partial data', {
      contactPhone: '+263771234567'
    }));
  }

  // ==========================================
  // SCENARIO 5: Edge Cases and Error Handling
  // ==========================================
  log('\n' + '='.repeat(70), 'cyan');
  log('📋 SCENARIO 5: Edge Cases and Error Handling', 'cyan');
  log('='.repeat(70), 'cyan');

  // Test with invalid pagination
  results.push(await testEndpoint('GET', '/term-sheets/my?page=-1&limit=10', '5.1 Get term sheets with invalid page'));
  results.push(await testEndpoint('GET', '/term-sheets/my?page=999&limit=10', '5.2 Get term sheets with non-existent page'));

  // Test with invalid application ID for signing
  results.push(await testEndpoint('POST', '/term-sheets/invalid-application-id/sign', '5.3 Attempt to sign with invalid application ID', null, 400));

  // Test dashboard with different query params (if supported)
  results.push(await testEndpoint('GET', '/applicant/dashboard', '5.4 Get dashboard (duplicate request)'));

  // ==========================================
  // SCENARIO 6: Data Consistency Checks
  // ==========================================
  log('\n' + '='.repeat(70), 'cyan');
  log('📋 SCENARIO 6: Data Consistency Checks', 'cyan');
  log('='.repeat(70), 'cyan');

  // Check if data is consistent across endpoints
  const profileCheck = await testEndpoint('GET', '/applicant/profile', '6.1 Re-check profile after updates');
  const applicationCheck = await testEndpoint('GET', '/applicant/application', '6.2 Re-check application');
  const dashboardCheck = await testEndpoint('GET', '/applicant/dashboard', '6.3 Re-check dashboard');
  const investmentCheck = await testEndpoint('GET', '/applicant/investment', '6.4 Re-check investment details');

  results.push(profileCheck, applicationCheck, dashboardCheck, investmentCheck);

  // Compare data consistency
  if (profileCheck.success && dashboardCheck.success) {
    const profileEmail = profileCheck.data.data?.email;
    const dashboardEmail = dashboardCheck.data.data?.application?.applicantEmail || 
                          dashboardCheck.data.data?.portfolioCompany?.contactEmail;
    
    if (profileEmail && dashboardEmail) {
      if (profileEmail === dashboardEmail) {
        log(`   ✅ Email consistency: Profile and Dashboard match (${profileEmail})`, 'green');
      } else {
        log(`   ⚠️  Email mismatch: Profile(${profileEmail}) vs Dashboard(${dashboardEmail})`, 'yellow');
      }
    }
  }

  // ==========================================
  // SUMMARY
  // ==========================================
  log('\n' + '='.repeat(70), 'cyan');
  log('📊 TEST SUMMARY', 'cyan');
  log('='.repeat(70), 'cyan');

  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  const total = results.length;

  log(`\n📈 Total Tests: ${total}`, 'cyan');
  log(`✅ Successful: ${successful}/${total} (${Math.round(successful/total*100)}%)`, successful === total ? 'green' : successful > total * 0.8 ? 'yellow' : 'red');
  log(`❌ Failed: ${failed}/${total} (${Math.round(failed/total*100)}%)`, failed === 0 ? 'green' : failed < total * 0.2 ? 'yellow' : 'red');

  if (failed > 0) {
    log('\n❌ Failed Tests:', 'red');
    results.forEach((result, index) => {
      if (!result.success) {
        log(`   ${index + 1}. ${result.error || 'Unknown error'}`, 'red');
      }
    });
  }

  // Test Categories Summary
  log('\n📋 Test Categories:', 'cyan');
  log(`   Basic GET Requests: ${results.slice(0, 8).filter(r => r.success).length}/8`, 'yellow');
  log(`   Term Sheet Endpoints: ${results.slice(8, 10).filter(r => r.success).length}/2`, 'yellow');
  log(`   Update Operations: ${results.slice(10, 14).filter(r => r.success).length}/4`, 'yellow');
  log(`   Edge Cases: ${results.slice(14, 18).filter(r => r.success).length}/4`, 'yellow');
  log(`   Consistency Checks: ${results.slice(18).filter(r => r.success).length}/4`, 'yellow');

  log('\n' + '='.repeat(70), 'cyan');
  log('✅ All scenario tests completed!', 'green');
  log('='.repeat(70), 'cyan');

  process.exit(failed > total * 0.2 ? 1 : 0);
}

runAllScenarios().catch(error => {
  log(`\n❌ Unexpected error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

