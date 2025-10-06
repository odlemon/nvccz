/**
 * Complete Investment Module Test Script
 * Tests the entire investment workflow from application submission to investment implementation
 * 
 * Usage: node test-investment-module-complete.js
 */

const axios = require('axios');

// Configuration
const BASE_URL = 'http://localhost:3000';
const TEST_EMAIL = 'admin@nvccz.co.zw';
const TEST_PASSWORD = 'admin123';

// Global variables to store test data
let authToken = '';
let testApplicationId = '';
let testDueDiligenceId = '';
let testBoardReviewId = '';
let testImplementationId = '';
let testFundId = '';
let testTermSheetId = '';
let testPortfolioCompanyId = '';

// Test data
const testData = {
  application: {
    applicantName: 'John Doe',
    applicantEmail: 'john@techstartup.com',
    businessName: 'TechStartup Test Ltd',
    requestedAmount: 500000,
    businessDescription: 'AI-powered fintech solution for small businesses',
    stage: 'EARLY_STAGE',
    sector: 'TECHNOLOGY',
    phone: '+263771234567',
    businessPlan: 'base64_encoded_business_plan_content',
    financialProjections: 'base64_encoded_financial_projections_content'
  },
  fund: {
    fundName: 'NVCCZ Test Fund I',
    fundType: 'GROWTH',
    targetSize: 10000000.00,
    committedCapital: 5000000.00,
    launchDate: '2024-01-01T00:00:00Z',
    closeDate: '2026-12-31T00:00:00Z',
    managementFee: 2.0,
    carriedInterest: 20.0,
    description: 'Test growth capital fund focusing on technology startups'
  },
  dueDiligence: {
    dueDiligenceType: 'FINANCIAL',
    priority: 'HIGH',
    deadline: '2024-02-15T00:00:00Z',
    requirements: [
      'Financial statements for last 3 years',
      'Tax compliance certificates',
      'Audit reports'
    ],
    notes: 'Focus on revenue growth and market expansion plans'
  },
  boardReview: {
    investmentApproved: true,
    recommendationReport: 'Based on our comprehensive analysis, we recommend approving this investment. The company shows strong potential with innovative technology and experienced management team.',
    decisionReason: 'Strong market potential, solid financial projections, and experienced team',
    nextSteps: 'Proceed to term sheet negotiation and finalize investment terms',
    overallScore: 85.5,
    finalComments: 'Strong recommendation for approval based on market analysis, financial projections, and team capabilities'
  },
  termSheet: {
    investmentAmount: 500000,
    equityPercentage: 15.5,
    preMoneyValuation: 2700000,
    postMoneyValuation: 3200000,
    liquidationPreference: '1x',
    antiDilution: 'Weighted Average',
    boardSeats: 1,
    votingRights: true,
    dragAlong: true,
    tagAlong: true,
    informationRights: true,
    registrationRights: true,
    expiryDate: '2024-04-01T00:00:00Z'
  },
  investmentImplementation: {
    investmentAmount: 500000,
    equityPercentage: 15.5,
    implementationDate: '2024-03-01T00:00:00Z',
    terms: {
      boardSeats: 1,
      votingRights: true,
      antiDilution: true
    },
    milestones: [
      {
        description: 'Product launch',
        targetDate: '2024-06-01T00:00:00Z',
        successMetrics: '10,000 active users'
      },
      {
        description: 'Revenue milestone',
        targetDate: '2024-12-31T00:00:00Z',
        successMetrics: '$1M ARR'
      }
    ]
  },
  portfolioCompany: {
    companyName: 'TechStartup Test Ltd',
    sector: 'TECHNOLOGY',
    investmentDate: '2024-03-01T00:00:00Z',
    investmentAmount: 500000,
    equityPercentage: 15.5,
    valuation: 3200000,
    contactPerson: 'John Doe',
    email: 'john@techstartup.com',
    phone: '+263771234567',
    address: '123 Tech Street, Harare, Zimbabwe',
    website: 'https://techstartup.com'
  }
};

// Helper functions
function log(message, type = 'INFO') {
  const timestamp = new Date().toISOString();
  const colors = {
    INFO: '\x1b[36m',    // Cyan
    SUCCESS: '\x1b[32m', // Green
    ERROR: '\x1b[31m',   // Red
    WARNING: '\x1b[33m',  // Yellow
    RESET: '\x1b[0m'
  };
  
  console.log(`${colors[type]}[${timestamp}] ${message}${colors.RESET}`);
}

function logError(error, context = '') {
  log(`❌ ERROR${context ? ` in ${context}` : ''}: ${error.message}`, 'ERROR');
  if (error.response) {
    log(`   Status: ${error.response.status}`, 'ERROR');
    log(`   Response: ${JSON.stringify(error.response.data, null, 2)}`, 'ERROR');
  }
}

async function makeRequest(method, endpoint, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        ...headers
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return response.data;
  } catch (error) {
    throw error;
  }
}

// Test functions
async function testAuthentication() {
  log('🔐 Testing Authentication...', 'INFO');
  
  try {
    const response = await makeRequest('POST', '/api/auth/login', {
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    
    if (response.success && response.token) {
      authToken = response.token;
      log('✅ Authentication successful', 'SUCCESS');
      return true;
    } else {
      throw new Error('Authentication failed - no token received');
    }
  } catch (error) {
    logError(error, 'Authentication');
    return false;
  }
}

async function testFundCreation() {
  log('💰 Testing Fund Creation...', 'INFO');
  
  try {
    const response = await makeRequest('POST', '/api/funds', testData.fund);
    
    if (response.success && response.data.id) {
      testFundId = response.data.id;
      log(`✅ Fund created successfully - ID: ${testFundId}`, 'SUCCESS');
      return true;
    } else {
      throw new Error('Fund creation failed');
    }
  } catch (error) {
    logError(error, 'Fund Creation');
    return false;
  }
}

async function testApplicationCreation() {
  log('📝 Testing Application Creation...', 'INFO');
  
  try {
    const response = await makeRequest('POST', '/api/applications', testData.application);
    
    if (response.success && response.data.id) {
      testApplicationId = response.data.id;
      log(`✅ Application created successfully - ID: ${testApplicationId}`, 'SUCCESS');
      return true;
    } else {
      throw new Error('Application creation failed');
    }
  } catch (error) {
    logError(error, 'Application Creation');
    return false;
  }
}

async function testApplicationRetrieval() {
  log('📋 Testing Application Retrieval...', 'INFO');
  
  try {
    const response = await makeRequest('GET', `/api/applications/${testApplicationId}`);
    
    if (response.success && response.data.id === testApplicationId) {
      log('✅ Application retrieved successfully', 'SUCCESS');
      return true;
    } else {
      throw new Error('Application retrieval failed');
    }
  } catch (error) {
    logError(error, 'Application Retrieval');
    return false;
  }
}

async function testApplicationUpdate() {
  log('✏️ Testing Application Update...', 'INFO');
  
  try {
    const updateData = {
      businessDescription: 'Updated: AI-powered fintech solution with enhanced features',
      investmentAmount: 600000
    };
    
    const response = await makeRequest('PUT', `/api/applications/${testApplicationId}`, updateData);
    
    if (response.success) {
      log('✅ Application updated successfully', 'SUCCESS');
      return true;
    } else {
      throw new Error('Application update failed');
    }
  } catch (error) {
    logError(error, 'Application Update');
    return false;
  }
}

async function testDueDiligenceCreation() {
  log('🔍 Testing Due Diligence Creation...', 'INFO');
  
  try {
    const dueDiligenceData = {
      ...testData.dueDiligence,
      applicationId: testApplicationId
    };
    
    const response = await makeRequest('POST', '/api/due-diligence', dueDiligenceData);
    
    if (response.success && response.data.id) {
      testDueDiligenceId = response.data.id;
      log(`✅ Due Diligence created successfully - ID: ${testDueDiligenceId}`, 'SUCCESS');
      return true;
    } else {
      throw new Error('Due Diligence creation failed');
    }
  } catch (error) {
    logError(error, 'Due Diligence Creation');
    return false;
  }
}

async function testDueDiligenceUpdate() {
  log('✏️ Testing Due Diligence Update...', 'INFO');
  
  try {
    const updateData = {
      priority: 'URGENT',
      notes: 'Updated: Focus on market expansion and competitive analysis'
    };
    
    const response = await makeRequest('PUT', `/api/due-diligence/${testDueDiligenceId}`, updateData);
    
    if (response.success) {
      log('✅ Due Diligence updated successfully', 'SUCCESS');
      return true;
    } else {
      throw new Error('Due Diligence update failed');
    }
  } catch (error) {
    logError(error, 'Due Diligence Update');
    return false;
  }
}

async function testDueDiligenceCompletion() {
  log('✅ Testing Due Diligence Completion...', 'INFO');
  
  try {
    const completionData = {
      findings: 'Strong financial position with consistent growth over the past 3 years. Revenue increased by 150% year-over-year.',
      recommendations: 'Proceed to board review with strong recommendation for approval',
      riskAssessment: 'LOW',
      complianceStatus: 'COMPLIANT',
      attachments: ['financial_analysis.pdf', 'market_research.xlsx']
    };
    
    const response = await makeRequest('POST', `/api/due-diligence/${testDueDiligenceId}/complete`, completionData);
    
    if (response.success) {
      log('✅ Due Diligence completed successfully', 'SUCCESS');
      return true;
    } else {
      throw new Error('Due Diligence completion failed');
    }
  } catch (error) {
    logError(error, 'Due Diligence Completion');
    return false;
  }
}

async function testBoardReviewCreation() {
  log('👥 Testing Board Review Creation...', 'INFO');
  
  try {
    const boardReviewData = {
      ...testData.boardReview,
      applicationId: testApplicationId
    };
    
    const response = await makeRequest('POST', '/api/board-reviews', boardReviewData);
    
    if (response.success && response.data.id) {
      testBoardReviewId = response.data.id;
      log(`✅ Board Review created successfully - ID: ${testBoardReviewId}`, 'SUCCESS');
      return true;
    } else {
      throw new Error('Board Review creation failed');
    }
  } catch (error) {
    logError(error, 'Board Review Creation');
    return false;
  }
}

async function testBoardReviewUpdate() {
  log('✏️ Testing Board Review Update...', 'INFO');
  
  try {
    const updateData = {
      overallScore: 88.0,
      finalComments: 'Updated: Excellent market opportunity with strong execution plan'
    };
    
    const response = await makeRequest('PUT', `/api/board-reviews/application/${testApplicationId}`, updateData);
    
    if (response.success) {
      log('✅ Board Review updated successfully', 'SUCCESS');
      return true;
    } else {
      throw new Error('Board Review update failed');
    }
  } catch (error) {
    logError(error, 'Board Review Update');
    return false;
  }
}

async function testBoardReviewCompletion() {
  log('✅ Testing Board Review Completion...', 'INFO');
  
  try {
    const response = await makeRequest('POST', `/api/board-reviews/application/${testApplicationId}/complete`);
    
    if (response.success) {
      log('✅ Board Review completed successfully', 'SUCCESS');
      return true;
    } else {
      throw new Error('Board Review completion failed');
    }
  } catch (error) {
    logError(error, 'Board Review Completion');
    return false;
  }
}

async function testTermSheetCreation() {
  log('📄 Testing Term Sheet Creation...', 'INFO');
  
  try {
    const termSheetData = {
      ...testData.termSheet,
      applicationId: testApplicationId
    };
    
    const response = await makeRequest('POST', '/api/term-sheets', termSheetData);
    
    if (response.success && response.data.id) {
      testTermSheetId = response.data.id;
      log(`✅ Term Sheet created successfully - ID: ${testTermSheetId}`, 'SUCCESS');
      return true;
    } else {
      throw new Error('Term Sheet creation failed');
    }
  } catch (error) {
    logError(error, 'Term Sheet Creation');
    return false;
  }
}

async function testTermSheetApproval() {
  log('✅ Testing Term Sheet Approval...', 'INFO');
  
  try {
    const response = await makeRequest('POST', `/api/term-sheets/${testTermSheetId}/approve`);
    
    if (response.success) {
      log('✅ Term Sheet approved successfully', 'SUCCESS');
      return true;
    } else {
      throw new Error('Term Sheet approval failed');
    }
  } catch (error) {
    logError(error, 'Term Sheet Approval');
    return false;
  }
}

async function testInvestmentImplementationCreation() {
  log('🚀 Testing Investment Implementation Creation...', 'INFO');
  
  try {
    const implementationData = {
      ...testData.investmentImplementation,
      applicationId: testApplicationId,
      fundId: testFundId
    };
    
    const response = await makeRequest('POST', '/api/investment-implementation', implementationData);
    
    if (response.success && response.data.id) {
      testImplementationId = response.data.id;
      log(`✅ Investment Implementation created successfully - ID: ${testImplementationId}`, 'SUCCESS');
      return true;
    } else {
      throw new Error('Investment Implementation creation failed');
    }
  } catch (error) {
    logError(error, 'Investment Implementation Creation');
    return false;
  }
}

async function testPortfolioCompanyCreation() {
  log('🏢 Testing Portfolio Company Creation...', 'INFO');
  
  try {
    const response = await makeRequest('POST', '/api/portfolio-companies', testData.portfolioCompany);
    
    if (response.success && response.data.id) {
      testPortfolioCompanyId = response.data.id;
      log(`✅ Portfolio Company created successfully - ID: ${testPortfolioCompanyId}`, 'SUCCESS');
      return true;
    } else {
      throw new Error('Portfolio Company creation failed');
    }
  } catch (error) {
    logError(error, 'Portfolio Company Creation');
    return false;
  }
}

async function testListEndpoints() {
  log('📋 Testing List Endpoints...', 'INFO');
  
  const listTests = [
    { name: 'Applications', endpoint: '/api/applications' },
    { name: 'Funds', endpoint: '/api/funds' },
    { name: 'Board Reviews', endpoint: '/api/board-reviews' },
    { name: 'Investment Implementations', endpoint: '/api/investment-implementations' },
    { name: 'Portfolio Companies', endpoint: '/api/portfolio-companies' },
    { name: 'Term Sheets', endpoint: '/api/term-sheets' }
  ];
  
  let successCount = 0;
  
  for (const test of listTests) {
    try {
      const response = await makeRequest('GET', test.endpoint);
      if (response.success) {
        log(`✅ ${test.name} list retrieved successfully`, 'SUCCESS');
        successCount++;
      } else {
        log(`❌ ${test.name} list retrieval failed`, 'ERROR');
      }
    } catch (error) {
      logError(error, `${test.name} List`);
    }
  }
  
  log(`📊 List endpoints test: ${successCount}/${listTests.length} successful`, successCount === listTests.length ? 'SUCCESS' : 'WARNING');
  return successCount === listTests.length;
}

async function testSummaryEndpoints() {
  log('📊 Testing Summary Endpoints...', 'INFO');
  
  const summaryTests = [
    { name: 'Board Review Summary', endpoint: '/api/board-reviews/summary' },
    { name: 'My Board Reviews', endpoint: '/api/board-reviews/my' }
  ];
  
  let successCount = 0;
  
  for (const test of summaryTests) {
    try {
      const response = await makeRequest('GET', test.endpoint);
      if (response.success) {
        log(`✅ ${test.name} retrieved successfully`, 'SUCCESS');
        successCount++;
      } else {
        log(`❌ ${test.name} retrieval failed`, 'ERROR');
      }
    } catch (error) {
      logError(error, `${test.name} Summary`);
    }
  }
  
  log(`📊 Summary endpoints test: ${successCount}/${summaryTests.length} successful`, successCount === summaryTests.length ? 'SUCCESS' : 'WARNING');
  return successCount === summaryTests.length;
}

async function testCleanup() {
  log('🧹 Testing Cleanup (Optional)...', 'INFO');
  
  const cleanupTests = [
    { name: 'Portfolio Company', id: testPortfolioCompanyId, endpoint: '/api/portfolio-companies' },
    { name: 'Investment Implementation', id: testImplementationId, endpoint: '/api/investment-implementation' },
    { name: 'Term Sheet', id: testTermSheetId, endpoint: '/api/term-sheets' },
    { name: 'Board Review', id: testBoardReviewId, endpoint: '/api/board-reviews' },
    { name: 'Due Diligence', id: testDueDiligenceId, endpoint: '/api/due-diligence' },
    { name: 'Application', id: testApplicationId, endpoint: '/api/applications' },
    { name: 'Fund', id: testFundId, endpoint: '/api/funds' }
  ];
  
  let successCount = 0;
  
  for (const test of cleanupTests) {
    if (test.id) {
      try {
        const response = await makeRequest('DELETE', `${test.endpoint}/${test.id}`);
        if (response.success) {
          log(`✅ ${test.name} deleted successfully`, 'SUCCESS');
          successCount++;
        } else {
          log(`❌ ${test.name} deletion failed`, 'ERROR');
        }
      } catch (error) {
        logError(error, `${test.name} Deletion`);
      }
    }
  }
  
  log(`🧹 Cleanup test: ${successCount}/${cleanupTests.filter(t => t.id).length} successful`, successCount > 0 ? 'SUCCESS' : 'WARNING');
  return successCount > 0;
}

// Main test execution
async function runCompleteTest() {
  log('🚀 Starting Complete Investment Module Test', 'INFO');
  log('='.repeat(60), 'INFO');
  
  const testResults = {
    authentication: false,
    fundCreation: false,
    applicationCreation: false,
    applicationRetrieval: false,
    applicationUpdate: false,
    dueDiligenceCreation: false,
    dueDiligenceUpdate: false,
    dueDiligenceCompletion: false,
    boardReviewCreation: false,
    boardReviewUpdate: false,
    boardReviewCompletion: false,
    termSheetCreation: false,
    termSheetApproval: false,
    investmentImplementationCreation: false,
    portfolioCompanyCreation: false,
    listEndpoints: false,
    summaryEndpoints: false,
    cleanup: false
  };
  
  try {
    // Step 1: Authentication
    testResults.authentication = await testAuthentication();
    if (!testResults.authentication) {
      log('❌ Authentication failed - stopping tests', 'ERROR');
      return;
    }
    
    // Step 2: Fund Creation
    testResults.fundCreation = await testFundCreation();
    
    // Step 3: Application Workflow
    testResults.applicationCreation = await testApplicationCreation();
    if (testResults.applicationCreation) {
      testResults.applicationRetrieval = await testApplicationRetrieval();
      testResults.applicationUpdate = await testApplicationUpdate();
    }
    
    // Step 4: Due Diligence Workflow
    if (testResults.applicationCreation) {
      testResults.dueDiligenceCreation = await testDueDiligenceCreation();
      if (testResults.dueDiligenceCreation) {
        testResults.dueDiligenceUpdate = await testDueDiligenceUpdate();
        testResults.dueDiligenceCompletion = await testDueDiligenceCompletion();
      }
    }
    
    // Step 5: Board Review Workflow
    if (testResults.dueDiligenceCompletion) {
      testResults.boardReviewCreation = await testBoardReviewCreation();
      if (testResults.boardReviewCreation) {
        testResults.boardReviewUpdate = await testBoardReviewUpdate();
        testResults.boardReviewCompletion = await testBoardReviewCompletion();
      }
    }
    
    // Step 6: Term Sheet Workflow
    if (testResults.boardReviewCompletion) {
      testResults.termSheetCreation = await testTermSheetCreation();
      if (testResults.termSheetCreation) {
        testResults.termSheetApproval = await testTermSheetApproval();
      }
    }
    
    // Step 7: Investment Implementation
    if (testResults.termSheetApproval) {
      testResults.investmentImplementationCreation = await testInvestmentImplementationCreation();
    }
    
    // Step 8: Portfolio Company Creation
    if (testResults.investmentImplementationCreation) {
      testResults.portfolioCompanyCreation = await testPortfolioCompanyCreation();
    }
    
    // Step 9: List and Summary Endpoints
    testResults.listEndpoints = await testListEndpoints();
    testResults.summaryEndpoints = await testSummaryEndpoints();
    
    // Step 10: Cleanup (Optional)
    testResults.cleanup = await testCleanup();
    
  } catch (error) {
    logError(error, 'Main Test Execution');
  }
  
  // Final Results
  log('='.repeat(60), 'INFO');
  log('📊 FINAL TEST RESULTS', 'INFO');
  log('='.repeat(60), 'INFO');
  
  const totalTests = Object.keys(testResults).length;
  const passedTests = Object.values(testResults).filter(result => result === true).length;
  const failedTests = totalTests - passedTests;
  
  log(`✅ Passed: ${passedTests}/${totalTests}`, 'SUCCESS');
  log(`❌ Failed: ${failedTests}/${totalTests}`, failedTests > 0 ? 'ERROR' : 'SUCCESS');
  
  // Detailed Results
  Object.entries(testResults).forEach(([test, result]) => {
    const status = result ? '✅' : '❌';
    const color = result ? 'SUCCESS' : 'ERROR';
    log(`${status} ${test}: ${result ? 'PASSED' : 'FAILED'}`, color);
  });
  
  log('=' * 60, 'INFO');
  
  if (passedTests === totalTests) {
    log('🎉 ALL TESTS PASSED! Investment Module is working correctly.', 'SUCCESS');
  } else {
    log(`⚠️  ${failedTests} tests failed. Please review the errors above.`, 'WARNING');
  }
  
  return testResults;
}

// Run the tests
if (require.main === module) {
  runCompleteTest()
    .then(() => {
      log('🏁 Test execution completed', 'INFO');
      process.exit(0);
    })
    .catch((error) => {
      logError(error, 'Test Execution');
      process.exit(1);
    });
}

module.exports = {
  runCompleteTest,
  testData
};
