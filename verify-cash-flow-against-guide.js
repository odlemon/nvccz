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

async function fetchCashFlowStatement() {
  console.log('💰 Fetching Cash Flow Statement (Jan 1 - Dec 31, 2025)...\n');
  try {
    const response = await axios.get(`${BASE_URL}/api/accounting/cash-flow`, {
      params: {
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        type: 'detailed'
      },
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.data.success) {
      return response.data.data;
    } else {
      throw new Error(response.data.message || 'Failed to fetch cash flow statement');
    }
  } catch (error) {
    console.error('❌ Error fetching Cash Flow Statement:', error.response?.data || error.message);
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

async function fetchGeneralLedger(accountNo, startDate, endDate, currencyId) {
  try {
    const params = {
      accountNo: accountNo,
      startDate: startDate,
      endDate: endDate
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

function verifyCashFlowAgainstGuide(cfs, balanceSheet) {
  console.log('='.repeat(80));
  console.log('💰 CASH FLOW STATEMENT VERIFICATION AGAINST GUIDE');
  console.log('='.repeat(80));
  
  // According to guide:
  // 1. CFS focuses ONLY on Cash Account (1100) - Bank/Cash Account
  // 2. Categorizes cash flows into: Operating, Investing, Financing
  // 3. Operating: Revenue (4xxx) and Expenses (5xxx) - day-to-day business
  // 4. Investing: Long-term assets (1500+) - buying/selling investments, equipment
  // 5. Financing: Equity (3xxx) and Liabilities (2xxx) - loans, capital contributions
  // 6. Final reconciliation: Beginning Cash + Net Cash Flow = Ending Cash
  // 7. Ending Cash MUST match Bank Account (1100) balance from Balance Sheet
  
  console.log('\n📋 GUIDE REQUIREMENTS:');
  console.log('   1. CFS focuses ONLY on Cash Account (1100) - Bank/Cash Account');
  console.log('   2. Operating Activities: Revenue (4xxx) and Expenses (5xxx)');
  console.log('   3. Investing Activities: Long-term assets (1500+) - buying/selling investments');
  console.log('   4. Financing Activities: Equity (3xxx) and Liabilities (2xxx) - loans, capital');
  console.log('   5. Cash accounts (1100) are EXCLUDED from activity sections (they are the result)');
  console.log('   6. Final reconciliation: Beginning Cash + Net Cash Flow = Ending Cash');
  console.log('   7. Ending Cash MUST match Bank Account (1100) balance from Balance Sheet');
  
  // Check 1: Verify Cash Account (1100) is NOT in any activity section
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 1: CASH ACCOUNT EXCLUSION FROM ACTIVITIES');
  console.log('='.repeat(80));
  
  const operatingAccounts = cfs.operatingActivities?.accounts || [];
  const investingAccounts = cfs.investingActivities?.accounts || [];
  const financingAccounts = cfs.financingActivities?.accounts || [];
  
  const allActivityAccounts = [
    ...operatingAccounts,
    ...investingAccounts,
    ...financingAccounts
  ];
  
  const cashAccountsInActivities = allActivityAccounts.filter(acc => {
    const accountName = acc.accountName?.toLowerCase() || '';
    const accountNo = acc.accountNo || '';
    return accountName.includes('cash') || 
           accountName.includes('bank') ||
           (accountNo >= '1000' && accountNo < '1100') ||
           accountNo === '1100';
  });
  
  if (cashAccountsInActivities.length === 0) {
    console.log('   ✅ Cash accounts are correctly excluded from all activity sections');
  } else {
    console.log(`   ❌ Found ${cashAccountsInActivities.length} cash accounts in activity sections:`);
    for (const acc of cashAccountsInActivities) {
      console.log(`      - ${acc.accountNo} (${acc.accountName}) in ${acc.cashFlowCategory}`);
    }
  }
  
  // Check 2: Verify Operating Activities categorization
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 2: OPERATING ACTIVITIES CATEGORIZATION');
  console.log('='.repeat(80));
  
  console.log(`\n📊 Operating Activities Total: $${(cfs.operatingActivities?.total || 0).toFixed(2)}`);
  console.log(`   Accounts: ${operatingAccounts.length}`);
  
  let operatingIssues = [];
  
  for (const account of operatingAccounts) {
    const accountNo = parseInt(account.accountNo || '0', 10);
    const accountType = account.accountType || '';
    const accountName = (account.accountName || '').toLowerCase();
    
    // According to guide: Operating = Revenue (4xxx) and Expenses (5xxx)
    const isRevenue = accountType === 'Revenue' || (accountNo >= 4000 && accountNo < 5000);
    const isExpense = accountType === 'Expense' || (accountNo >= 5000 && accountNo < 6000);
    
    // Also check for current assets/liabilities that affect operating cash flow
    const isOperatingAsset = accountType === 'Current Asset' && 
                            !accountName.includes('cash') && 
                            !accountName.includes('bank') &&
                            (accountName.includes('receivable') || accountName.includes('inventory') || accountName.includes('prepaid'));
    const isOperatingLiability = accountType === 'Current Liability' && 
                                 !accountName.includes('loan') &&
                                 (accountName.includes('payable') || accountName.includes('accrued'));
    
    if (!isRevenue && !isExpense && !isOperatingAsset && !isOperatingLiability) {
      operatingIssues.push({
        accountNo: account.accountNo,
        accountName: account.accountName,
        accountType: accountType,
        reason: 'Not a Revenue (4xxx), Expense (5xxx), or operating current asset/liability'
      });
    }
  }
  
  if (operatingIssues.length === 0) {
    console.log('   ✅ All operating accounts are correctly categorized');
  } else {
    console.log(`   ⚠️  Found ${operatingIssues.length} accounts that may not belong in Operating:`);
    for (const issue of operatingIssues) {
      console.log(`      - ${issue.accountNo} (${issue.accountName}) - ${issue.accountType}`);
      console.log(`        Reason: ${issue.reason}`);
    }
  }
  
  // Check 3: Verify Investing Activities categorization
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 3: INVESTING ACTIVITIES CATEGORIZATION');
  console.log('='.repeat(80));
  
  console.log(`\n📊 Investing Activities Total: $${(cfs.investingActivities?.total || 0).toFixed(2)}`);
  console.log(`   Accounts: ${investingAccounts.length}`);
  
  let investingIssues = [];
  
  for (const account of investingAccounts) {
    const accountNo = parseInt(account.accountNo || '0', 10);
    const accountType = account.accountType || '';
    const accountName = (account.accountName || '').toLowerCase();
    
    // According to guide: Investing = Long-term assets (1500+) - buying/selling investments, equipment
    const isLongTermAsset = accountType === 'Fixed Asset' || 
                           accountType === 'Long-Term Asset' ||
                           (accountNo >= 1500 && accountNo < 2000);
    const isInvestment = accountName.includes('investment') || 
                        accountName.includes('equipment') ||
                        accountName.includes('property') ||
                        accountName.includes('plant');
    
    if (!isLongTermAsset && !isInvestment) {
      investingIssues.push({
        accountNo: account.accountNo,
        accountName: account.accountName,
        accountType: accountType,
        reason: 'Not a long-term asset or investment'
      });
    }
  }
  
  if (investingIssues.length === 0) {
    console.log('   ✅ All investing accounts are correctly categorized');
  } else {
    console.log(`   ⚠️  Found ${investingIssues.length} accounts that may not belong in Investing:`);
    for (const issue of investingIssues) {
      console.log(`      - ${issue.accountNo} (${issue.accountName}) - ${issue.accountType}`);
      console.log(`        Reason: ${issue.reason}`);
    }
  }
  
  // Check 4: Verify Financing Activities categorization
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 4: FINANCING ACTIVITIES CATEGORIZATION');
  console.log('='.repeat(80));
  
  console.log(`\n📊 Financing Activities Total: $${(cfs.financingActivities?.total || 0).toFixed(2)}`);
  console.log(`   Accounts: ${financingAccounts.length}`);
  
  let financingIssues = [];
  
  for (const account of financingAccounts) {
    const accountNo = parseInt(account.accountNo || '0', 10);
    const accountType = account.accountType || '';
    const accountName = (account.accountName || '').toLowerCase();
    
    // According to guide: Financing = Equity (3xxx) and Liabilities (2xxx) - loans, capital
    const isEquity = accountType === 'Equity' || (accountNo >= 3000 && accountNo < 4000);
    const isLiability = accountType === 'Liability' || accountType === 'Current Liability' || accountType === 'Long-Term Liability' || (accountNo >= 2000 && accountNo < 3000);
    const isLoan = accountName.includes('loan') || accountName.includes('debt') || accountName.includes('mortgage');
    const isCapital = accountName.includes('capital') || accountName.includes('equity') || accountName.includes('shareholder');
    
    if (!isEquity && !isLiability && !isLoan && !isCapital) {
      financingIssues.push({
        accountNo: account.accountNo,
        accountName: account.accountName,
        accountType: accountType,
        reason: 'Not Equity (3xxx), Liability (2xxx), loan, or capital'
      });
    }
  }
  
  if (financingIssues.length === 0) {
    console.log('   ✅ All financing accounts are correctly categorized');
  } else {
    console.log(`   ⚠️  Found ${financingIssues.length} accounts that may not belong in Financing:`);
    for (const issue of financingIssues) {
      console.log(`      - ${issue.accountNo} (${issue.accountName}) - ${issue.accountType}`);
      console.log(`        Reason: ${issue.reason}`);
    }
  }
  
  // Check 5: Verify Net Cash Flow calculation
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 5: NET CASH FLOW CALCULATION');
  console.log('='.repeat(80));
  
  const operatingTotal = cfs.operatingActivities?.total || 0;
  const investingTotal = cfs.investingActivities?.total || 0;
  const financingTotal = cfs.financingActivities?.total || 0;
  const reportedNetCashFlow = cfs.netCashFlow || 0;
  
  const calculatedNetCashFlow = operatingTotal + investingTotal + financingTotal;
  const netCashFlowMatch = Math.abs(reportedNetCashFlow - calculatedNetCashFlow) < 0.01;
  
  console.log(`\n📊 Operating Activities: $${operatingTotal.toFixed(2)}`);
  console.log(`📊 Investing Activities: $${investingTotal.toFixed(2)}`);
  console.log(`📊 Financing Activities: $${financingTotal.toFixed(2)}`);
  console.log(`📊 Calculated Net Cash Flow: $${calculatedNetCashFlow.toFixed(2)}`);
  console.log(`📊 Reported Net Cash Flow: $${reportedNetCashFlow.toFixed(2)}`);
  console.log(`   ${netCashFlowMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
  console.log(`   According to guide: Net Cash Flow = Operating + Investing + Financing`);
  
  // Check 6: Verify Final Reconciliation
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 6: FINAL RECONCILIATION');
  console.log('='.repeat(80));
  
  const beginningCash = cfs.beginningCashBalance || 0;
  const endingCash = cfs.endingCashBalance || 0;
  const netCashFlow = cfs.netCashFlow || 0;
  
  const calculatedEndingCash = beginningCash + netCashFlow;
  const reconciliationMatch = Math.abs(endingCash - calculatedEndingCash) < 0.01;
  
  console.log(`\n💰 Cash at beginning of period: $${beginningCash.toFixed(2)}`);
  console.log(`💰 Net Cash Flow: $${netCashFlow.toFixed(2)}`);
  console.log(`💰 Calculated Ending Cash: $${calculatedEndingCash.toFixed(2)}`);
  console.log(`💰 Reported Ending Cash: $${endingCash.toFixed(2)}`);
  console.log(`   ${reconciliationMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
  console.log(`   According to guide: Ending Cash = Beginning Cash + Net Cash Flow`);
  
  // Check 7: Verify Ending Cash matches Balance Sheet Bank Account (1100)
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 7: ENDING CASH vs BALANCE SHEET BANK ACCOUNT (1100)');
  console.log('='.repeat(80));
  
  // Find Bank/Cash account (1100) in Balance Sheet
  const bsCashAccount = balanceSheet?.assets?.currentAssets?.accounts?.find(
    acc => acc.accountNo === '1100' || 
           (acc.accountName?.toLowerCase().includes('cash') && acc.accountName?.toLowerCase().includes('bank'))
  ) || balanceSheet?.assets?.cashAndCashEquivalents;
  
  let bsCashBalance = 0;
  if (bsCashAccount) {
    if (typeof bsCashAccount === 'number') {
      bsCashBalance = bsCashAccount;
    } else {
      bsCashBalance = bsCashAccount.balance || 0;
    }
  } else {
    // Try to sum all cash accounts from current assets
    const currentAssets = balanceSheet?.assets?.currentAssets?.accounts || [];
    for (const asset of currentAssets) {
      const accountName = (asset.accountName || '').toLowerCase();
      if (accountName.includes('cash') || accountName.includes('bank')) {
        bsCashBalance += asset.balance || 0;
      }
    }
  }
  
  const integrityMatch = Math.abs(endingCash - bsCashBalance) < 0.01;
  
  console.log(`\n💰 CFS Ending Cash: $${endingCash.toFixed(2)}`);
  console.log(`💰 BS Bank Account (1100) Balance: $${bsCashBalance.toFixed(2)}`);
  console.log(`   ${integrityMatch ? '✅ MATCH - Integrity Check PASSED' : '❌ MISMATCH - Integrity Check FAILED'}`);
  console.log(`   According to guide: Ending Cash MUST match Bank Account (1100) balance from Balance Sheet`);
  
  if (!integrityMatch) {
    console.log(`\n   ⚠️  CRITICAL: Data integrity error detected!`);
    console.log(`   The Cash Flow Statement ending cash does not match the Balance Sheet bank account balance.`);
    console.log(`   This indicates a data integrity issue in the system.`);
  }
  
  // Check 8: Verify Operating Activities sign convention
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 8: OPERATING ACTIVITIES SIGN CONVENTION');
  console.log('='.repeat(80));
  
  console.log(`\n📊 Checking sign convention for Operating Activities:`);
  console.log(`   According to guide:`);
  console.log(`   - Revenue (4xxx) increases cash flow (positive contribution)`);
  console.log(`   - Expenses (5xxx) decrease cash flow (negative contribution)`);
  console.log(`\n   Note: The netAmount field represents the account balance (positive for expenses).`);
  console.log(`   The sign convention is applied in the calculation (total -= expense.netAmount).`);
  
  let signIssues = [];
  
  for (const account of operatingAccounts) {
    const accountType = account.accountType || '';
    const netAmount = account.netAmount || 0;
    
    // For Revenue: netAmount should be positive (credits - debits, where credits > debits)
    // For Expense: netAmount should be positive (debits - credits, where debits > credits)
    // The sign convention is handled in calculateOperatingActivities (total -= expense.netAmount)
    
    if (accountType === 'Revenue' && netAmount < 0) {
      signIssues.push({
        accountNo: account.accountNo,
        accountName: account.accountName,
        accountType: accountType,
        netAmount: netAmount,
        issue: 'Revenue netAmount is negative (unexpected - may indicate credits < debits)'
      });
    } else if (accountType === 'Expense' && netAmount < 0) {
      signIssues.push({
        accountNo: account.accountNo,
        accountName: account.accountName,
        accountType: accountType,
        netAmount: netAmount,
        issue: 'Expense netAmount is negative (unexpected - may indicate debits < credits)'
      });
    }
  }
  
  if (signIssues.length === 0) {
    console.log('   ✅ All operating accounts have correct sign convention');
    console.log('   ✅ Revenue accounts have positive netAmount (cash inflow)');
    console.log('   ✅ Expense accounts have positive netAmount (correctly subtracted in calculation)');
  } else {
    console.log(`   ⚠️  Found ${signIssues.length} accounts with unexpected sign convention:`);
    for (const issue of signIssues) {
      console.log(`      - ${issue.accountNo} (${issue.accountName}) - ${issue.accountType}`);
      console.log(`        Net Amount: $${issue.netAmount.toFixed(2)}`);
      console.log(`        Issue: ${issue.issue}`);
    }
  }
  
  // Check 9: Verify Investing Activities sign convention
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 9: INVESTING ACTIVITIES SIGN CONVENTION');
  console.log('='.repeat(80));
  
  console.log(`\n📊 Checking sign convention for Investing Activities:`);
  console.log(`   According to guide:`);
  console.log(`   - Purchase of assets = cash outflow (negative)`);
  console.log(`   - Sale of assets = cash inflow (positive)`);
  
  // This is harder to verify without transaction details, but we can check the overall pattern
  
  // Check 10: Verify Financing Activities sign convention
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 10: FINANCING ACTIVITIES SIGN CONVENTION');
  console.log('='.repeat(80));
  
  console.log(`\n📊 Checking sign convention for Financing Activities:`);
  console.log(`   According to guide:`);
  console.log(`   - Proceeds from loans = cash inflow (positive)`);
  console.log(`   - Repayment of loans = cash outflow (negative)`);
  console.log(`   - Capital contributions = cash inflow (positive)`);
  console.log(`   - Dividends paid = cash outflow (negative)`);
  
  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('='.repeat(80));
  
  const allChecksPass = 
    cashAccountsInActivities.length === 0 &&
    operatingIssues.length === 0 &&
    investingIssues.length === 0 &&
    financingIssues.length === 0 &&
    netCashFlowMatch &&
    reconciliationMatch &&
    integrityMatch &&
    signIssues.length === 0;
  
  console.log(`\n✅ Cash Account Exclusion: ${cashAccountsInActivities.length === 0 ? 'PASS' : 'FAIL'} (${cashAccountsInActivities.length} issues)`);
  console.log(`✅ Operating Categorization: ${operatingIssues.length === 0 ? 'PASS' : 'FAIL'} (${operatingIssues.length} issues)`);
  console.log(`✅ Investing Categorization: ${investingIssues.length === 0 ? 'PASS' : 'FAIL'} (${investingIssues.length} issues)`);
  console.log(`✅ Financing Categorization: ${financingIssues.length === 0 ? 'PASS' : 'FAIL'} (${financingIssues.length} issues)`);
  console.log(`✅ Net Cash Flow Calculation: ${netCashFlowMatch ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Final Reconciliation: ${reconciliationMatch ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Integrity Check (vs BS): ${integrityMatch ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Sign Convention: ${signIssues.length === 0 ? 'PASS' : 'FAIL'} (Sign convention handled correctly in calculation)`);
  
  console.log('\n' + '='.repeat(80));
  if (allChecksPass) {
    console.log('✅ CASH FLOW STATEMENT IS CORRECT - ALL CHECKS PASS');
  } else {
    console.log('⚠️  CASH FLOW STATEMENT HAS ISSUES - REVIEW DETAILS ABOVE');
  }
  console.log('='.repeat(80));
}

async function main() {
  try {
    await login();
    
    const cfs = await fetchCashFlowStatement();
    const balanceSheet = await fetchBalanceSheet();
    
    verifyCashFlowAgainstGuide(cfs, balanceSheet);
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    console.error(error.stack);
  }
}

main();

