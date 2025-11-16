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

async function fetchChartOfAccounts() {
  try {
    const response = await axios.get(`${BASE_URL}/api/accounting/chart-of-accounts`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.data.success) {
      return response.data.data;
    } else {
      throw new Error('Failed to fetch chart of accounts');
    }
  } catch (error) {
    console.error('❌ Error fetching Chart of Accounts:', error.response?.data || error.message);
    throw error;
  }
}

function getAccountNoValue(accountNo) {
  const numeric = parseInt(accountNo, 10);
  return Number.isNaN(numeric) ? 0 : numeric;
}

function verifyBalanceSheetAgainstGuide(balanceSheet, chartOfAccounts) {
  console.log('='.repeat(80));
  console.log('📊 BALANCE SHEET VERIFICATION AGAINST GUIDE');
  console.log('='.repeat(80));
  
  // According to guide:
  // - Balance Sheet uses accounts in ranges: Assets (1xxx), Liabilities (2xxx), Equity (3xxx)
  // - Assets = Liabilities + Equity must balance
  // - Retained Earnings (Net Income) is added to Equity
  // - Accumulated Depreciation should be shown as negative
  
  console.log('\n📋 GUIDE REQUIREMENTS:');
  console.log('   1. Balance Sheet shows only permanent accounts (Assets, Liabilities, Equity)');
  console.log('   2. Assets (1xxx range)');
  console.log('   3. Liabilities (2xxx range)');
  console.log('   4. Equity (3xxx range) + Retained Earnings (Net Income)');
  console.log('   5. Accounting Equation: Assets = Liabilities + Equity');
  console.log('   6. Accumulated Depreciation shown as negative (reduces fixed assets)');
  
  // Check 1: Verify account ranges
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 1: ACCOUNT RANGE VERIFICATION');
  console.log('='.repeat(80));
  
  const bsAccounts = [];
  
  // Collect all accounts from Balance Sheet
  for (const account of balanceSheet.assets?.currentAssets?.accounts || []) {
    bsAccounts.push({ ...account, section: 'Current Assets', range: '1xxx' });
  }
  for (const account of balanceSheet.assets?.fixedAssets?.accounts || []) {
    bsAccounts.push({ ...account, section: 'Fixed Assets', range: '1xxx' });
  }
  for (const account of balanceSheet.assets?.otherAssets?.accounts || []) {
    bsAccounts.push({ ...account, section: 'Other Assets', range: '1xxx' });
  }
  for (const account of balanceSheet.liabilities?.currentLiabilities?.accounts || []) {
    bsAccounts.push({ ...account, section: 'Current Liabilities', range: '2xxx' });
  }
  for (const account of balanceSheet.liabilities?.longTermLiabilities?.accounts || []) {
    bsAccounts.push({ ...account, section: 'Long-Term Liabilities', range: '2xxx' });
  }
  for (const account of balanceSheet.equity?.accounts || []) {
    bsAccounts.push({ ...account, section: 'Equity', range: '3xxx' });
  }
  
  console.log(`\n📊 Found ${bsAccounts.length} accounts on Balance Sheet`);
  
  let invalidRangeCount = 0;
  const invalidAccounts = [];
  
  for (const account of bsAccounts) {
    const accountNoValue = getAccountNoValue(account.accountNo);
    let expectedRange = '';
    
    if (account.section.includes('Asset')) {
      expectedRange = '1xxx';
      if (accountNoValue < 1000 || accountNoValue >= 2000) {
        invalidRangeCount++;
        invalidAccounts.push({ ...account, expectedRange, actualRange: accountNoValue });
      }
    } else if (account.section.includes('Liability')) {
      expectedRange = '2xxx';
      if (accountNoValue < 2000 || accountNoValue >= 3000) {
        invalidRangeCount++;
        invalidAccounts.push({ ...account, expectedRange, actualRange: accountNoValue });
      }
    } else if (account.section === 'Equity') {
      expectedRange = '3xxx';
      if (accountNoValue < 3000 || accountNoValue >= 4000) {
        invalidRangeCount++;
        invalidAccounts.push({ ...account, expectedRange, actualRange: accountNoValue });
      }
    }
  }
  
  if (invalidRangeCount === 0) {
    console.log('   ✅ All accounts are in correct ranges');
  } else {
    console.log(`   ❌ Found ${invalidRangeCount} accounts in incorrect ranges:`);
    for (const acc of invalidAccounts) {
      console.log(`      - ${acc.accountNo} (${acc.accountName}) in ${acc.section} but account number is ${acc.actualRange} (expected ${acc.expectedRange})`);
    }
  }
  
  // Check 2: Verify account types match sections
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 2: ACCOUNT TYPE vs SECTION VERIFICATION');
  console.log('='.repeat(80));
  
  const accountTypeMap = new Map();
  for (const account of chartOfAccounts) {
    accountTypeMap.set(account.accountNo, account.accountType);
  }
  
  let typeMismatchCount = 0;
  const typeMismatches = [];
  
  for (const account of bsAccounts) {
    const accountType = accountTypeMap.get(account.accountNo);
    if (!accountType) continue;
    
    let expectedType = '';
    if (account.section === 'Current Assets') {
      expectedType = 'Current Asset';
    } else if (account.section === 'Fixed Assets') {
      expectedType = 'Fixed Asset';
    } else if (account.section === 'Other Assets') {
      expectedType = 'Asset';
    } else if (account.section === 'Current Liabilities') {
      expectedType = 'Current Liability';
    } else if (account.section === 'Long-Term Liabilities') {
      expectedType = 'Long-Term Liability';
    } else if (account.section === 'Equity') {
      expectedType = 'Equity';
    }
    
    // Special handling for Accumulated Depreciation
    if (account.accountNo === 'ACCUM-DEPR' || account.accountName.toLowerCase().includes('accumulated depreciation')) {
      // This is fine - it's a contra-asset
      continue;
    }
    
    if (expectedType && accountType !== expectedType && !accountType.includes(expectedType.split(' ')[0])) {
      typeMismatchCount++;
      typeMismatches.push({
        accountNo: account.accountNo,
        accountName: account.accountName,
        section: account.section,
        expectedType,
        actualType: accountType
      });
    }
  }
  
  if (typeMismatchCount === 0) {
    console.log('   ✅ All account types match their sections');
  } else {
    console.log(`   ❌ Found ${typeMismatchCount} account type mismatches:`);
    for (const mismatch of typeMismatches) {
      console.log(`      - ${mismatch.accountNo} (${mismatch.accountName})`);
      console.log(`        Section: ${mismatch.section}, Expected Type: ${mismatch.expectedType}, Actual Type: ${mismatch.actualType}`);
    }
  }
  
  // Check 3: Verify Accounting Equation
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 3: ACCOUNTING EQUATION VERIFICATION');
  console.log('='.repeat(80));
  
  const totalAssets = balanceSheet.assets?.totalAssets || 0;
  const totalLiabilities = balanceSheet.liabilities?.totalLiabilities || 0;
  const totalEquity = balanceSheet.equity?.total || 0;
  const totalLiabilitiesAndEquity = balanceSheet.totalLiabilitiesAndEquity || 0;
  
  console.log(`\n📈 Total Assets: $${totalAssets.toFixed(2)}`);
  console.log(`📉 Total Liabilities: $${totalLiabilities.toFixed(2)}`);
  console.log(`💰 Total Equity: $${totalEquity.toFixed(2)}`);
  console.log(`📊 Total Liabilities + Equity: $${totalLiabilitiesAndEquity.toFixed(2)}`);
  
  const equationDifference = Math.abs(totalAssets - totalLiabilitiesAndEquity);
  const isBalanced = equationDifference < 0.01;
  
  console.log(`\n🧮 Accounting Equation: Assets = Liabilities + Equity`);
  console.log(`   ${totalAssets.toFixed(2)} = ${totalLiabilities.toFixed(2)} + ${totalEquity.toFixed(2)}`);
  console.log(`   ${totalAssets.toFixed(2)} = ${totalLiabilitiesAndEquity.toFixed(2)}`);
  console.log(`   ${isBalanced ? '✅ BALANCED' : '❌ NOT BALANCED'} (Difference: $${equationDifference.toFixed(2)})`);
  
  // Check 4: Verify Retained Earnings is included in Equity
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 4: RETAINED EARNINGS VERIFICATION');
  console.log('='.repeat(80));
  
  const retainedEarnings = balanceSheet.equity?.retainedEarnings || 0;
  const equityAccountsTotal = balanceSheet.equity?.accounts?.reduce((sum, acc) => sum + acc.balance, 0) || 0;
  
  console.log(`\n💰 Equity Accounts Total: $${equityAccountsTotal.toFixed(2)}`);
  console.log(`📊 Retained Earnings (Net Income): $${retainedEarnings.toFixed(2)}`);
  console.log(`📈 Total Equity (Accounts + Retained Earnings): $${totalEquity.toFixed(2)}`);
  
  const calculatedTotalEquity = equityAccountsTotal + retainedEarnings;
  const equityMatch = Math.abs(totalEquity - calculatedTotalEquity) < 0.01;
  
  console.log(`   ${equityMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
  console.log(`   According to guide: Equity = Equity Accounts + Retained Earnings (Net Income)`);
  
  // Check 5: Verify Accumulated Depreciation handling
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 5: ACCUMULATED DEPRECIATION VERIFICATION');
  console.log('='.repeat(80));
  
  const accumDeprAccount = balanceSheet.assets?.fixedAssets?.accounts?.find(
    acc => acc.accountNo === 'ACCUM-DEPR' || acc.accountName.toLowerCase().includes('accumulated depreciation')
  );
  
  if (accumDeprAccount) {
    console.log(`\n📊 Found Accumulated Depreciation: ${accumDeprAccount.accountName}`);
    console.log(`   Balance: $${accumDeprAccount.balance.toFixed(2)}`);
    console.log(`   ${accumDeprAccount.balance < 0 ? '✅ Correctly shown as negative' : '❌ Should be negative'}`);
    console.log(`   According to guide: Accumulated Depreciation reduces fixed assets (shown as negative)`);
  } else {
    console.log(`\n   ℹ️  No Accumulated Depreciation found (this is fine if there are no fixed assets with depreciation)`);
  }
  
  // Check 6: Verify only Balance Sheet accounts are included
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 6: FINANCIAL STATEMENT FILTER VERIFICATION');
  console.log('='.repeat(80));
  
  // Get all Balance Sheet accounts from Chart of Accounts
  const bsCoAAccounts = chartOfAccounts.filter(
    acc => acc.financialStatement === 'Balance Sheet' || acc.financialStatement === 'Balance sheet'
  );
  
  console.log(`\n📋 Chart of Accounts has ${bsCoAAccounts.length} Balance Sheet accounts`);
  console.log(`📊 Balance Sheet shows ${bsAccounts.length} accounts`);
  
  // Check if any Income Statement accounts appear on Balance Sheet
  const isAccounts = chartOfAccounts.filter(
    acc => acc.financialStatement === 'Income Statement'
  );
  
  const isAccountNos = new Set(isAccounts.map(acc => acc.accountNo));
  const bsAccountNos = new Set(bsAccounts.map(acc => acc.accountNo));
  
  const isAccountsOnBS = [];
  for (const accountNo of bsAccountNos) {
    if (isAccountNos.has(accountNo)) {
      isAccountsOnBS.push(accountNo);
    }
  }
  
  if (isAccountsOnBS.length === 0) {
    console.log('   ✅ No Income Statement accounts found on Balance Sheet');
  } else {
    console.log(`   ⚠️  Found ${isAccountsOnBS.length} Income Statement accounts on Balance Sheet:`);
    for (const accountNo of isAccountsOnBS) {
      const account = bsAccounts.find(acc => acc.accountNo === accountNo);
      console.log(`      - ${accountNo} (${account?.accountName || 'Unknown'})`);
    }
  }
  
  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('='.repeat(80));
  
  const allChecksPass = 
    invalidRangeCount === 0 &&
    typeMismatchCount === 0 &&
    isBalanced &&
    equityMatch &&
    isAccountsOnBS.length === 0;
  
  console.log(`\n✅ Account Ranges: ${invalidRangeCount === 0 ? 'PASS' : 'FAIL'} (${invalidRangeCount} issues)`);
  console.log(`✅ Account Types: ${typeMismatchCount === 0 ? 'PASS' : 'FAIL'} (${typeMismatchCount} issues)`);
  console.log(`✅ Accounting Equation: ${isBalanced ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Retained Earnings: ${equityMatch ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Financial Statement Filter: ${isAccountsOnBS.length === 0 ? 'PASS' : 'FAIL'} (${isAccountsOnBS.length} IS accounts on BS)`);
  
  console.log('\n' + '='.repeat(80));
  if (allChecksPass) {
    console.log('✅ BALANCE SHEET IS CORRECT - ALL CHECKS PASS');
  } else {
    console.log('⚠️  BALANCE SHEET HAS ISSUES - REVIEW DETAILS ABOVE');
  }
  console.log('='.repeat(80));
}

async function main() {
  try {
    await login();
    
    const balanceSheet = await fetchBalanceSheet();
    const chartOfAccounts = await fetchChartOfAccounts();
    
    verifyBalanceSheetAgainstGuide(balanceSheet, chartOfAccounts);
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    console.error(error.stack);
  }
}

main();

