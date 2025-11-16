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

async function fetchGeneralLedger(accountNo, currencyId = null) {
  try {
    const params = {
      accountNo: accountNo,
      startDate: '2025-01-01',
      endDate: '2025-12-31'
    };
    
    if (currencyId) {
      params.currencyId = currencyId;
    }
    
    const response = await axios.get(`${BASE_URL}/api/accounting/gl-ledger-detail`, {
      params: params,
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.data.success) {
      return response.data.data;
    } else {
      return null;
    }
  } catch (error) {
    return null;
  }
}

function getAccountNoValue(accountNo) {
  const numeric = parseInt(accountNo, 10);
  return Number.isNaN(numeric) ? 0 : numeric;
}

function isBalanceSheetAccount(accountNo) {
  const value = getAccountNoValue(accountNo);
  return (
    (value >= 1000 && value <= 1999) || // Assets
    (value >= 2000 && value <= 2999) || // Liabilities
    (value >= 3000 && value <= 3999)    // Equity
  );
}

function calculateGLBalance(glData, accountType) {
  if (!glData || !glData.transactions || glData.transactions.length === 0) {
    return { balance: 0, debits: 0, credits: 0 };
  }
  
  let totalDebits = 0;
  let totalCredits = 0;
  
  for (const entry of glData.transactions) {
    totalDebits += parseFloat(entry.debitAmount || 0);
    totalCredits += parseFloat(entry.creditAmount || 0);
  }
  
  // Calculate balance based on account type
  let balance = 0;
  const assetTypes = ['Current Asset', 'Fixed Asset', 'Non-Current Asset', 'Asset', 'Bank', 'Cash'];
  const liabilityTypes = ['Current Liability', 'Long-Term Liability', 'Liability'];
  const equityTypes = ['Equity', 'Retained Earnings'];
  
  if (assetTypes.includes(accountType)) {
    // Assets: Debit increases, Credit decreases
    balance = totalDebits - totalCredits;
  } else if (liabilityTypes.includes(accountType)) {
    // Liabilities: Credit increases, Debit decreases
    balance = totalCredits - totalDebits;
  } else if (equityTypes.includes(accountType)) {
    // Equity: Credit increases, Debit decreases
    balance = totalCredits - totalDebits;
  } else {
    // Default: assume debit balance
    balance = totalDebits - totalCredits;
  }
  
  // Add opening balance if available
  if (glData.account && glData.account.openingBalance !== undefined) {
    balance += parseFloat(glData.account.openingBalance || 0);
  }
  
  return { balance, debits: totalDebits, credits: totalCredits };
}

async function compareBalanceSheetWithGL(balanceSheet) {
  console.log('='.repeat(80));
  console.log('📊 BALANCE SHEET vs GENERAL LEDGER COMPARISON');
  console.log('='.repeat(80));
  
  // Get currency from Balance Sheet
  const bsCurrencyId = balanceSheet.currency?.id;
  console.log(`\n💰 Balance Sheet Currency: ${balanceSheet.currency || 'N/A'}`);
  console.log(`   Currency ID: ${bsCurrencyId || 'N/A'}\n`);
  
  // Build account map from Balance Sheet
  const bsAccountMap = new Map();
  
  // Current Assets
  for (const account of balanceSheet.assets?.currentAssets?.accounts || []) {
    bsAccountMap.set(account.accountNo, {
      accountNo: account.accountNo,
      accountName: account.accountName,
      accountType: 'Current Asset',
      section: 'Current Assets',
      bsBalance: account.balance,
      transactionCount: account.transactions?.length || 0
    });
  }
  
  // Fixed Assets
  for (const account of balanceSheet.assets?.fixedAssets?.accounts || []) {
    bsAccountMap.set(account.accountNo, {
      accountNo: account.accountNo,
      accountName: account.accountName,
      accountType: 'Fixed Asset',
      section: 'Fixed Assets',
      bsBalance: account.balance,
      transactionCount: account.transactions?.length || 0
    });
  }
  
  // Other Assets
  for (const account of balanceSheet.assets?.otherAssets?.accounts || []) {
    bsAccountMap.set(account.accountNo, {
      accountNo: account.accountNo,
      accountName: account.accountName,
      accountType: 'Other Asset',
      section: 'Other Assets',
      bsBalance: account.balance,
      transactionCount: account.transactions?.length || 0
    });
  }
  
  // Current Liabilities
  for (const account of balanceSheet.liabilities?.currentLiabilities?.accounts || []) {
    bsAccountMap.set(account.accountNo, {
      accountNo: account.accountNo,
      accountName: account.accountName,
      accountType: 'Current Liability',
      section: 'Current Liabilities',
      bsBalance: account.balance,
      transactionCount: account.transactions?.length || 0
    });
  }
  
  // Long-Term Liabilities
  for (const account of balanceSheet.liabilities?.longTermLiabilities?.accounts || []) {
    bsAccountMap.set(account.accountNo, {
      accountNo: account.accountNo,
      accountName: account.accountName,
      accountType: 'Long-Term Liability',
      section: 'Long-Term Liabilities',
      bsBalance: account.balance,
      transactionCount: account.transactions?.length || 0
    });
  }
  
  // Equity
  for (const account of balanceSheet.equity?.accounts || []) {
    bsAccountMap.set(account.accountNo, {
      accountNo: account.accountNo,
      accountName: account.accountName,
      accountType: 'Equity',
      section: 'Equity',
      bsBalance: account.balance,
      transactionCount: account.transactions?.length || 0
    });
  }
  
  console.log(`📊 Balance Sheet contains ${bsAccountMap.size} accounts with balances\n`);
  
  // Compare each account with General Ledger
  console.log('='.repeat(80));
  console.log('🔍 DETAILED ACCOUNT COMPARISON');
  console.log('='.repeat(80));
  
  let matchCount = 0;
  let mismatchCount = 0;
  let missingInGLCount = 0;
  const mismatches = [];
  const missingInGL = [];
  
  // Check accounts from Balance Sheet
  for (const [accountNo, bsAccount] of bsAccountMap.entries()) {
    const glData = await fetchGeneralLedger(accountNo, bsCurrencyId);
    
    if (!glData) {
      missingInGL.push(bsAccount);
      missingInGLCount++;
      console.log(`\n⚠️  Account ${bsAccount.accountNo} (${bsAccount.accountName}) - ${bsAccount.section}`);
      console.log(`   Balance Sheet Balance: $${bsAccount.bsBalance.toFixed(2)}`);
      console.log(`   General Ledger: NOT FOUND or NO ENTRIES`);
      continue;
    }
    
    const glBalance = calculateGLBalance(glData, bsAccount.accountType);
    const difference = Math.abs(bsAccount.bsBalance - glBalance.balance);
    const isMatch = difference < 0.01; // Allow for rounding differences
    
    if (isMatch) {
      matchCount++;
    } else {
      mismatchCount++;
      mismatches.push({
        account: bsAccount,
        glBalance: glBalance.balance,
        glDebits: glBalance.debits,
        glCredits: glBalance.credits,
        difference
      });
    }
    
    console.log(`\n${isMatch ? '✅' : '❌'} Account ${bsAccount.accountNo} (${bsAccount.accountName}) - ${bsAccount.section}`);
    console.log(`   Balance Sheet: $${bsAccount.bsBalance.toFixed(2)}`);
    console.log(`   General Ledger: $${glBalance.balance.toFixed(2)} (DR: $${glBalance.debits.toFixed(2)}, CR: $${glBalance.credits.toFixed(2)})`);
    console.log(`   Transactions: ${bsAccount.transactionCount} in BS, ${glData.transactions?.length || 0} in GL`);
    if (!isMatch) {
      console.log(`   ⚠️  DIFFERENCE: $${difference.toFixed(2)}`);
    }
  }
  
  // Verify Accounting Equation: Assets = Liabilities + Equity
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 ACCOUNTING EQUATION VERIFICATION');
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
  
  // Verify section totals
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 SECTION TOTALS VERIFICATION');
  console.log('='.repeat(80));
  
  // Assets
  let calculatedCurrentAssets = 0;
  let calculatedFixedAssets = 0;
  let calculatedOtherAssets = 0;
  
  for (const account of balanceSheet.assets?.currentAssets?.accounts || []) {
    calculatedCurrentAssets += account.balance;
  }
  
  for (const account of balanceSheet.assets?.fixedAssets?.accounts || []) {
    calculatedFixedAssets += account.balance;
  }
  
  for (const account of balanceSheet.assets?.otherAssets?.accounts || []) {
    calculatedOtherAssets += account.balance;
  }
  
  const calculatedTotalAssets = calculatedCurrentAssets + calculatedFixedAssets + calculatedOtherAssets;
  
  console.log(`\n📈 ASSETS:`);
  console.log(`   Current Assets:`);
  console.log(`      Section Total: $${(balanceSheet.assets?.currentAssets?.total || 0).toFixed(2)}`);
  console.log(`      Sum of Accounts: $${calculatedCurrentAssets.toFixed(2)}`);
  console.log(`      ${Math.abs((balanceSheet.assets?.currentAssets?.total || 0) - calculatedCurrentAssets) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  console.log(`   Fixed Assets:`);
  console.log(`      Section Total: $${(balanceSheet.assets?.fixedAssets?.total || 0).toFixed(2)}`);
  console.log(`      Sum of Accounts: $${calculatedFixedAssets.toFixed(2)}`);
  console.log(`      ${Math.abs((balanceSheet.assets?.fixedAssets?.total || 0) - calculatedFixedAssets) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  console.log(`   Other Assets:`);
  console.log(`      Section Total: $${(balanceSheet.assets?.otherAssets?.total || 0).toFixed(2)}`);
  console.log(`      Sum of Accounts: $${calculatedOtherAssets.toFixed(2)}`);
  console.log(`      ${Math.abs((balanceSheet.assets?.otherAssets?.total || 0) - calculatedOtherAssets) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  console.log(`   Total Assets:`);
  console.log(`      Section Total: $${totalAssets.toFixed(2)}`);
  console.log(`      Sum of All Assets: $${calculatedTotalAssets.toFixed(2)}`);
  console.log(`      ${Math.abs(totalAssets - calculatedTotalAssets) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  // Liabilities
  let calculatedCurrentLiabilities = 0;
  let calculatedLongTermLiabilities = 0;
  
  for (const account of balanceSheet.liabilities?.currentLiabilities?.accounts || []) {
    calculatedCurrentLiabilities += account.balance;
  }
  
  for (const account of balanceSheet.liabilities?.longTermLiabilities?.accounts || []) {
    calculatedLongTermLiabilities += account.balance;
  }
  
  const calculatedTotalLiabilities = calculatedCurrentLiabilities + calculatedLongTermLiabilities;
  
  console.log(`\n📉 LIABILITIES:`);
  console.log(`   Current Liabilities:`);
  console.log(`      Section Total: $${(balanceSheet.liabilities?.currentLiabilities?.total || 0).toFixed(2)}`);
  console.log(`      Sum of Accounts: $${calculatedCurrentLiabilities.toFixed(2)}`);
  console.log(`      ${Math.abs((balanceSheet.liabilities?.currentLiabilities?.total || 0) - calculatedCurrentLiabilities) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  console.log(`   Long-Term Liabilities:`);
  console.log(`      Section Total: $${(balanceSheet.liabilities?.longTermLiabilities?.total || 0).toFixed(2)}`);
  console.log(`      Sum of Accounts: $${calculatedLongTermLiabilities.toFixed(2)}`);
  console.log(`      ${Math.abs((balanceSheet.liabilities?.longTermLiabilities?.total || 0) - calculatedLongTermLiabilities) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  console.log(`   Total Liabilities:`);
  console.log(`      Section Total: $${totalLiabilities.toFixed(2)}`);
  console.log(`      Sum of All Liabilities: $${calculatedTotalLiabilities.toFixed(2)}`);
  console.log(`      ${Math.abs(totalLiabilities - calculatedTotalLiabilities) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  // Equity
  let calculatedEquity = 0;
  for (const account of balanceSheet.equity?.accounts || []) {
    calculatedEquity += account.balance;
  }
  
  // Equity total = Equity accounts + Retained Earnings (Net Income)
  const retainedEarnings = balanceSheet.equity?.retainedEarnings || 0;
  const calculatedTotalEquity = calculatedEquity + retainedEarnings;
  
  console.log(`\n💰 EQUITY:`);
  console.log(`   Equity Accounts Total: $${calculatedEquity.toFixed(2)}`);
  console.log(`   Retained Earnings (Net Income): $${retainedEarnings.toFixed(2)}`);
  console.log(`   Calculated Total Equity: $${calculatedTotalEquity.toFixed(2)}`);
  console.log(`   Section Total: $${totalEquity.toFixed(2)}`);
  console.log(`   ${Math.abs(totalEquity - calculatedTotalEquity) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 COMPARISON SUMMARY');
  console.log('='.repeat(80));
  
  console.log(`\n✅ Matching Accounts: ${matchCount}`);
  console.log(`❌ Mismatched Accounts: ${mismatchCount}`);
  console.log(`⚠️  Missing in GL: ${missingInGLCount}`);
  
  if (mismatches.length > 0) {
    console.log('\n\n❌ MISMATCHED ACCOUNTS:');
    console.log('-'.repeat(80));
    for (const mismatch of mismatches) {
      console.log(`\n   Account: ${mismatch.account.accountNo} - ${mismatch.account.accountName}`);
      console.log(`   Section: ${mismatch.account.section}`);
      console.log(`   BS Balance: $${mismatch.account.bsBalance.toFixed(2)}`);
      console.log(`   GL Balance: $${mismatch.glBalance.toFixed(2)}`);
      console.log(`   Difference: $${mismatch.difference.toFixed(2)}`);
    }
  }
  
  if (missingInGL.length > 0) {
    console.log('\n\n⚠️  ACCOUNTS IN BS BUT NOT IN GL:');
    console.log('-'.repeat(80));
    for (const account of missingInGL) {
      console.log(`   ${account.accountNo} - ${account.accountName} (${account.section}): $${account.bsBalance.toFixed(2)}`);
    }
  }
  
  console.log('\n\n' + '='.repeat(80));
  if (matchCount === bsAccountMap.size && mismatchCount === 0 && missingInGLCount === 0 && isBalanced) {
    console.log('✅ BALANCE SHEET IS CORRECT - ALL ACCOUNTS MATCH GENERAL LEDGER AND EQUATION BALANCES');
  } else {
    console.log('⚠️  BALANCE SHEET HAS DISCREPANCIES - REVIEW DETAILS ABOVE');
  }
  console.log('='.repeat(80));
}

async function main() {
  try {
    await login();
    
    const balanceSheet = await fetchBalanceSheet();
    
    await compareBalanceSheetWithGL(balanceSheet);
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    console.error(error.stack);
  }
}

main();

