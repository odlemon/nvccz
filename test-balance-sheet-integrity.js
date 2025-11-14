const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testBalanceSheetIntegrity() {
  let token = '';

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 UAT TEST: Balance Sheet Integrity');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('Test Scenario:');
  console.log('  Run the Balance Sheet as of today');
  console.log('  Expected: Assets = Liabilities + Equity');
  console.log('  Test Pass Criteria: Balance Sheet Integrity confirmed\n');

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

  // Step 2: Get currencies
  console.log('💱 Step 2: Getting currencies...');
  try {
    const currenciesRes = await axios.get(`${BASE_URL}/api/accounting/currencies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const currencies = currenciesRes.data.data || [];
    
    if (currencies.length === 0) {
      console.log('❌ No currencies found');
      return;
    }

    // Use default currency or first available
    const defaultCurrency = currencies.find(c => c.isDefault) || currencies[0];
    console.log(`✅ Using currency: ${defaultCurrency.code} (${defaultCurrency.name})\n`);
    
    // Step 3: Generate Balance Sheet as of today
    const today = new Date();
    const asOfDate = today.toISOString().split('T')[0];
    
    console.log('📊 Step 3: Generating Balance Sheet as of today...');
    console.log(`   As of Date: ${asOfDate}\n`);

    const balanceSheetRes = await axios.get(
      `${BASE_URL}/api/accounting/balance-sheet`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          asOfDate: asOfDate,
          currencyId: defaultCurrency.id
        }
      }
    );

    const balanceSheet = balanceSheetRes.data.data;

    console.log('✅ Balance Sheet generated successfully!\n');

    // Step 4: Extract totals
    console.log('💰 Step 4: Extracting Balance Sheet Totals...\n');

    // Extract totals from the correct structure
    const totalAssets = parseFloat(balanceSheet.assets?.totalAssets || 0);
    const totalLiabilities = parseFloat(balanceSheet.liabilities?.totalLiabilities || 0);
    // Total Equity = equity accounts + retained earnings
    const equityAccountsTotal = parseFloat(balanceSheet.equity?.total || 0);
    const retainedEarnings = parseFloat(balanceSheet.equity?.retainedEarnings || 0);
    const totalEquity = equityAccountsTotal + retainedEarnings;
    const liabilitiesPlusEquity = totalLiabilities + totalEquity;
    const difference = Math.abs(totalAssets - liabilitiesPlusEquity);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 BALANCE SHEET TOTALS');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`Total Assets:              ${totalAssets.toFixed(2)}`);
    console.log(`Total Liabilities:         ${totalLiabilities.toFixed(2)}`);
    console.log(`Total Equity:              ${totalEquity.toFixed(2)}`);
    console.log(`Liabilities + Equity:      ${liabilitiesPlusEquity.toFixed(2)}`);
    console.log(`Difference:                ${difference.toFixed(2)}\n`);

    // Step 5: Verify Balance Sheet Integrity
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Step 5: Verifying Balance Sheet Integrity...');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('Formula: Assets = Liabilities + Equity');
    console.log(`Calculation: ${totalAssets.toFixed(2)} = ${totalLiabilities.toFixed(2)} + ${totalEquity.toFixed(2)}`);
    console.log(`Result: ${totalAssets.toFixed(2)} = ${liabilitiesPlusEquity.toFixed(2)}\n`);

    const isBalanced = difference < 0.01; // Allow for small rounding differences

    if (isBalanced) {
      console.log('✅ PASS: Assets = Liabilities + Equity');
      console.log('✅ Balance Sheet Integrity confirmed');
      console.log('✅ ASSETS equal LIABILITIES + EQUITY\n');
    } else {
      console.log('❌ FAIL: Assets ≠ Liabilities + Equity');
      console.log(`❌ Difference: ${difference.toFixed(2)}`);
      console.log('❌ Balance Sheet Integrity NOT confirmed\n');
    }

    // Step 6: Display detailed breakdown
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 DETAILED BREAKDOWN');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (balanceSheet.assets) {
      console.log('ASSETS:');
      if (balanceSheet.assets.currentAssets) {
        console.log(`   Current Assets: ${parseFloat(balanceSheet.assets.currentAssets.total || 0).toFixed(2)}`);
      }
      if (balanceSheet.assets.fixedAssets) {
        console.log(`   Fixed Assets: ${parseFloat(balanceSheet.assets.fixedAssets.total || 0).toFixed(2)}`);
      }
      if (balanceSheet.assets.nonCurrentAssets) {
        console.log(`   Non-Current Assets: ${parseFloat(balanceSheet.assets.nonCurrentAssets.total || 0).toFixed(2)}`);
      }
      console.log(`   Total Assets: ${totalAssets.toFixed(2)}\n`);
    }

    if (balanceSheet.liabilities) {
      console.log('LIABILITIES:');
      if (balanceSheet.liabilities.currentLiabilities) {
        console.log(`   Current Liabilities: ${parseFloat(balanceSheet.liabilities.currentLiabilities.total || 0).toFixed(2)}`);
      }
      if (balanceSheet.liabilities.nonCurrentLiabilities) {
        console.log(`   Non-Current Liabilities: ${parseFloat(balanceSheet.liabilities.nonCurrentLiabilities.total || 0).toFixed(2)}`);
      }
      console.log(`   Total Liabilities: ${totalLiabilities.toFixed(2)}\n`);
    }

    if (balanceSheet.equity) {
      console.log('EQUITY:');
      console.log(`   Equity Accounts: ${equityAccountsTotal.toFixed(2)}`);
      console.log(`   Retained Earnings: ${retainedEarnings.toFixed(2)}`);
      console.log(`   Total Equity: ${totalEquity.toFixed(2)}\n`);
    }

    // Step 7: Final verification
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 TEST RESULT SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (isBalanced) {
      console.log('✅ TEST PASSED');
      console.log('   ✅ Balance Sheet generated successfully');
      console.log('   ✅ Assets = Liabilities + Equity');
      console.log('   ✅ Balance Sheet Integrity confirmed');
      console.log('   ✅ ASSETS equal LIABILITIES + EQUITY\n');
    } else {
      console.log('❌ TEST FAILED');
      console.log('   ✅ Balance Sheet generated successfully');
      console.log('   ❌ Assets ≠ Liabilities + Equity');
      console.log(`   ❌ Difference: ${difference.toFixed(2)}`);
      console.log('   ❌ Balance Sheet Integrity NOT confirmed');
      console.log('   ❌ ASSETS do NOT equal LIABILITIES + EQUITY\n');
      console.log('⚠️  ACTION REQUIRED: Fix balance sheet calculation\n');
    }

    console.log('═══════════════════════════════════════════════════════════\n');

    // Return test result
    return {
      passed: isBalanced,
      totalAssets,
      totalLiabilities,
      totalEquity,
      liabilitiesPlusEquity,
      difference,
      balanceSheet
    };

  } catch (error) {
    console.error('❌ Error generating Balance Sheet:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    }
    return {
      passed: false,
      error: error.message
    };
  }
}

testBalanceSheetIntegrity().then(result => {
  if (result && !result.passed) {
    process.exit(1);
  }
});

