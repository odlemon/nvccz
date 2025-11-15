const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testReportsIndividually() {
  let token = '';

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 TESTING REPORTS ONE BY ONE');
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
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    return;
  }

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
      console.log(`💱 Using currency: ${defaultCurrency.code} (${defaultCurrency.name})\n`);
    }
  } catch (error) {
    console.error('⚠️  Could not get currencies:', error.message);
  }

  const today = new Date();
  const asOfDate = today.toISOString().split('T')[0];
  const yearStart = new Date(today.getFullYear(), 0, 1).toISOString().split('T')[0];
  const yearEnd = new Date(today.getFullYear(), 11, 31).toISOString().split('T')[0];

  console.log(`📅 Date Range:`);
  console.log(`   As of Date: ${asOfDate}`);
  console.log(`   Year Range: ${yearStart} to ${yearEnd}\n`);

  // Test 1: Trial Balance
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 TEST 1: TRIAL BALANCE');
  console.log('═══════════════════════════════════════════════════════════\n');
  try {
    const trialBalanceRes = await axios.get(
      `${BASE_URL}/api/accounting/trial-balance`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { date: asOfDate },
        timeout: 30000
      }
    );

    const trialBalance = trialBalanceRes.data.data || trialBalanceRes.data;
    const totals = trialBalance.totals || {};
    const totalDebits = parseFloat(totals.totalDebits || trialBalance.totalDebits || 0);
    const totalCredits = parseFloat(totals.totalCredits || trialBalance.totalCredits || 0);

    console.log(`✅ Trial Balance retrieved`);
    console.log(`   Total Debits: ${totalDebits.toFixed(2)}`);
    console.log(`   Total Credits: ${totalCredits.toFixed(2)}`);
    console.log(`   Difference: ${Math.abs(totalDebits - totalCredits).toFixed(2)}`);
    console.log(`   Accounts: ${trialBalance.accounts?.length || 0}\n`);
  } catch (error) {
    console.error('❌ Trial Balance Error:');
    console.error('   Message:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.code) {
      console.error('   Code:', error.code);
    }
    console.log('');
  }

  // Test 2: Balance Sheet
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📊 TEST 2: BALANCE SHEET');
  console.log('═══════════════════════════════════════════════════════════\n');
  try {
    const balanceSheetRes = await axios.get(
      `${BASE_URL}/api/accounting/balance-sheet`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          asOfDate: asOfDate,
          currencyId: currencyId
        },
        timeout: 60000
      }
    );

    const balanceSheet = balanceSheetRes.data.data || balanceSheetRes.data;
    const totalAssets = parseFloat(balanceSheet.assets?.totalAssets || 0);
    const totalLiabilities = parseFloat(balanceSheet.liabilities?.totalLiabilities || 0);
    const equityTotal = parseFloat(balanceSheet.equity?.total || 0);
    const retainedEarnings = parseFloat(balanceSheet.equity?.retainedEarnings || 0);
    const totalEquity = equityTotal + retainedEarnings;

    console.log(`✅ Balance Sheet retrieved`);
    console.log(`   Total Assets: ${totalAssets.toFixed(2)}`);
    console.log(`   Total Liabilities: ${totalLiabilities.toFixed(2)}`);
    console.log(`   Total Equity: ${totalEquity.toFixed(2)}`);
    console.log(`   Liabilities + Equity: ${(totalLiabilities + totalEquity).toFixed(2)}`);
    console.log(`   Difference: ${Math.abs(totalAssets - (totalLiabilities + totalEquity)).toFixed(2)}`);
    console.log(`   Cash & Cash Equivalents: ${parseFloat(balanceSheet.assets?.cashAndCashEquivalents || 0).toFixed(2)}\n`);
  } catch (error) {
    console.error('❌ Balance Sheet Error:');
    console.error('   Message:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.code) {
      console.error('   Code:', error.code);
    }
    if (error.stack) {
      console.error('   Stack:', error.stack.split('\n').slice(0, 5).join('\n'));
    }
    console.log('');
  }

  // Test 3: Cash Flow Statement
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('💰 TEST 3: CASH FLOW STATEMENT');
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
        timeout: 60000
      }
    );

    const cashFlow = cashFlowRes.data.data || cashFlowRes.data;
    const beginningCash = parseFloat(cashFlow.beginningCashBalance || cashFlow.beginningCash || 0);
    const endingCash = parseFloat(cashFlow.endingCashBalance || cashFlow.endingCash || 0);
    const netCashFlow = parseFloat(cashFlow.netCashFlow || 0);

    console.log(`✅ Cash Flow Statement retrieved`);
    console.log(`   Beginning Cash: ${beginningCash.toFixed(2)}`);
    console.log(`   Ending Cash: ${endingCash.toFixed(2)}`);
    console.log(`   Net Cash Flow: ${netCashFlow.toFixed(2)}`);
    console.log(`   Cash & Cash Equivalents: ${endingCash.toFixed(2)}\n`);
  } catch (error) {
    console.error('❌ Cash Flow Error:');
    console.error('   Message:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.code) {
      console.error('   Code:', error.code);
    }
    console.log('');
  }

  // Test 4: General Ledger Detail (single account)
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('📋 TEST 4: GENERAL LEDGER DETAIL (Sample Account)');
  console.log('═══════════════════════════════════════════════════════════\n');
  try {
    // Get a cash account
    const accountsRes = await axios.get(
      `${BASE_URL}/api/accounting/chart-of-accounts`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: { limit: 10 }
      }
    );

    const accounts = accountsRes.data.data || accountsRes.data || [];
    const cashAccount = accounts.find(a => 
      a.accountName.toLowerCase().includes('cash') || 
      a.accountNo === '1000'
    ) || accounts[0];

    if (cashAccount) {
      console.log(`Testing account: ${cashAccount.accountNo} - ${cashAccount.accountName}\n`);
      
      const glRes = await axios.get(
        `${BASE_URL}/api/accounting/gl-ledger-detail`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            accountNo: cashAccount.accountNo,
            startDate: yearStart,
            endDate: yearEnd
          },
          timeout: 30000
        }
      );

      const glData = glRes.data.data || glRes.data;
      if (glData.summary) {
        console.log(`✅ GL Detail retrieved`);
        console.log(`   Total Debits: ${parseFloat(glData.summary.totalDebits || 0).toFixed(2)}`);
        console.log(`   Total Credits: ${parseFloat(glData.summary.totalCredits || 0).toFixed(2)}`);
        console.log(`   Net Change: ${parseFloat(glData.summary.netChange || 0).toFixed(2)}`);
        if (glData.account) {
          console.log(`   Opening Balance: ${parseFloat(glData.account.openingBalance || 0).toFixed(2)}`);
          console.log(`   Closing Balance: ${parseFloat(glData.account.closingBalance || 0).toFixed(2)}`);
        }
        console.log(`   Transactions: ${glData.transactions?.length || 0}\n`);
      }
    }
  } catch (error) {
    console.error('❌ GL Detail Error:');
    console.error('   Message:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.code) {
      console.error('   Code:', error.code);
    }
    console.log('');
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✅ ALL TESTS COMPLETED');
  console.log('═══════════════════════════════════════════════════════════\n');
}

testReportsIndividually().catch(error => {
  console.error('\n❌ Fatal error:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});

