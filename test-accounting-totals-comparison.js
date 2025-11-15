const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testAccountingTotalsComparison() {
  let token = '';

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 ACCOUNTING TOTALS COMPARISON TEST');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Step 1: Login
  console.log('🔐 Step 1: Logging in...');
  try {
    const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    token = loginRes.data.token;
    console.log('✅ Login successful\n');
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    return;
  }

  // Get default currency
  console.log('💱 Step 2: Getting currencies...');
  let currencyId = null;
  try {
    const currenciesRes = await axios.get(`${BASE_URL}/api/accounting/currencies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const currencies = currenciesRes.data.data || [];
    if (currencies.length > 0) {
      const defaultCurrency = currencies.find(c => c.isDefault) || currencies[0];
      currencyId = defaultCurrency.id;
      console.log(`✅ Using currency: ${defaultCurrency.code} (${defaultCurrency.name})\n`);
    }
  } catch (error) {
    console.error('⚠️  Could not get currencies:', error.message);
  }

  // Use fixed date range: January 1, 2025 to December 31, 2025
  const yearStart = '2025-01-01';
  const yearEnd = '2025-12-31';
  const asOfDate = yearEnd; // Use end date as asOfDate for display

  console.log(`📅 Date Range (ALL REPORTS):`);
  console.log(`   Start Date: ${yearStart}`);
  console.log(`   End Date: ${yearEnd}`);
  console.log(`   As of Date: ${asOfDate}\n`);

  const results = {
    trialBalance: null,
    generalLedger: null,
    balanceSheet: null,
    cashFlow: null,
    errors: []
  };

  // Step 3: Get Trial Balance
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 Step 3: Getting Trial Balance...');
  console.log('═══════════════════════════════════════════════════════════\n');
  try {
    const trialBalanceRes = await axios.get(
      `${BASE_URL}/api/accounting/trial-balance`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          date: asOfDate,
          startDate: yearStart,
          endDate: yearEnd
        }
      }
    );

    const trialBalance = trialBalanceRes.data.data || trialBalanceRes.data;
    // Trial balance response has totals object
    const totals = trialBalance.totals || {};
    const totalDebits = parseFloat(totals.totalDebits || trialBalance.totalDebits || 0);
    const totalCredits = parseFloat(totals.totalCredits || trialBalance.totalCredits || 0);
    const difference = Math.abs(totalDebits - totalCredits);

    // Calculate cash and cash equivalents from trial balance
    let cashAndCashEquivalentsTB = 0;
    if (trialBalance.accounts && Array.isArray(trialBalance.accounts)) {
      for (const account of trialBalance.accounts) {
        const accountName = (account.accountName || '').toLowerCase();
        const accountNo = (account.accountNo || '').toString();
        const accountType = (account.accountType || '').toLowerCase();
        
        // Check if it's a cash account
        if (
          accountName.includes('cash') ||
          accountName.includes('bank') ||
          (accountNo.startsWith('10') && accountType.includes('asset'))
        ) {
          // For asset accounts: debitBalance - creditBalance = net balance
          // But if it's showing as credit, it means it's negative (overdrawn)
          const debitBalance = parseFloat(account.debitBalance || 0);
          const creditBalance = parseFloat(account.creditBalance || 0);
          const netBalance = debitBalance - creditBalance;
          cashAndCashEquivalentsTB += netBalance;
        }
      }
    }

    results.trialBalance = {
      totalDebits,
      totalCredits,
      difference,
      cashAndCashEquivalents: cashAndCashEquivalentsTB,
      accounts: trialBalance.accounts?.length || 0
    };

    console.log(`✅ Trial Balance retrieved successfully`);
    console.log(`   Total Debits: ${totalDebits.toFixed(2)}`);
    console.log(`   Total Credits: ${totalCredits.toFixed(2)}`);
    console.log(`   Difference: ${difference.toFixed(2)}`);
    console.log(`   Cash & Cash Equivalents: ${cashAndCashEquivalentsTB.toFixed(2)}`);
    console.log(`   Accounts: ${results.trialBalance.accounts}\n`);
  } catch (error) {
    console.error('❌ Error getting Trial Balance:', error.response?.data || error.message);
    results.errors.push({ report: 'Trial Balance', error: error.message });
  }

  // Step 4: Get General Ledger Totals (sum all accounts)
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📋 Step 4: Calculating General Ledger Totals...');
  console.log('═══════════════════════════════════════════════════════════\n');
  try {
    // Get all accounts
    const accountsRes = await axios.get(
      `${BASE_URL}/api/accounting/chart-of-accounts`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 1000 }
      }
    );

    const accounts = accountsRes.data.data || accountsRes.data || [];
    console.log(`✅ Found ${accounts.length} accounts\n`);

    let glTotalDebits = 0;
    let glTotalCredits = 0;
    let glCashAndCashEquivalents = 0;

    // For each account, get GL detail and sum
    // PROCESS SEQUENTIALLY (one at a time) to avoid overwhelming the server
    console.log('   Calculating totals for each account (processing sequentially)...');
    let processedCount = 0;

    for (const account of accounts) {
      try {
          const glRes = await axios.get(
            `${BASE_URL}/api/accounting/gl-ledger-detail`,
            {
              headers: { Authorization: `Bearer ${token}` },
              params: {
                accountNo: account.accountNo,
                startDate: yearStart,
                endDate: yearEnd
                // Don't pass currencyId - we want ALL currencies to match Trial Balance
              },
              timeout: 60000 // Increased timeout for large accounts (60 seconds)
            }
          );

        const glData = glRes.data.data || glRes.data;
        if (glRes.status === 200 && glData && glData.summary) {
          const debits = parseFloat(glData.summary.totalDebits || 0);
          const credits = parseFloat(glData.summary.totalCredits || 0);
          glTotalDebits += debits;
          glTotalCredits += credits;

          // Check if cash account
          const accountName = (account.accountName || '').toLowerCase();
          const accountNo = (account.accountNo || '').toString();
          if (
            accountName.includes('cash') ||
            accountName.includes('bank') ||
            accountNo.startsWith('10')
          ) {
            const closingBalance = parseFloat(glData.account?.closingBalance || 0);
            glCashAndCashEquivalents += closingBalance;
          }
        }
        processedCount++;
        if (processedCount % 5 === 0 || processedCount === accounts.length) {
          process.stdout.write(`   Processed ${processedCount}/${accounts.length} accounts...\r`);
        }
      } catch (error) {
        // Log errors for debugging
        if (error.response) {
          if (error.response.status !== 404) {
            console.error(`\n   ⚠️  Error for account ${account.accountNo}: ${error.response.status} - ${error.response.data?.message || error.message}`);
          }
        } else if (error.code === 'ECONNABORTED') {
          console.error(`\n   ⚠️  Timeout for account ${account.accountNo} (exceeded 60s)`);
        } else {
          console.error(`\n   ⚠️  Error for account ${account.accountNo}: ${error.message}`);
        }
        processedCount++;
      }
    }

    console.log(`\n✅ General Ledger totals calculated`);
    const glDifference = Math.abs(glTotalDebits - glTotalCredits);

    results.generalLedger = {
      totalDebits: glTotalDebits,
      totalCredits: glTotalCredits,
      difference: glDifference,
      cashAndCashEquivalents: glCashAndCashEquivalents
    };

    console.log(`   Total Debits: ${glTotalDebits.toFixed(2)}`);
    console.log(`   Total Credits: ${glTotalCredits.toFixed(2)}`);
    console.log(`   Difference: ${glDifference.toFixed(2)}`);
    console.log(`   Cash & Cash Equivalents: ${glCashAndCashEquivalents.toFixed(2)}\n`);
  } catch (error) {
    console.error('❌ Error calculating General Ledger totals:', error.response?.data || error.message);
    results.errors.push({ report: 'General Ledger', error: error.message });
  }

  // Step 5: Get Balance Sheet
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 Step 5: Getting Balance Sheet...');
  console.log('═══════════════════════════════════════════════════════════\n');
  try {
      const balanceSheetRes = await axios.get(
        `${BASE_URL}/api/accounting/balance-sheet`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            asOfDate: asOfDate,
            currencyId: currencyId,
            startDate: yearStart,
            endDate: yearEnd
          },
          timeout: 120000 // 2 minutes for Balance Sheet
        }
      );

    const balanceSheet = balanceSheetRes.data.data || balanceSheetRes.data;
    const totalAssets = parseFloat(balanceSheet.assets?.totalAssets || 0);
    const totalLiabilities = parseFloat(balanceSheet.liabilities?.totalLiabilities || 0);
    const equityTotal = parseFloat(balanceSheet.equity?.total || 0);
    const retainedEarnings = parseFloat(balanceSheet.equity?.retainedEarnings || 0);
    const totalEquity = equityTotal + retainedEarnings;
    const cashAndCashEquivalentsBS = parseFloat(balanceSheet.assets?.cashAndCashEquivalents || 0);

    results.balanceSheet = {
      totalAssets,
      totalLiabilities,
      totalEquity,
      liabilitiesPlusEquity: totalLiabilities + totalEquity,
      difference: Math.abs(totalAssets - (totalLiabilities + totalEquity)),
      cashAndCashEquivalents: cashAndCashEquivalentsBS
    };

    console.log(`✅ Balance Sheet retrieved successfully`);
    console.log(`   Total Assets: ${totalAssets.toFixed(2)}`);
    console.log(`   Total Liabilities: ${totalLiabilities.toFixed(2)}`);
    console.log(`   Total Equity: ${totalEquity.toFixed(2)}`);
    console.log(`   Liabilities + Equity: ${(totalLiabilities + totalEquity).toFixed(2)}`);
    console.log(`   Difference: ${results.balanceSheet.difference.toFixed(2)}`);
    console.log(`   Cash & Cash Equivalents: ${cashAndCashEquivalentsBS.toFixed(2)}\n`);
  } catch (error) {
    console.error('❌ Error getting Balance Sheet:', error.response?.data || error.message);
    results.errors.push({ report: 'Balance Sheet', error: error.message });
  }

  // Step 6: Get Cash Flow Statement
  console.log('═══════════════════════════════════════════════════════════');
  console.log('💰 Step 6: Getting Cash Flow Statement...');
  console.log('═══════════════════════════════════════════════════════════\n');
  try {
    const cashFlowRes = await axios.post(
      `${BASE_URL}/api/accounting/cash-flow/generate`,
      {
        startDate: yearStart,
        endDate: yearEnd,
        currencyId: currencyId
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 120000 // 2 minutes for Cash Flow
      }
    );

    const cashFlow = cashFlowRes.data.data || cashFlowRes.data;
    const beginningCash = parseFloat(cashFlow.beginningCashBalance || cashFlow.beginningCash || 0);
    const endingCash = parseFloat(cashFlow.endingCashBalance || cashFlow.endingCash || 0);
    const netCashFlow = parseFloat(cashFlow.netCashFlow || 0);

    results.cashFlow = {
      beginningCash,
      endingCash,
      netCashFlow,
      cashAndCashEquivalents: endingCash
    };

    console.log(`✅ Cash Flow Statement retrieved successfully`);
    console.log(`   Beginning Cash: ${beginningCash.toFixed(2)}`);
    console.log(`   Ending Cash: ${endingCash.toFixed(2)}`);
    console.log(`   Net Cash Flow: ${netCashFlow.toFixed(2)}`);
    console.log(`   Cash & Cash Equivalents: ${endingCash.toFixed(2)}\n`);
  } catch (error) {
    console.error('❌ Error getting Cash Flow Statement:', error.response?.data || error.message);
    results.errors.push({ report: 'Cash Flow', error: error.message });
  }

  // Step 7: Compare Totals
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 COMPARISON RESULTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Compare General Ledger vs Trial Balance
  if (results.generalLedger && results.trialBalance) {
    const glTotal = results.generalLedger.totalDebits;
    const tbTotal = results.trialBalance.totalDebits;
    const glTbDifference = Math.abs(glTotal - tbTotal);

    console.log('📊 GENERAL LEDGER vs TRIAL BALANCE:');
    console.log(`   GL Total Debits: ${glTotal.toFixed(2)}`);
    console.log(`   TB Total Debits: ${tbTotal.toFixed(2)}`);
    console.log(`   Difference: ${glTbDifference.toFixed(2)}`);
    if (glTbDifference > 0.01) {
      console.log(`   ❌ MISMATCH: ${glTbDifference.toFixed(2)} difference (${((glTbDifference / Math.max(glTotal, tbTotal)) * 100).toFixed(2)}%)\n`);
    } else {
      console.log(`   ✅ MATCH\n`);
    }
  }

  // Compare Cash and Cash Equivalents
  console.log('💰 CASH AND CASH EQUIVALENTS COMPARISON:');
  const cashValues = [];
  if (results.trialBalance) {
    console.log(`   Trial Balance: ${results.trialBalance.cashAndCashEquivalents.toFixed(2)}`);
    cashValues.push({ source: 'Trial Balance', value: results.trialBalance.cashAndCashEquivalents });
  }
  if (results.generalLedger) {
    console.log(`   General Ledger: ${results.generalLedger.cashAndCashEquivalents.toFixed(2)}`);
    cashValues.push({ source: 'General Ledger', value: results.generalLedger.cashAndCashEquivalents });
  }
  if (results.balanceSheet) {
    console.log(`   Balance Sheet: ${results.balanceSheet.cashAndCashEquivalents.toFixed(2)}`);
    cashValues.push({ source: 'Balance Sheet', value: results.balanceSheet.cashAndCashEquivalents });
  }
  if (results.cashFlow) {
    console.log(`   Cash Flow Statement: ${results.cashFlow.cashAndCashEquivalents.toFixed(2)}`);
    cashValues.push({ source: 'Cash Flow', value: results.cashFlow.cashAndCashEquivalents });
  }

  // Check if all cash values match
  if (cashValues.length > 1) {
    const firstValue = cashValues[0].value;
    let allMatch = true;
    const differences = [];

    for (let i = 1; i < cashValues.length; i++) {
      const diff = Math.abs(cashValues[i].value - firstValue);
      differences.push({
        source1: cashValues[0].source,
        source2: cashValues[i].source,
        difference: diff
      });
      if (diff > 0.01) {
        allMatch = false;
      }
    }

    console.log('');
    if (allMatch) {
      console.log('   ✅ All cash values MATCH');
    } else {
      console.log('   ❌ MISMATCHES FOUND:');
      differences.forEach(d => {
        if (d.difference > 0.01) {
          console.log(`      ${d.source1} vs ${d.source2}: ${d.difference.toFixed(2)} difference`);
        }
      });
    }
  }
  console.log('');

  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📋 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (results.errors.length > 0) {
    console.log('❌ ERRORS:');
    results.errors.forEach(e => {
      console.log(`   ${e.report}: ${e.error}`);
    });
    console.log('');
  }

  // Return results for further analysis
  return results;
}

testAccountingTotalsComparison()
  .then(results => {
    console.log('\n✅ Test completed');
    if (results.errors.length > 0) {
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });

