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

async function testEndpoint(method, endpoint, description) {
  try {
    log(`\n${'='.repeat(70)}`, 'cyan');
    log(`📋 ${description}`, 'blue');
    log(`   ${method.toUpperCase()} ${endpoint}`, 'yellow');
    
    const response = await axios({
      method: method.toLowerCase(),
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    if (response.data.success !== false) {
      log(`   ✅ Success`, 'green');
      return { success: true, data: response.data };
    } else {
      log(`   ❌ Failed: ${response.data.message}`, 'red');
      return { success: false, error: response.data.message };
    }
  } catch (error) {
    log(`   ❌ Error: ${error.message}`, 'red');
    if (error.response) {
      log(`   Status: ${error.response.status}`, 'red');
      log(`   Message: ${error.response.data.message || JSON.stringify(error.response.data)}`, 'red');
    }
    return { success: false, error: error.message };
  }
}

async function analyzeData(data) {
  log(`\n${'='.repeat(70)}`, 'cyan');
  log('📊 DATA ANALYSIS', 'cyan');
  log('='.repeat(70), 'cyan');
  
  // Check investment details
  if (data.investment) {
    log('\n💰 INVESTMENT DETAILS:', 'yellow');
    log(`   Portfolio Company: ${data.investment.portfolioCompany?.name || 'N/A'}`, 'yellow');
    log(`   Company ID: ${data.investment.portfolioCompany?.id || 'N/A'}`, 'yellow');
    log(`   Company Status: ${data.investment.portfolioCompany?.status || 'N/A'}`, 'yellow');
    
    if (data.investment.termSheet) {
      log('\n📄 TERM SHEET DETAILS:', 'yellow');
      log(`   ID: ${data.investment.termSheet.id}`, 'yellow');
      log(`   Title: ${data.investment.termSheet.title}`, 'yellow');
      log(`   Version: ${data.investment.termSheet.version}`, 'yellow');
      log(`   Status: ${data.investment.termSheet.status}`, data.investment.termSheet.status === 'FINAL' ? 'green' : data.investment.termSheet.status === 'SIGNED' ? 'green' : 'yellow');
      log(`   Investment Amount: ${data.investment.termSheet.investmentAmount}`, 'yellow');
      log(`   Equity Percentage: ${data.investment.termSheet.equityPercentage}%`, 'yellow');
      log(`   Valuation: ${data.investment.termSheet.valuation}`, 'yellow');
      log(`   Is Draft: ${data.investment.termSheet.isDraft}`, 'yellow');
      log(`   Is Final: ${data.investment.termSheet.isFinal}`, 'yellow');
      log(`   Is Signed: ${data.investment.termSheet.isSigned}`, 'yellow');
      log(`   Signed At: ${data.investment.termSheet.signedAt || 'Not signed yet'}`, 'yellow');
      log(`   Created By: ${data.investment.termSheet.createdBy?.firstName} ${data.investment.termSheet.createdBy?.lastName} (${data.investment.termSheet.createdBy?.email})`, 'yellow');
      log(`   Created At: ${data.investment.termSheet.createdAt}`, 'yellow');
    } else {
      log('\n📄 TERM SHEET: Not found', 'red');
    }
    
    log('\n💼 INVESTMENT INFO:', 'yellow');
    log(`   Fund: ${data.investment.investment?.fund?.name || 'No fund assigned'}`, 'yellow');
    log(`   Start Date: ${data.investment.investment?.startDate || 'Not set'}`, 'yellow');
    log(`   End Date: ${data.investment.investment?.endDate || 'Not set'}`, 'yellow');
    log(`   Cap Table: ${data.investment.investment?.capTable ? 'Available' : 'Not available'}`, 'yellow');
    log(`   Financial KPIs: ${data.investment.investment?.financialKpis ? 'Available' : 'Not available'}`, 'yellow');
  }
  
  // Check my term sheets
  if (data.myTermSheets) {
    log('\n📋 MY TERM SHEETS:', 'yellow');
    log(`   Total: ${data.myTermSheets.total || 0}`, 'yellow');
    if (data.myTermSheets.termSheets && data.myTermSheets.termSheets.length > 0) {
      data.myTermSheets.termSheets.forEach((ts, index) => {
        log(`\n   Term Sheet ${index + 1}:`, 'yellow');
        log(`      ID: ${ts.id}`, 'yellow');
        log(`      Title: ${ts.title}`, 'yellow');
        log(`      Status: ${ts.status}`, ts.status === 'FINAL' ? 'green' : ts.status === 'SIGNED' ? 'green' : 'yellow');
        log(`      Is Signed: ${ts.isSigned}`, 'yellow');
        log(`      Investment Amount: ${ts.investmentAmount}`, 'yellow');
        log(`      Application: ${ts.application?.businessName || 'N/A'}`, 'yellow');
      });
    } else {
      log('   No term sheets found', 'yellow');
    }
  }
}

async function runTests() {
  log('\n' + '='.repeat(70), 'cyan');
  log('🧪 TERM SHEET STATUS TEST', 'cyan');
  log('='.repeat(70), 'cyan');

  const loginSuccess = await login();
  if (!loginSuccess) {
    log('\n❌ Cannot proceed without authentication', 'red');
    process.exit(1);
  }

  // Test investment details (includes term sheet)
  const investmentResult = await testEndpoint('GET', '/applicant/investment', 'Get Investment Details (includes term sheet)');
  
  // Test my term sheets endpoint
  const myTermSheetsResult = await testEndpoint('GET', '/term-sheets/my', 'Get My Term Sheets');

  // Analyze the data
  if (investmentResult.success && investmentResult.data.data) {
    await analyzeData({ investment: investmentResult.data.data });
  }
  
  if (myTermSheetsResult.success && myTermSheetsResult.data.data) {
    await analyzeData({ myTermSheets: myTermSheetsResult.data.data });
  }

  log('\n' + '='.repeat(70), 'cyan');
  
  // Summary
  if (investmentResult.success && investmentResult.data.data?.termSheet) {
    const ts = investmentResult.data.data.termSheet;
    log('\n📊 TERM SHEET STATUS SUMMARY:', 'cyan');
    log(`   Status: ${ts.status}`, ts.status === 'FINAL' ? 'green' : ts.status === 'SIGNED' ? 'green' : 'yellow');
    log(`   Can be signed: ${ts.status === 'FINAL' && !ts.isSigned ? 'YES ✅' : 'NO ❌'}`, ts.status === 'FINAL' && !ts.isSigned ? 'green' : 'yellow');
    log(`   Is signed: ${ts.isSigned ? 'YES ✅' : 'NO ❌'}`, ts.isSigned ? 'green' : 'yellow');
  } else {
    log('\n⚠️  No term sheet found in investment details', 'yellow');
  }
  
  log('\n' + '='.repeat(70), 'cyan');
}

runTests().catch(error => {
  log(`\n❌ Unexpected error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});

