const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testDateRangeComparison() {
  let token = '';

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 DATE RANGE COMPARISON TEST');
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

  // Use fixed date range: January 1, 2025 to December 31, 2025
  const yearStart = '2025-01-01';
  const yearEnd = '2025-12-31';
  const asOfDate = yearEnd;

  console.log(`📅 Date Range (ALL REPORTS):`);
  console.log(`   Start Date: ${yearStart}`);
  console.log(`   End Date: ${yearEnd}`);
  console.log(`   As of Date: ${asOfDate}\n`);

  // Get default currency
  let currencyId = null;
  try {
    const currenciesRes = await axios.get(`${BASE_URL}/api/accounting/currencies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const currencies = currenciesRes.data.data || [];
    if (currencies.length > 0) {
      const defaultCurrency = currencies.find(c => c.isDefault) || currencies[0];
      currencyId = defaultCurrency.id;
      console.log(`💱 Default Currency: ${defaultCurrency.code} (${defaultCurrency.name})\n`);
    }
  } catch (error) {
    console.error('⚠️  Could not get currencies:', error.message);
  }

  const results = {
    trialBalance: null,
    generalLedger: null,
    balanceSheet: null,
    cashFlow: null,
    differences: []
  };

  // Step 2: Get Trial Balance (NO currency filter)
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 Step 2: Getting Trial Balance (ALL CURRENCIES)...');
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
          // NO currencyId - includes ALL currencies
        }
      }
    );

    const trialBalance = trialBalanceRes.data.data || trialBalanceRes.data;
    const totals = trialBalance.totals || {};
    const totalDebits = parseFloat(totals.totalDebits || trialBalance.totalDebits || 0);
    const totalCredits = parseFloat(totals.totalCredits || trialBalance.totalCredits || 0);

    results.trialBalance = {
      totalDebits,
      totalCredits,
      accounts: trialBalance.accounts?.length || 0,
      accountTypes: new Set(trialBalance.accounts?.map(a => a.accountType) || []).size
    };

    console.log(`✅ Trial Balance (ALL CURRENCIES)`);
    console.log(`   Total Debits: ${totalDebits.toFixed(2)}`);
    console.log(`   Total Credits: ${totalCredits.toFixed(2)}`);
    console.log(`   Accounts: ${results.trialBalance.accounts}`);
    console.log(`   Account Types: ${results.trialBalance.accountTypes}\n`);
  } catch (error) {
    console.error('❌ Error getting Trial Balance:', error.response?.data || error.message);
    results.errors = results.errors || [];
    results.errors.push({ report: 'Trial Balance', error: error.message });
  }

  // Step 3: Get General Ledger Totals (NO currency filter)
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📋 Step 3: Getting General Ledger (ALL CURRENCIES)...');
  console.log('═══════════════════════════════════════════════════════════\n');
  try {
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
    let processedCount = 0;

    console.log('   Processing accounts sequentially...');
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
              // NO currencyId - includes ALL currencies
            },
            timeout: 60000
          }
        );

        const glData = glRes.data.data || glRes.data;
        if (glRes.status === 200 && glData && glData.summary) {
          const debits = parseFloat(glData.summary.totalDebits || 0);
          const credits = parseFloat(glData.summary.totalCredits || 0);
          glTotalDebits += debits;
          glTotalCredits += credits;
        }
        processedCount++;
        if (processedCount % 10 === 0 || processedCount === accounts.length) {
          process.stdout.write(`   Processed ${processedCount}/${accounts.length} accounts...\r`);
        }
      } catch (error) {
        if (error.response?.status !== 404) {
          console.error(`\n   ⚠️  Error for account ${account.accountNo}: ${error.response?.status || error.message}`);
        }
        processedCount++;
      }
    }

    results.generalLedger = {
      totalDebits: glTotalDebits,
      totalCredits: glTotalCredits,
      accounts: processedCount
    };

    console.log(`\n✅ General Ledger (ALL CURRENCIES)`);
    console.log(`   Total Debits: ${glTotalDebits.toFixed(2)}`);
    console.log(`   Total Credits: ${glTotalCredits.toFixed(2)}`);
    console.log(`   Accounts Processed: ${processedCount}\n`);
  } catch (error) {
    console.error('❌ Error getting General Ledger:', error.response?.data || error.message);
    results.errors = results.errors || [];
    results.errors.push({ report: 'General Ledger', error: error.message });
  }

  // Step 4: Get Balance Sheet (WITH currency filter)
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 Step 4: Getting Balance Sheet (WITH CURRENCY FILTER)...');
  console.log('═══════════════════════════════════════════════════════════\n');
  try {
    const balanceSheetRes = await axios.get(
      `${BASE_URL}/api/accounting/balance-sheet`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          asOfDate: asOfDate,
          currencyId: currencyId, // WITH currency filter
          startDate: yearStart,
          endDate: yearEnd
        },
        timeout: 120000
      }
    );

    const balanceSheet = balanceSheetRes.data.data || balanceSheetRes.data;
    const totalAssets = parseFloat(balanceSheet.assets?.totalAssets || 0);
    const totalLiabilities = parseFloat(balanceSheet.liabilities?.totalLiabilities || 0);
    const totalEquity = parseFloat(balanceSheet.equity?.totalEquity || 0);

    results.balanceSheet = {
      totalAssets,
      totalLiabilities,
      totalEquity,
      currencyId: currencyId
    };

    console.log(`✅ Balance Sheet (CURRENCY: ${currencyId})`);
    console.log(`   Total Assets: ${totalAssets.toFixed(2)}`);
    console.log(`   Total Liabilities: ${totalLiabilities.toFixed(2)}`);
    console.log(`   Total Equity: ${totalEquity.toFixed(2)}\n`);
  } catch (error) {
    console.error('❌ Error getting Balance Sheet:', error.response?.data || error.message);
    results.errors = results.errors || [];
    results.errors.push({ report: 'Balance Sheet', error: error.message });
  }

  // Step 5: Get Cash Flow (WITH currency filter)
  console.log('═══════════════════════════════════════════════════════════');
  console.log('💰 Step 5: Getting Cash Flow (WITH CURRENCY FILTER)...');
  console.log('═══════════════════════════════════════════════════════════\n');
  try {
    const cashFlowRes = await axios.post(
      `${BASE_URL}/api/accounting/cash-flow/generate`,
      {
        startDate: yearStart,
        endDate: yearEnd,
        currencyId: currencyId // WITH currency filter
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 120000
      }
    );

    const cashFlow = cashFlowRes.data.data || cashFlowRes.data;
    const netCashFlow = parseFloat(cashFlow.netCashFlow || 0);
    const beginningCash = parseFloat(cashFlow.beginningCashBalance || 0);
    const endingCash = parseFloat(cashFlow.endingCashBalance || 0);

    results.cashFlow = {
      netCashFlow,
      beginningCash,
      endingCash,
      currencyId: currencyId
    };

    console.log(`✅ Cash Flow (CURRENCY: ${currencyId})`);
    console.log(`   Beginning Cash: ${beginningCash.toFixed(2)}`);
    console.log(`   Net Cash Flow: ${netCashFlow.toFixed(2)}`);
    console.log(`   Ending Cash: ${endingCash.toFixed(2)}\n`);
  } catch (error) {
    console.error('❌ Error getting Cash Flow:', error.response?.data || error.message);
    results.errors = results.errors || [];
    results.errors.push({ report: 'Cash Flow', error: error.message });
  }

  // Step 6: Compare Results
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 COMPARISON RESULTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (results.trialBalance && results.generalLedger) {
    const tbDebits = results.trialBalance.totalDebits;
    const glDebits = results.generalLedger.totalDebits;
    const difference = Math.abs(tbDebits - glDebits);
    const percentDiff = tbDebits > 0 ? (difference / tbDebits) * 100 : 0;

    console.log('📊 TRIAL BALANCE vs GENERAL LEDGER:');
    console.log(`   TB Total Debits: ${tbDebits.toFixed(2)}`);
    console.log(`   GL Total Debits: ${glDebits.toFixed(2)}`);
    console.log(`   Difference: ${difference.toFixed(2)} (${percentDiff.toFixed(2)}%)`);
    
    if (difference > 0.01) {
      console.log(`   ⚠️  MISMATCH: ${difference.toFixed(2)} difference`);
      results.differences.push({
        comparison: 'TB vs GL',
        difference: difference,
        percentDiff: percentDiff
      });
    } else {
      console.log(`   ✅ MATCH: Totals are identical`);
    }
    console.log('');
  }

  if (results.trialBalance && results.balanceSheet) {
    console.log('📊 TRIAL BALANCE vs BALANCE SHEET:');
    console.log(`   TB Total Debits: ${results.trialBalance.totalDebits.toFixed(2)}`);
    console.log(`   BS Total Assets: ${results.balanceSheet.totalAssets.toFixed(2)}`);
    console.log(`   ⚠️  NOTE: Balance Sheet only includes Balance Sheet accounts`);
    console.log(`   ⚠️  NOTE: Balance Sheet filters by currency (${currencyId})`);
    console.log(`   ⚠️  NOTE: Trial Balance includes ALL accounts and ALL currencies`);
    console.log('');
  }

  if (results.trialBalance && results.cashFlow) {
    console.log('📊 TRIAL BALANCE vs CASH FLOW:');
    console.log(`   TB Total Debits: ${results.trialBalance.totalDebits.toFixed(2)}`);
    console.log(`   CF Ending Cash: ${results.cashFlow.endingCash.toFixed(2)}`);
    console.log(`   ⚠️  NOTE: Cash Flow filters by currency (${currencyId})`);
    console.log(`   ⚠️  NOTE: Trial Balance includes ALL currencies`);
    console.log('');
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📋 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('Key Differences:');
  console.log('1. Trial Balance: ALL accounts, ALL currencies, date range filter');
  console.log('2. General Ledger: ALL accounts, ALL currencies, date range filter');
  console.log('3. Balance Sheet: Balance Sheet accounts ONLY, currency filter, date range filter');
  console.log('4. Cash Flow: Cash accounts ONLY, currency filter, date range filter');
  console.log('');

  if (results.differences.length > 0) {
    console.log('⚠️  Differences Found:');
    results.differences.forEach(diff => {
      console.log(`   - ${diff.comparison}: ${diff.difference.toFixed(2)} (${diff.percentDiff.toFixed(2)}%)`);
    });
  } else {
    console.log('✅ No significant differences found');
  }

  console.log('\n✅ Test completed');
}

testDateRangeComparison().catch(console.error);

