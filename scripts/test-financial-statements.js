// @ts-nocheck
/**
 * Comprehensive Financial Statements Testing Script
 * Tests: Income Statement, Cash Flow Statement, Balance Sheet, Trial Balance
 */

const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_BASE = `${BASE_URL}/api/accounting`;

// Test credentials (update with your actual test user)
let AUTH_TOKEN = '';

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '═'.repeat(80));
  log(`  ${title}`, 'bright');
  console.log('═'.repeat(80) + '\n');
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
}

function logError(message) {
  log(`❌ ${message}`, 'red');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

/**
 * Get authentication token
 */
async function authenticate() {
  try {
    logSection('AUTHENTICATION');
    
    // Get first active user with admin or accountant role
    const user = await prisma.user.findFirst({
      where: {
        role: {
          name: {
            in: ['admin', 'accountant']
          }
        }
      },
      include: {
        role: true
      }
    });

    if (!user) {
      logError('No admin or accountant user found in database');
      logInfo('Please create a user with admin or accountant role first');
      process.exit(1);
    }

    logInfo(`Using user: ${user.email} (${user.role.name})`);

    // Try to login
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: user.email,
      password: 'password123' // Update with actual password
    });

    if (response.data.success && response.data.token) {
      AUTH_TOKEN = response.data.token;
      logSuccess('Authentication successful');
      return true;
    } else {
      logError('Authentication failed - invalid credentials');
      logWarning('Update the password in this script or create test user');
      return false;
    }
  } catch (error) {
    logError('Authentication failed');
    logWarning('Creating mock token for testing...');
    // For testing purposes, we'll try to continue without auth
    // In production, you should always authenticate properly
    return false;
  }
}

/**
 * Test Income Statement
 */
async function testIncomeStatement() {
  logSection('TEST 1: INCOME STATEMENT');
  
  try {
    const startDate = '2025-01-01';
    const endDate = '2025-12-31';

    logInfo(`Testing Income Statement: ${startDate} to ${endDate}`);

    const response = await axios.get(`${API_BASE}/income-statement`, {
      params: { startDate, endDate },
      headers: AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}
    });

    if (response.data.success) {
      const data = response.data.data;
      logSuccess('Income Statement generated successfully');
      
      console.log('\n📊 Summary:');
      console.log(`   Total Revenue:    $${data.totalRevenue?.toFixed(2) || '0.00'}`);
      console.log(`   Total Expenses:   $${data.totalExpenses?.toFixed(2) || '0.00'}`);
      console.log(`   Net Income:       $${data.netIncome?.toFixed(2) || '0.00'}`);
      console.log(`   Revenue Accounts: ${data.revenues?.length || 0}`);
      console.log(`   Expense Accounts: ${data.expenses?.length || 0}`);
      
      return { success: true, data };
    } else {
      logError('Income Statement generation failed');
      return { success: false, error: 'API returned success: false' };
    }
  } catch (error) {
    logError(`Income Statement test failed: ${error.message}`);
    if (error.response) {
      logInfo(`Status: ${error.response.status}`);
      logInfo(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Test Cash Flow Statement
 */
async function testCashFlowStatement() {
  logSection('TEST 2: CASH FLOW STATEMENT');
  
  try {
    const startDate = '2025-01-01';
    const endDate = '2025-12-31';

    logInfo(`Testing Cash Flow Statement: ${startDate} to ${endDate}`);

    const response = await axios.post(`${API_BASE}/cash-flow/generate`, {
      startDate,
      endDate
    }, {
      headers: AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}
    });

    if (response.data.success) {
      const data = response.data.data;
      logSuccess('Cash Flow Statement generated successfully');
      
      console.log('\n💰 Summary:');
      console.log(`   Operating Activities:  $${data.operatingActivities?.total?.toFixed(2) || '0.00'}`);
      console.log(`   Investing Activities:  $${data.investingActivities?.total?.toFixed(2) || '0.00'}`);
      console.log(`   Financing Activities:  $${data.financingActivities?.total?.toFixed(2) || '0.00'}`);
      console.log(`   Net Cash Flow:         $${data.netCashFlow?.toFixed(2) || '0.00'}`);
      console.log(`   Beginning Balance:     $${data.beginningCashBalance?.toFixed(2) || '0.00'}`);
      console.log(`   Ending Balance:        $${data.endingCashBalance?.toFixed(2) || '0.00'}`);
      
      return { success: true, data };
    } else {
      logError('Cash Flow Statement generation failed');
      return { success: false, error: 'API returned success: false' };
    }
  } catch (error) {
    logError(`Cash Flow Statement test failed: ${error.message}`);
    if (error.response) {
      logInfo(`Status: ${error.response.status}`);
      logInfo(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Test Balance Sheet
 */
async function testBalanceSheet() {
  logSection('TEST 3: BALANCE SHEET');
  
  try {
    const asOfDate = '2025-12-31';

    logInfo(`Testing Balance Sheet as of: ${asOfDate}`);

    const response = await axios.post(`${API_BASE}/balance-sheet/generate`, {
      asOfDate
    }, {
      headers: AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}
    });

    if (response.data.success) {
      const data = response.data.data;
      logSuccess('Balance Sheet generated successfully');
      
      console.log('\n📈 Summary:');
      console.log('\n   ASSETS:');
      console.log(`   Current Assets:        $${data.assets?.currentAssets?.total?.toFixed(2) || '0.00'}`);
      console.log(`   Fixed Assets:          $${data.assets?.fixedAssets?.total?.toFixed(2) || '0.00'}`);
      console.log(`   Other Assets:          $${data.assets?.otherAssets?.total?.toFixed(2) || '0.00'}`);
      console.log(`   ─────────────────────────────────────`);
      console.log(`   Total Assets:          $${data.assets?.totalAssets?.toFixed(2) || '0.00'}`);
      
      console.log('\n   LIABILITIES:');
      console.log(`   Current Liabilities:   $${data.liabilities?.currentLiabilities?.total?.toFixed(2) || '0.00'}`);
      console.log(`   Long-term Liabilities: $${data.liabilities?.longTermLiabilities?.total?.toFixed(2) || '0.00'}`);
      console.log(`   ─────────────────────────────────────`);
      console.log(`   Total Liabilities:     $${data.liabilities?.totalLiabilities?.toFixed(2) || '0.00'}`);
      
      console.log('\n   EQUITY:');
      console.log(`   Equity Accounts:       $${data.equity?.total?.toFixed(2) || '0.00'}`);
      console.log(`   Retained Earnings:     $${data.equity?.retainedEarnings?.toFixed(2) || '0.00'}`);
      console.log(`   ─────────────────────────────────────`);
      console.log(`   Total Equity:          $${(data.equity?.total + data.equity?.retainedEarnings)?.toFixed(2) || '0.00'}`);
      
      console.log('\n   BALANCE CHECK:');
      console.log(`   Total Liab. + Equity:  $${data.totalLiabilitiesAndEquity?.toFixed(2) || '0.00'}`);
      console.log(`   Is Balanced:           ${data.isBalanced ? '✅ YES' : '❌ NO'}`);
      if (!data.isBalanced) {
        console.log(`   Difference:            $${data.difference?.toFixed(2) || '0.00'}`);
      }
      
      return { success: true, data, balanced: data.isBalanced };
    } else {
      logError('Balance Sheet generation failed');
      return { success: false, error: 'API returned success: false' };
    }
  } catch (error) {
    logError(`Balance Sheet test failed: ${error.message}`);
    if (error.response) {
      logInfo(`Status: ${error.response.status}`);
      logInfo(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Test Trial Balance
 */
async function testTrialBalance() {
  logSection('TEST 4: TRIAL BALANCE');
  
  try {
    const asOfDate = '2025-12-31';

    logInfo(`Testing Trial Balance as of: ${asOfDate}`);

    const response = await axios.get(`${API_BASE}/trial-balance`, {
      params: { asOfDate },
      headers: AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}
    });

    if (response.data.success) {
      const data = response.data.data;
      logSuccess('Trial Balance generated successfully');
      
      console.log('\n⚖️  Summary:');
      console.log(`   Total Debits:   $${data.totalDebits?.toFixed(2) || '0.00'}`);
      console.log(`   Total Credits:  $${data.totalCredits?.toFixed(2) || '0.00'}`);
      console.log(`   Difference:     $${data.difference?.toFixed(2) || '0.00'}`);
      console.log(`   Is Balanced:    ${data.isBalanced ? '✅ YES' : '❌ NO'}`);
      console.log(`   Account Count:  ${data.accounts?.length || 0}`);
      
      if (!data.isBalanced) {
        logWarning(`Trial Balance is UNBALANCED by $${data.difference?.toFixed(2)}`);
      }
      
      return { success: true, data, balanced: data.isBalanced };
    } else {
      logError('Trial Balance generation failed');
      return { success: false, error: 'API returned success: false' };
    }
  } catch (error) {
    logError(`Trial Balance test failed: ${error.message}`);
    if (error.response) {
      logInfo(`Status: ${error.response.status}`);
      logInfo(`Response: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    return { success: false, error: error.message };
  }
}

/**
 * Test Cash Flow Statement variants
 */
async function testCashFlowVariants() {
  logSection('TEST 5: CASH FLOW STATEMENT VARIANTS');
  
  const results = {};
  
  // Test Summary
  try {
    logInfo('Testing Cash Flow Summary...');
    const response = await axios.post(`${API_BASE}/cash-flow/summary`, {
      startDate: '2025-01-01',
      endDate: '2025-12-31'
    }, {
      headers: AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}
    });
    
    if (response.data.success) {
      logSuccess('Cash Flow Summary OK');
      results.summary = { success: true };
    }
  } catch (error) {
    logError(`Cash Flow Summary failed: ${error.message}`);
    results.summary = { success: false, error: error.message };
  }
  
  // Test Detailed
  try {
    logInfo('Testing Cash Flow Detailed...');
    const response = await axios.post(`${API_BASE}/cash-flow/detailed`, {
      startDate: '2025-01-01',
      endDate: '2025-12-31'
    }, {
      headers: AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}
    });
    
    if (response.data.success) {
      logSuccess('Cash Flow Detailed OK');
      results.detailed = { success: true };
    }
  } catch (error) {
    logError(`Cash Flow Detailed failed: ${error.message}`);
    results.detailed = { success: false, error: error.message };
  }
  
  // Test Comprehensive
  try {
    logInfo('Testing Cash Flow Comprehensive...');
    const response = await axios.post(`${API_BASE}/cash-flow/comprehensive`, {
      startDate: '2025-01-01',
      endDate: '2025-12-31'
    }, {
      headers: AUTH_TOKEN ? { Authorization: `Bearer ${AUTH_TOKEN}` } : {}
    });
    
    if (response.data.success) {
      logSuccess('Cash Flow Comprehensive OK');
      results.comprehensive = { success: true };
    }
  } catch (error) {
    logError(`Cash Flow Comprehensive failed: ${error.message}`);
    results.comprehensive = { success: false, error: error.message };
  }
  
  return results;
}

/**
 * Generate Final Report
 */
function generateReport(results) {
  logSection('FINAL TEST REPORT');
  
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    FINANCIAL STATEMENTS TEST                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  const tests = [
    { name: 'Income Statement', result: results.incomeStatement },
    { name: 'Cash Flow Statement', result: results.cashFlow },
    { name: 'Balance Sheet', result: results.balanceSheet },
    { name: 'Trial Balance', result: results.trialBalance },
    { name: 'Cash Flow Summary', result: results.cashFlowVariants?.summary },
    { name: 'Cash Flow Detailed', result: results.cashFlowVariants?.detailed },
    { name: 'Cash Flow Comprehensive', result: results.cashFlowVariants?.comprehensive },
  ];
  
  let passed = 0;
  let failed = 0;
  
  tests.forEach(test => {
    if (test.result?.success) {
      logSuccess(`${test.name.padEnd(30)} PASSED`);
      passed++;
    } else {
      logError(`${test.name.padEnd(30)} FAILED`);
      failed++;
      if (test.result?.error) {
        logInfo(`    Error: ${test.result.error}`);
      }
    }
  });
  
  console.log('\n' + '─'.repeat(80));
  console.log(`\nTotal Tests: ${tests.length}`);
  log(`Passed: ${passed}`, 'green');
  log(`Failed: ${failed}`, 'red');
  
  // Balance checks
  console.log('\n' + '─'.repeat(80));
  console.log('\n⚖️  BALANCE CHECKS:');
  
  if (results.balanceSheet?.balanced !== undefined) {
    if (results.balanceSheet.balanced) {
      logSuccess('Balance Sheet: BALANCED ✅');
    } else {
      logError('Balance Sheet: UNBALANCED ❌');
    }
  }
  
  if (results.trialBalance?.balanced !== undefined) {
    if (results.trialBalance.balanced) {
      logSuccess('Trial Balance: BALANCED ✅');
    } else {
      logError('Trial Balance: UNBALANCED ❌');
    }
  }
  
  console.log('\n' + '═'.repeat(80));
  
  if (failed === 0) {
    log('\n🎉 ALL TESTS PASSED! 🎉\n', 'green');
  } else {
    log(`\n⚠️  ${failed} TEST(S) FAILED - Review errors above\n`, 'yellow');
  }
}

/**
 * Main test execution
 */
async function main() {
  console.clear();
  
  log('\n╔═══════════════════════════════════════════════════════════════════╗', 'bright');
  log('║         COMPREHENSIVE FINANCIAL STATEMENTS TEST SUITE             ║', 'bright');
  log('║                    Date: ' + new Date().toISOString().split('T')[0] + '                                 ║', 'bright');
  log('╚═══════════════════════════════════════════════════════════════════╝\n', 'bright');
  
  const results = {};
  
  // Authenticate
  const authenticated = await authenticate();
  if (!authenticated) {
    logWarning('Running tests without authentication - some tests may fail');
    logInfo('To fix: Update credentials in the script or ensure test user exists');
    console.log('');
  }
  
  // Run all tests
  results.incomeStatement = await testIncomeStatement();
  await new Promise(resolve => setTimeout(resolve, 500)); // Small delay between tests
  
  results.cashFlow = await testCashFlowStatement();
  await new Promise(resolve => setTimeout(resolve, 500));
  
  results.balanceSheet = await testBalanceSheet();
  await new Promise(resolve => setTimeout(resolve, 500));
  
  results.trialBalance = await testTrialBalance();
  await new Promise(resolve => setTimeout(resolve, 500));
  
  results.cashFlowVariants = await testCashFlowVariants();
  
  // Generate report
  generateReport(results);
  
  // Cleanup
  await prisma.$disconnect();
  
  // Exit with appropriate code
  const allPassed = Object.values(results).every(r => r?.success !== false);
  process.exit(allPassed ? 0 : 1);
}

// Run tests
main().catch(error => {
  logError(`Fatal error: ${error.message}`);
  console.error(error);
  process.exit(1);
});


