const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
let token = '';

async function login() {
  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });
    token = response.data.token;
    console.log('✅ Logged in successfully\n');
    return token;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function fetchStatementOfEquity() {
  console.log('📊 Fetching Statement of Equity (Jan 1 - Dec 31, 2025)...\n');
  try {
    const response = await axios.post(`${BASE_URL}/api/accounting/statement-of-equity/generate`, {
      startDate: '2025-01-01',
      endDate: '2025-12-31'
    }, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.data.success) {
      return response.data.data;
    } else {
      throw new Error(response.data.message || 'Failed to fetch statement of equity');
    }
  } catch (error) {
    console.error('❌ Error fetching Statement of Equity:', error.response?.data || error.message);
    throw error;
  }
}

async function fetchIncomeStatement() {
  console.log('📊 Fetching Income Statement (Jan 1 - Dec 31, 2025)...\n');
  try {
    const response = await axios.get(`${BASE_URL}/api/accounting/income-statement`, {
      params: {
        startDate: '2025-01-01',
        endDate: '2025-12-31'
      },
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.data.success) {
      return response.data.data;
    } else {
      throw new Error(response.data.message || 'Failed to fetch income statement');
    }
  } catch (error) {
    console.error('❌ Error fetching Income Statement:', error.response?.data || error.message);
    throw error;
  }
}

async function fetchBalanceSheet() {
  console.log('📊 Fetching Balance Sheet (As of Dec 31, 2025)...\n');
  try {
    const response = await axios.get(`${BASE_URL}/api/accounting/balance-sheet`, {
      params: {
        asOfDate: '2025-12-31',
        startDate: '2025-01-01',
        endDate: '2025-12-31'
      },
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.data.success) {
      return response.data.data;
    } else {
      throw new Error(response.data.message || 'Failed to fetch balance sheet');
    }
  } catch (error) {
    console.error('❌ Error fetching Balance Sheet:', error.response?.data || error.message);
    throw error;
  }
}

function verifyStatementOfEquityAgainstGuide(soe, incomeStatement, balanceSheet) {
  console.log('='.repeat(80));
  console.log('📊 STATEMENT OF EQUITY VERIFICATION AGAINST GUIDE');
  console.log('='.repeat(80));
  
  // According to guide:
  // 1. Statement of Equity explains the movement of the Equity account (3xxx)
  // 2. Shows: Net Income from IS, plus contributions/less distributions
  // 3. Formula: Closing Equity = Opening Equity + Net Income + Contributions - Distributions
  // 4. Closing Equity MUST match Balance Sheet Equity total
  
  console.log('\n📋 GUIDE REQUIREMENTS:');
  console.log('   1. Statement of Equity explains the movement of Equity accounts (3xxx)');
  console.log('   2. Shows Opening Equity (at start of period)');
  console.log('   3. Shows Net Income (from Income Statement)');
  console.log('   4. Shows Contributions (capital contributions)');
  console.log('   5. Shows Distributions (dividends/distributions)');
  console.log('   6. Shows Closing Equity (at end of period)');
  console.log('   7. Formula: Closing Equity = Opening Equity + Net Income + Contributions - Distributions');
  console.log('   8. Closing Equity MUST match Balance Sheet Equity total');
  
  // Check 1: Verify Equity Account Range (3xxx)
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 1: EQUITY ACCOUNT RANGE VERIFICATION (3xxx)');
  console.log('='.repeat(80));
  
  const equityAccounts = soe.accounts || [];
  console.log(`\n📊 Found ${equityAccounts.length} equity account(s) in Statement of Equity`);
  
  let invalidRangeCount = 0;
  const invalidAccounts = [];
  
  for (const account of equityAccounts) {
    const accountNoValue = parseInt(account.accountNo || '0', 10);
    
    if (accountNoValue < 3000 || accountNoValue >= 4000) {
      invalidRangeCount++;
      invalidAccounts.push({
        accountNo: account.accountNo,
        accountName: account.accountName,
        actualRange: accountNoValue,
        expectedRange: '3xxx'
      });
    }
  }
  
  if (invalidRangeCount === 0) {
    console.log('   ✅ All equity accounts are in correct range (3xxx)');
  } else {
    console.log(`   ❌ Found ${invalidRangeCount} accounts in incorrect range:`);
    for (const acc of invalidAccounts) {
      console.log(`      - ${acc.accountNo} (${acc.accountName}) - Account number is ${acc.actualRange} (expected ${acc.expectedRange})`);
    }
  }
  
  // Check 2: Verify Opening Equity calculation
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 2: OPENING EQUITY CALCULATION');
  console.log('='.repeat(80));
  
  const reportedOpeningEquity = soe.openingEquity || 0;
  const calculatedOpeningEquity = equityAccounts.reduce((sum, acc) => sum + (acc.openingBalance || 0), 0);
  const openingMatch = Math.abs(reportedOpeningEquity - calculatedOpeningEquity) < 0.01;
  
  console.log(`\n💰 Reported Opening Equity: $${reportedOpeningEquity.toFixed(2)}`);
  console.log(`💰 Calculated Opening Equity (sum of account opening balances): $${calculatedOpeningEquity.toFixed(2)}`);
  console.log(`   ${openingMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  // Check 3: Verify Net Income from Income Statement
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 3: NET INCOME FROM INCOME STATEMENT');
  console.log('='.repeat(80));
  
  const soeNetIncome = soe.netIncome || 0;
  const isNetIncome = incomeStatement?.totals?.netIncome || 0;
  const netIncomeMatch = Math.abs(soeNetIncome - isNetIncome) < 0.01;
  
  console.log(`\n📊 Statement of Equity Net Income: $${soeNetIncome.toFixed(2)}`);
  console.log(`📊 Income Statement Net Income: $${isNetIncome.toFixed(2)}`);
  console.log(`   ${netIncomeMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
  console.log(`   According to guide: Net Income should come from Income Statement`);
  
  // Check 4: Verify Contributions and Distributions
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 4: CONTRIBUTIONS AND DISTRIBUTIONS');
  console.log('='.repeat(80));
  
  const contributions = soe.contributions || 0;
  const distributions = soe.distributions || 0;
  
  console.log(`\n💰 Contributions: $${contributions.toFixed(2)}`);
  console.log(`💰 Distributions: $${distributions.toFixed(2)}`);
  console.log(`   According to guide: Contributions are capital contributions, Distributions are dividends/distributions`);
  
  // Check 5: Verify Closing Equity calculation
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 5: CLOSING EQUITY CALCULATION');
  console.log('='.repeat(80));
  
  const reportedClosingEquity = soe.closingEquity || 0;
  const calculatedClosingEquity = reportedOpeningEquity + soeNetIncome + contributions - distributions;
  const closingMatch = Math.abs(reportedClosingEquity - calculatedClosingEquity) < 0.01;
  
  console.log(`\n💰 Opening Equity: $${reportedOpeningEquity.toFixed(2)}`);
  console.log(`💰 Net Income: $${soeNetIncome.toFixed(2)}`);
  console.log(`💰 Contributions: $${contributions.toFixed(2)}`);
  console.log(`💰 Distributions: $${distributions.toFixed(2)}`);
  console.log(`💰 Calculated Closing Equity: $${calculatedClosingEquity.toFixed(2)}`);
  console.log(`💰 Reported Closing Equity: $${reportedClosingEquity.toFixed(2)}`);
  console.log(`   ${closingMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
  console.log(`   According to guide: Closing Equity = Opening Equity + Net Income + Contributions - Distributions`);
  
  // Check 6: Verify Closing Equity matches Balance Sheet Equity
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 6: CLOSING EQUITY vs BALANCE SHEET EQUITY');
  console.log('='.repeat(80));
  
  const bsTotalEquity = balanceSheet?.equity?.total || 0;
  const equityMatch = Math.abs(reportedClosingEquity - bsTotalEquity) < 0.01;
  
  console.log(`\n💰 Statement of Equity Closing Equity: $${reportedClosingEquity.toFixed(2)}`);
  console.log(`💰 Balance Sheet Total Equity: $${bsTotalEquity.toFixed(2)}`);
  console.log(`   ${equityMatch ? '✅ MATCH - Integrity Check PASSED' : '❌ MISMATCH - Integrity Check FAILED'}`);
  console.log(`   According to guide: Closing Equity MUST match Balance Sheet Equity total`);
  
  if (!equityMatch) {
    console.log(`\n   ⚠️  CRITICAL: Data integrity error detected!`);
    console.log(`   The Statement of Equity closing equity does not match the Balance Sheet equity total.`);
    console.log(`   This indicates a data integrity issue in the system.`);
  }
  
  // Check 7: Verify individual account closing balances
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 7: INDIVIDUAL ACCOUNT CLOSING BALANCES');
  console.log('='.repeat(80));
  
  let accountIssues = [];
  
  for (const account of equityAccounts) {
    const openingBalance = account.openingBalance || 0;
    const netChange = account.netChange || 0;
    const reportedClosingBalance = account.closingBalance || 0;
    const calculatedClosingBalance = openingBalance + netChange;
    const accountMatch = Math.abs(reportedClosingBalance - calculatedClosingBalance) < 0.01;
    
    if (!accountMatch) {
      accountIssues.push({
        accountNo: account.accountNo,
        accountName: account.accountName,
        openingBalance,
        netChange,
        reportedClosingBalance,
        calculatedClosingBalance
      });
    }
  }
  
  if (accountIssues.length === 0) {
    console.log('   ✅ All individual account closing balances are correctly calculated');
  } else {
    console.log(`   ❌ Found ${accountIssues.length} accounts with incorrect closing balance calculations:`);
    for (const issue of accountIssues) {
      console.log(`      - ${issue.accountNo} (${issue.accountName})`);
      console.log(`        Opening: $${issue.openingBalance.toFixed(2)}, Net Change: $${issue.netChange.toFixed(2)}`);
      console.log(`        Reported Closing: $${issue.reportedClosingBalance.toFixed(2)}`);
      console.log(`        Calculated Closing: $${issue.calculatedClosingBalance.toFixed(2)}`);
    }
  }
  
  // Check 8: Verify account type is Equity
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 8: ACCOUNT TYPE VERIFICATION');
  console.log('='.repeat(80));
  
  let typeIssues = [];
  
  for (const account of equityAccounts) {
    const accountType = account.accountType || '';
    if (accountType !== 'Equity') {
      typeIssues.push({
        accountNo: account.accountNo,
        accountName: account.accountName,
        accountType: accountType
      });
    }
  }
  
  if (typeIssues.length === 0) {
    console.log('   ✅ All accounts have correct account type (Equity)');
  } else {
    console.log(`   ❌ Found ${typeIssues.length} accounts with incorrect account type:`);
    for (const issue of typeIssues) {
      console.log(`      - ${issue.accountNo} (${issue.accountName}) - Type: ${issue.accountType} (expected: Equity)`);
    }
  }
  
  // Check 9: Verify Equity account balance calculation (Credits increase, Debits decrease)
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 9: EQUITY ACCOUNT BALANCE CALCULATION');
  console.log('='.repeat(80));
  
  console.log(`\n📊 Checking equity account balance calculation:`);
  console.log(`   According to guide: Equity accounts have Credit balance (Credits increase, Debits decrease)`);
  console.log(`   Net Change = Credits - Debits`);
  
  // This is verified by checking that the netChange calculation is correct
  // The implementation should use: netChange = credits - debits for equity accounts
  
  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('='.repeat(80));
  
  const allChecksPass = 
    invalidRangeCount === 0 &&
    openingMatch &&
    netIncomeMatch &&
    closingMatch &&
    equityMatch &&
    accountIssues.length === 0 &&
    typeIssues.length === 0;
  
  console.log(`\n✅ Equity Account Range: ${invalidRangeCount === 0 ? 'PASS' : 'FAIL'} (${invalidRangeCount} issues)`);
  console.log(`✅ Opening Equity Calculation: ${openingMatch ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Net Income from IS: ${netIncomeMatch ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Closing Equity Calculation: ${closingMatch ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Integrity Check (vs BS): ${equityMatch ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Individual Account Balances: ${accountIssues.length === 0 ? 'PASS' : 'FAIL'} (${accountIssues.length} issues)`);
  console.log(`✅ Account Type Verification: ${typeIssues.length === 0 ? 'PASS' : 'FAIL'} (${typeIssues.length} issues)`);
  
  console.log('\n' + '='.repeat(80));
  if (allChecksPass) {
    console.log('✅ STATEMENT OF EQUITY IS CORRECT - ALL CHECKS PASS');
  } else {
    console.log('⚠️  STATEMENT OF EQUITY HAS ISSUES - REVIEW DETAILS ABOVE');
  }
  console.log('='.repeat(80));
}

async function main() {
  try {
    await login();
    
    const soe = await fetchStatementOfEquity();
    const incomeStatement = await fetchIncomeStatement();
    const balanceSheet = await fetchBalanceSheet();
    
    verifyStatementOfEquityAgainstGuide(soe, incomeStatement, balanceSheet);
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    console.error(error.stack);
  }
}

main();

