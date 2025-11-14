const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testLiabilitiesCleared() {
  let token = '';

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 UAT TEST: Liabilities Cleared for Remittance');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('Test Scenario:');
  console.log('  Locate the Liabilities section');
  console.log('  PAYE Payable (2150) closing balance should be ZWL 0.00');
  console.log('  Net Wages Payable (2250) closing balance should be ZWL 0.00');
  console.log('  Expected: Payments in Phase 2 successfully cleared the liabilities\n');

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

  // Step 2: Get currencies - need ZWL
  console.log('💱 Step 2: Getting ZWL currency...');
  try {
    const currenciesRes = await axios.get(`${BASE_URL}/api/accounting/currencies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const currencies = currenciesRes.data.data || [];
    
    const zwlCurrency = currencies.find(c => c.code === 'ZWL' || c.code === 'ZIG');
    
    if (!zwlCurrency) {
      console.log('❌ ZWL currency not found. Available currencies:');
      currencies.forEach(c => console.log(`   - ${c.code} (${c.name})`));
      return;
    }

    console.log(`✅ Found ZWL currency: ${zwlCurrency.code} (${zwlCurrency.name})\n`);
    
    // Step 3: Generate Balance Sheet as of today in ZWL
    const today = new Date();
    const asOfDate = today.toISOString().split('T')[0];
    
    console.log('📊 Step 3: Generating Balance Sheet as of today (ZWL)...');
    console.log(`   As of Date: ${asOfDate}`);
    console.log(`   Currency: ZWL\n`);

    const balanceSheetRes = await axios.get(
      `${BASE_URL}/api/accounting/balance-sheet`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          asOfDate: asOfDate,
          currencyId: zwlCurrency.id
        }
      }
    );

    const balanceSheet = balanceSheetRes.data.data;

    console.log('✅ Balance Sheet generated successfully!\n');

    // Step 4: Locate Liabilities section
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 Step 4: Locating Liabilities Section');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (!balanceSheet.liabilities) {
      console.log('❌ Liabilities section not found in balance sheet');
      return;
    }

    const liabilities = balanceSheet.liabilities;
    const allLiabilityAccounts = [
      ...(liabilities.currentLiabilities?.accounts || []),
      ...(liabilities.longTermLiabilities?.accounts || []),
      ...(liabilities.nonCurrentLiabilities?.accounts || [])
    ];

    console.log(`Found ${allLiabilityAccounts.length} liability account(s)\n`);

    // Step 5: Find PAYE Payable (2150) and Net Wages Payable (2250)
    console.log('🔍 Step 5: Searching for specific liability accounts...\n');

    const payePayable = allLiabilityAccounts.find(acc => acc.accountNo === '2150');
    const netWagesPayable = allLiabilityAccounts.find(acc => acc.accountNo === '2250');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('💰 LIABILITY ACCOUNTS - CLOSING BALANCES');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Check PAYE Payable (2150)
    if (payePayable) {
      const balance = parseFloat(payePayable.balance || 0);
      console.log(`PAYE Payable (2150):`);
      console.log(`   Account Name: ${payePayable.accountName}`);
      console.log(`   Closing Balance: ZWL ${balance.toFixed(2)}`);
      console.log(`   Expected: ZWL 0.00`);
      if (Math.abs(balance) < 0.01) {
        console.log(`   ✅ PASS: Balance is ZWL 0.00\n`);
      } else {
        console.log(`   ❌ FAIL: Balance is NOT ZWL 0.00\n`);
      }
    } else {
      console.log(`PAYE Payable (2150):`);
      console.log(`   ⚠️  Account not found in balance sheet`);
      console.log(`   (Account may not exist or have no transactions)\n`);
    }

    // Check Net Wages Payable (2250)
    if (netWagesPayable) {
      const balance = parseFloat(netWagesPayable.balance || 0);
      console.log(`Net Wages Payable (2250):`);
      console.log(`   Account Name: ${netWagesPayable.accountName}`);
      console.log(`   Closing Balance: ZWL ${balance.toFixed(2)}`);
      console.log(`   Expected: ZWL 0.00`);
      if (Math.abs(balance) < 0.01) {
        console.log(`   ✅ PASS: Balance is ZWL 0.00\n`);
      } else {
        console.log(`   ❌ FAIL: Balance is NOT ZWL 0.00\n`);
      }
    } else {
      console.log(`Net Wages Payable (2250):`);
      console.log(`   ⚠️  Account not found in balance sheet`);
      console.log(`   (Account may not exist or have no transactions)\n`);
    }

    // Step 6: Display all liability accounts for reference
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 ALL LIABILITY ACCOUNTS (for reference)');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (allLiabilityAccounts.length === 0) {
      console.log('   No liability accounts found in balance sheet\n');
    } else {
      allLiabilityAccounts.forEach((acc, index) => {
        const balance = parseFloat(acc.balance || 0);
        console.log(`${index + 1}. ${acc.accountNo} - ${acc.accountName}`);
        console.log(`   Balance: ZWL ${balance.toFixed(2)}`);
        if (acc.accountNo === '2150' || acc.accountNo === '2250') {
          console.log(`   ⭐ Target Account`);
        }
        console.log('');
      });
    }

    // Step 7: Final verification
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 TEST RESULT SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    const payeBalance = payePayable ? parseFloat(payePayable.balance || 0) : null;
    const netWagesBalance = netWagesPayable ? parseFloat(netWagesPayable.balance || 0) : null;

    let testPassed = true;
    let issues = [];

    if (payePayable) {
      if (Math.abs(payeBalance) < 0.01) {
        console.log('✅ PAYE Payable (2150): ZWL 0.00 - PASS');
      } else {
        console.log(`❌ PAYE Payable (2150): ZWL ${payeBalance.toFixed(2)} - FAIL`);
        testPassed = false;
        issues.push(`PAYE Payable (2150) has balance of ZWL ${payeBalance.toFixed(2)}, expected ZWL 0.00`);
      }
    } else {
      console.log('⚠️  PAYE Payable (2150): Account not found');
      issues.push('PAYE Payable (2150) account not found in balance sheet');
    }

    if (netWagesPayable) {
      if (Math.abs(netWagesBalance) < 0.01) {
        console.log('✅ Net Wages Payable (2250): ZWL 0.00 - PASS');
      } else {
        console.log(`❌ Net Wages Payable (2250): ZWL ${netWagesBalance.toFixed(2)} - FAIL`);
        testPassed = false;
        issues.push(`Net Wages Payable (2250) has balance of ZWL ${netWagesBalance.toFixed(2)}, expected ZWL 0.00`);
      }
    } else {
      console.log('⚠️  Net Wages Payable (2250): Account not found');
      issues.push('Net Wages Payable (2250) account not found in balance sheet');
    }

    console.log('');

    if (testPassed && payePayable && netWagesPayable) {
      console.log('✅ TEST PASSED');
      console.log('   ✅ Liabilities section located');
      console.log('   ✅ PAYE Payable (2150) closing balance is ZWL 0.00');
      console.log('   ✅ Net Wages Payable (2250) closing balance is ZWL 0.00');
      console.log('   ✅ Payments in Phase 2 successfully cleared the liabilities for remittance\n');
    } else {
      console.log('❌ TEST FAILED');
      console.log('   Issues found:');
      issues.forEach(issue => console.log(`   - ${issue}`));
      console.log('\n⚠️  ACTION REQUIRED: Investigate why liabilities are not cleared\n');
    }

    console.log('═══════════════════════════════════════════════════════════\n');

    return {
      passed: testPassed,
      payePayable: payePayable ? {
        accountNo: payePayable.accountNo,
        accountName: payePayable.accountName,
        balance: payeBalance,
        isZero: Math.abs(payeBalance) < 0.01
      } : null,
      netWagesPayable: netWagesPayable ? {
        accountNo: netWagesPayable.accountNo,
        accountName: netWagesPayable.accountName,
        balance: netWagesBalance,
        isZero: Math.abs(netWagesBalance) < 0.01
      } : null,
      issues
    };
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    }
    return {
      passed: false,
      error: error.message
    };
  }
}

testLiabilitiesCleared().then(result => {
  if (result && !result.passed) {
    process.exit(1);
  }
});

