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

async function fetchGeneralLedger(accountNo, currencyId = null) {
  try {
    const params = {
      accountNo: accountNo,
      startDate: '2025-01-01',
      endDate: '2025-12-31'
    };
    
    // Don't pass currencyId if null - this allows GL to fetch all currencies
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
      return null; // Account might not have entries
    }
  } catch (error) {
    // Account might not exist or have no entries
    console.error(`   Error fetching GL for ${accountNo}:`, error.response?.data?.message || error.message);
    return null;
  }
}

async function getAllAccounts() {
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

function isIncomeStatementAccount(accountNo) {
  const value = getAccountNoValue(accountNo);
  return (
    (value >= 4000 && value <= 4999) || // Revenue
    (value >= 5000 && value <= 5999) || // Operating Expenses
    (value >= 6100 && value <= 6199) || // Income Tax
    (value >= 6200 && value <= 6999)    // Below-the-Line
  );
}

async function compareIncomeStatementWithGL(incomeStatement) {
  console.log('='.repeat(80));
  console.log('📊 INCOME STATEMENT vs GENERAL LEDGER COMPARISON');
  console.log('='.repeat(80));
  
  // Get all accounts
  const allAccounts = await getAllAccounts();
  const incomeStatementAccounts = allAccounts.filter(acc => isIncomeStatementAccount(acc.accountNo));
  
  console.log(`\n📋 Found ${incomeStatementAccounts.length} Income Statement accounts in Chart of Accounts`);
  
  // Build account map from Income Statement
  const isAccountMap = new Map();
  
  // Revenue accounts
  for (const account of incomeStatement.sections.revenue.accounts) {
    isAccountMap.set(account.accountId, {
      accountNo: account.accountNo,
      accountName: account.accountName,
      accountType: account.accountType,
      section: 'Revenue',
      isAmount: account.amount,
      isNetAmount: account.netAmount,
      transactionCount: account.transactions?.length || 0
    });
  }
  
  // Operating Expenses
  for (const account of incomeStatement.sections.operatingExpenses.accounts) {
    isAccountMap.set(account.accountId, {
      accountNo: account.accountNo,
      accountName: account.accountName,
      accountType: account.accountType,
      section: 'Operating Expenses',
      isAmount: account.amount,
      isNetAmount: account.netAmount,
      transactionCount: account.transactions?.length || 0
    });
  }
  
  // Income Tax
  for (const account of incomeStatement.sections.incomeTax.accounts) {
    isAccountMap.set(account.accountId, {
      accountNo: account.accountNo,
      accountName: account.accountName,
      accountType: account.accountType,
      section: 'Income Tax',
      isAmount: account.amount,
      isNetAmount: account.netAmount,
      transactionCount: account.transactions?.length || 0
    });
  }
  
  // Below-the-Line
  for (const account of incomeStatement.sections.belowTheLine.accounts) {
    isAccountMap.set(account.accountId, {
      accountNo: account.accountNo,
      accountName: account.accountName,
      accountType: account.accountType,
      section: 'Below-the-Line',
      isAmount: account.amount,
      isNetAmount: account.netAmount,
      transactionCount: account.transactions?.length || 0
    });
  }
  
  console.log(`\n📊 Income Statement contains ${isAccountMap.size} accounts with transactions`);
  
  // Compare each account with General Ledger
  console.log('\n' + '='.repeat(80));
  console.log('🔍 DETAILED ACCOUNT COMPARISON');
  console.log('='.repeat(80));
  
  let matchCount = 0;
  let mismatchCount = 0;
  let missingInGLCount = 0;
  let missingInISCount = 0;
  
  const mismatches = [];
  const missingInGL = [];
  const missingInIS = [];
  
  // Get currency from Income Statement
  const isCurrencyId = incomeStatement.currency?.id;
  console.log(`\n💰 Income Statement Currency: ${incomeStatement.currency?.code || 'N/A'} (${incomeStatement.currency?.name || 'N/A'})`);
  console.log(`   Currency ID: ${isCurrencyId || 'N/A'}\n`);
  
  // Check accounts from Income Statement
  // Income Statement filters by currencyId, so we should too
  for (const [accountId, isAccount] of isAccountMap.entries()) {
    // Use the same currency filter as Income Statement
    const glData = await fetchGeneralLedger(isAccount.accountNo, isCurrencyId);
    
    if (!glData) {
      missingInGL.push(isAccount);
      missingInGLCount++;
      console.log(`\n⚠️  Account ${isAccount.accountNo} (${isAccount.accountName}) - ${isAccount.section}`);
      console.log(`   Income Statement Balance: $${isAccount.isAmount.toFixed(2)}`);
      console.log(`   General Ledger: NOT FOUND or NO ENTRIES`);
      continue;
    }
    
    // GL Detail returns 'transactions' not 'entries'
    const glTransactions = glData.transactions || glData.entries || [];
    
    // Calculate GL balance
    let glDebits = 0;
    let glCredits = 0;
    let glNetAmount = 0;
    
    for (const entry of glTransactions) {
      glDebits += parseFloat(entry.debitAmount || 0);
      glCredits += parseFloat(entry.creditAmount || 0);
    }
    
    // Calculate net based on account type
    if (isAccount.accountType === 'Revenue') {
      glNetAmount = glCredits - glDebits;
    } else if (isAccount.accountType === 'Expense') {
      glNetAmount = glDebits - glCredits;
    } else {
      glNetAmount = glCredits - glDebits; // Default
    }
    
    const difference = Math.abs(isAccount.isAmount - glNetAmount);
    const isMatch = difference < 0.01; // Allow for rounding differences
    
    if (isMatch) {
      matchCount++;
    } else {
      mismatchCount++;
      mismatches.push({
        account: isAccount,
        glDebits,
        glCredits,
        glNetAmount,
        difference
      });
    }
    
    console.log(`\n${isMatch ? '✅' : '❌'} Account ${isAccount.accountNo} (${isAccount.accountName}) - ${isAccount.section}`);
    console.log(`   Income Statement: $${isAccount.isAmount.toFixed(2)} (Net: $${isAccount.isNetAmount.toFixed(2)})`);
    console.log(`   General Ledger:   $${glNetAmount.toFixed(2)} (DR: $${glDebits.toFixed(2)}, CR: $${glCredits.toFixed(2)})`);
    console.log(`   Transactions: ${isAccount.transactionCount} in IS, ${glTransactions.length} in GL`);
    if (!isMatch) {
      console.log(`   ⚠️  DIFFERENCE: $${difference.toFixed(2)}`);
    }
  }
  
  // Check for accounts in GL but not in IS
  console.log(`\n\n${'='.repeat(80)}`);
  console.log('🔍 CHECKING FOR ACCOUNTS IN GL BUT NOT IN INCOME STATEMENT');
  console.log('='.repeat(80));
  
  for (const account of incomeStatementAccounts) {
    if (!isAccountMap.has(account.id)) {
      const glData = await fetchGeneralLedger(account.accountNo, isCurrencyId);
      const glTransactions = glData?.transactions || glData?.entries || [];
      if (glData && glTransactions.length > 0) {
        // Calculate balance
        let glDebits = 0;
        let glCredits = 0;
        for (const entry of glTransactions) {
          glDebits += parseFloat(entry.debitAmount || 0);
          glCredits += parseFloat(entry.creditAmount || 0);
        }
        
        let glNetAmount = 0;
        if (account.accountType === 'Revenue') {
          glNetAmount = glCredits - glDebits;
        } else if (account.accountType === 'Expense') {
          glNetAmount = glDebits - glCredits;
        }
        
        if (Math.abs(glNetAmount) > 0.01) {
          missingInIS.push({
            accountNo: account.accountNo,
            accountName: account.accountName,
            accountType: account.accountType,
            glNetAmount,
            glDebits,
            glCredits,
            transactionCount: glTransactions.length
          });
          missingInISCount++;
        }
      }
    }
  }
  
  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 COMPARISON SUMMARY');
  console.log('='.repeat(80));
  
  console.log(`\n✅ Matching Accounts: ${matchCount}`);
  console.log(`❌ Mismatched Accounts: ${mismatchCount}`);
  console.log(`⚠️  Missing in GL: ${missingInGLCount}`);
  console.log(`⚠️  Missing in IS: ${missingInISCount}`);
  
  if (mismatches.length > 0) {
    console.log('\n\n❌ MISMATCHED ACCOUNTS:');
    console.log('-'.repeat(80));
    for (const mismatch of mismatches) {
      console.log(`\n   Account: ${mismatch.account.accountNo} - ${mismatch.account.accountName}`);
      console.log(`   Section: ${mismatch.account.section}`);
      console.log(`   IS Amount: $${mismatch.account.isAmount.toFixed(2)}`);
      console.log(`   GL Amount: $${mismatch.glNetAmount.toFixed(2)}`);
      console.log(`   Difference: $${mismatch.difference.toFixed(2)}`);
    }
  }
  
  if (missingInGL.length > 0) {
    console.log('\n\n⚠️  ACCOUNTS IN IS BUT NOT IN GL:');
    console.log('-'.repeat(80));
    for (const account of missingInGL) {
      console.log(`   ${account.accountNo} - ${account.accountName} (${account.section}): $${account.isAmount.toFixed(2)}`);
    }
  }
  
  if (missingInIS.length > 0) {
    console.log('\n\n⚠️  ACCOUNTS IN GL BUT NOT IN IS:');
    console.log('-'.repeat(80));
    for (const account of missingInIS) {
      console.log(`   ${account.accountNo} - ${account.accountName} (${account.accountType}): $${account.glNetAmount.toFixed(2)}`);
    }
  }
  
  // Verify totals
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 INCOME STATEMENT TOTALS VERIFICATION');
  console.log('='.repeat(80));
  
  const isRevenueTotal = incomeStatement.sections.revenue.total;
  const isExpensesTotal = incomeStatement.sections.operatingExpenses.total;
  const isIncomeTaxTotal = incomeStatement.sections.incomeTax.total;
  const isBelowTheLineTotal = incomeStatement.sections.belowTheLine.total;
  
  // Calculate from individual accounts
  let calculatedRevenue = 0;
  let calculatedExpenses = 0;
  let calculatedIncomeTax = 0;
  let calculatedBelowTheLine = 0;
  
  for (const account of incomeStatement.sections.revenue.accounts) {
    calculatedRevenue += account.amount;
  }
  
  for (const account of incomeStatement.sections.operatingExpenses.accounts) {
    calculatedExpenses += account.amount;
  }
  
  for (const account of incomeStatement.sections.incomeTax.accounts) {
    calculatedIncomeTax += account.amount;
  }
  
  for (const account of incomeStatement.sections.belowTheLine.accounts) {
    calculatedBelowTheLine += account.amount;
  }
  
  console.log(`\n📈 Revenue:`);
  console.log(`   Section Total: $${isRevenueTotal.toFixed(2)}`);
  console.log(`   Sum of Accounts: $${calculatedRevenue.toFixed(2)}`);
  console.log(`   ${Math.abs(isRevenueTotal - calculatedRevenue) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  console.log(`\n📉 Operating Expenses:`);
  console.log(`   Section Total: $${isExpensesTotal.toFixed(2)}`);
  console.log(`   Sum of Accounts: $${calculatedExpenses.toFixed(2)}`);
  console.log(`   ${Math.abs(isExpensesTotal - calculatedExpenses) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  console.log(`\n💰 Income Tax:`);
  console.log(`   Section Total: $${isIncomeTaxTotal.toFixed(2)}`);
  console.log(`   Sum of Accounts: $${calculatedIncomeTax.toFixed(2)}`);
  console.log(`   ${Math.abs(isIncomeTaxTotal - calculatedIncomeTax) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  console.log(`\n📊 Below-the-Line:`);
  console.log(`   Section Total: $${isBelowTheLineTotal.toFixed(2)}`);
  console.log(`   Sum of Accounts: $${calculatedBelowTheLine.toFixed(2)}`);
  console.log(`   ${Math.abs(isBelowTheLineTotal - calculatedBelowTheLine) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  console.log(`\n\n${'='.repeat(80)}`);
  if (matchCount === isAccountMap.size && mismatchCount === 0 && missingInGLCount === 0 && missingInISCount === 0) {
    console.log('✅ INCOME STATEMENT IS CORRECT - ALL ACCOUNTS MATCH GENERAL LEDGER');
  } else {
    console.log('⚠️  INCOME STATEMENT HAS DISCREPANCIES - REVIEW DETAILS ABOVE');
  }
  console.log('='.repeat(80));
}

async function main() {
  try {
    await login();
    
    const incomeStatement = await fetchIncomeStatement();
    
    await compareIncomeStatementWithGL(incomeStatement);
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    console.error(error.stack);
  }
}

main();

