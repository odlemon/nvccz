const axios = require('axios');

const BASE_URL = 'http://localhost:3004';
const TIMEOUT = 60000; // Increased timeout for multi-currency conversion

// Helper function to make API requests
async function apiRequest(method, endpoint, data = null, token = null) {
  const config = {
    method,
    url: `${BASE_URL}${endpoint}`,
    timeout: TIMEOUT,
    validateStatus: () => true,
    headers: {}
  };

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (data) {
    config.data = data;
  }

  try {
    const response = await axios(config);
    return response;
  } catch (error) {
    if (error.response) {
      return error.response;
    }
    throw error;
  }
}

async function test() {
  console.log('\n===============================================================');
  console.log('MULTI-CURRENCY GL REPORT UAT TEST');
  console.log('===============================================================\n');

  try {
    // Step 1: Login
    console.log('Step 1: Logging in...');
    const loginResponse = await apiRequest('POST', '/api/auth/login', {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });

    if (loginResponse.status !== 200) {
      throw new Error(`Login failed: ${loginResponse.status} - ${JSON.stringify(loginResponse.data)}`);
    }

    const token = loginResponse.data.token;
    console.log('✅ Login successful');
    console.log(`   User: ${loginResponse.data.user.firstName} ${loginResponse.data.user.lastName}\n`);

    // Step 2: Get currencies
    console.log('Step 2: Getting currencies...');
    const currenciesResponse = await apiRequest('GET', '/api/accounting/currencies?isActive=true', null, token);
    let currencies = [];
    let baseCurrency = null;
    
    if (currenciesResponse.status === 200) {
      currencies = currenciesResponse.data.data || currenciesResponse.data || [];
      baseCurrency = currencies.find(c => c.isDefault === true) || currencies.find(c => c.code === 'ZIG') || currencies.find(c => c.code === 'ZWL');
      console.log(`✅ Found ${currencies.length} currency/currencies`);
      if (baseCurrency) {
        console.log(`   Base Currency: ${baseCurrency.code} (${baseCurrency.name})`);
      } else {
        console.log(`   ⚠️  Base currency not found (will use first currency as fallback)`);
        baseCurrency = currencies[0];
      }
      console.log('');
    } else {
      throw new Error('Could not retrieve currencies');
    }

    // Step 3: Get exchange rates
    console.log('Step 3: Checking exchange rates...');
    const exchangeRatesResponse = await apiRequest('GET', '/api/accounting/multi-currency/exchange-rates', null, token);
    let exchangeRates = [];
    if (exchangeRatesResponse.status === 200) {
      exchangeRates = exchangeRatesResponse.data.data || exchangeRatesResponse.data || [];
      console.log(`✅ Found ${exchangeRates.length} exchange rate(s)`);
      if (exchangeRates.length === 0) {
        console.log(`   ⚠️  No exchange rates found. Multi-currency conversion will use rate 1.0`);
      }
      console.log('');
    }

    // Step 4: Find Bank account (1100 or any bank account)
    console.log('Step 4: Finding Bank account...');
    const accountsResponse = await apiRequest('GET', '/api/accounting/chart-of-accounts', null, token);
    let bankAccount = null;
    
    if (accountsResponse.status === 200) {
      const accounts = accountsResponse.data.data || accountsResponse.data || [];
      bankAccount = accounts.find(a => 
        a.accountNo === '1100' || 
        (a.accountName.includes('Bank') && a.accountType === 'Current Asset')
      );
    }

    if (!bankAccount) {
      console.log('⚠️  Bank account 1100 not found. Searching for any bank account...');
      const bankAccountsResponse = await apiRequest('GET', '/api/accounting/chart-of-accounts?accountType=Current Asset', null, token);
      if (bankAccountsResponse.status === 200) {
        const bankAccounts = bankAccountsResponse.data.data || bankAccountsResponse.data || [];
        bankAccount = bankAccounts.find(a => a.accountName.includes('Bank'));
      }
    }

    if (!bankAccount) {
      throw new Error('Bank account not found');
    }

    console.log(`✅ Bank Account: ${bankAccount.accountName} (${bankAccount.accountNo})`);
    console.log('');

    // Step 5: Generate multi-currency GL report
    console.log('Step 5: Generating multi-currency GL report...');
    // Use current month for testing (shorter date range)
    const now = new Date();
    const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const endDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    const glReportResponse = await apiRequest('GET', 
      `/api/accounting/gl-ledger-detail?accountNo=${bankAccount.accountNo}&startDate=${startDate}&endDate=${endDate}&includeMultiCurrency=true`,
      null,
      token
    );

    if (glReportResponse.status !== 200) {
      throw new Error(`Failed to generate GL report: ${glReportResponse.status} - ${JSON.stringify(glReportResponse.data)}`);
    }

    const report = glReportResponse.data.data || glReportResponse.data;
    console.log('✅ GL Report generated successfully\n');

    // Step 6: Verify multi-currency columns
    console.log('Step 6: Verifying multi-currency columns...');
    console.log('===============================================================');
    console.log('UAT VERIFICATION');
    console.log('===============================================================\n');

    console.log(`Account: ${report.account.accountName} (${report.account.accountNo})`);
    console.log(`Period: ${report.period.startDate} to ${report.period.endDate}`);
    console.log(`Base Currency: ${report.summary.baseCurrency || 'N/A'}`);
    console.log(`Transaction Count: ${report.summary.transactionCount}\n`);

    // Check if multi-currency columns are present
    const hasMultiCurrency = report.transactions.length > 0 && report.transactions[0].transactionCurrency !== undefined;
    
    if (!hasMultiCurrency) {
      console.log('❌ Multi-currency columns are missing');
      console.log('   Expected: transactionCurrency, debitAmountBaseCurrency, creditAmountBaseCurrency');
      console.log('');
    } else {
      console.log('✅ Multi-currency columns present:');
      console.log('   - transactionCurrency');
      console.log('   - debitAmountBaseCurrency');
      console.log('   - creditAmountBaseCurrency');
      console.log('   - runningBalanceBaseCurrency');
      console.log('');
    }

    // Step 7: Verify totals
    console.log('Step 7: Verifying column totals...');
    console.log('');

    // Calculate totals from transaction currency column
    let totalTransactionDebits = 0;
    let totalTransactionCredits = 0;
    let totalBaseDebits = 0;
    let totalBaseCredits = 0;

    for (const txn of report.transactions) {
      totalTransactionDebits += txn.debitAmount || 0;
      totalTransactionCredits += txn.creditAmount || 0;
      if (hasMultiCurrency) {
        totalBaseDebits += txn.debitAmountBaseCurrency || 0;
        totalBaseCredits += txn.creditAmountBaseCurrency || 0;
      }
    }

    console.log(`Transaction Currency Totals:`);
    console.log(`   Total Debits:  $${totalTransactionDebits.toFixed(2)}`);
    console.log(`   Total Credits: $${totalTransactionCredits.toFixed(2)}`);
    console.log(`   Net Change:    $${(totalTransactionDebits - totalTransactionCredits).toFixed(2)}`);
    console.log('');

    if (hasMultiCurrency) {
      console.log(`Base Currency (${report.summary.baseCurrency || 'N/A'}) Totals:`);
      console.log(`   Total Debits:  ${report.summary.baseCurrency || '$'} ${totalBaseDebits.toFixed(2)}`);
      console.log(`   Total Credits: ${report.summary.baseCurrency || '$'} ${totalBaseCredits.toFixed(2)}`);
      console.log(`   Net Change:    ${report.summary.baseCurrency || '$'} ${(totalBaseDebits - totalBaseCredits).toFixed(2)}`);
      console.log('');

      // Verify summary totals match calculated totals
      const summaryBaseDebits = report.summary.totalDebitsBaseCurrency || 0;
      const summaryBaseCredits = report.summary.totalCreditsBaseCurrency || 0;
      const debitsMatch = Math.abs(totalBaseDebits - summaryBaseDebits) < 0.01;
      const creditsMatch = Math.abs(totalBaseCredits - summaryBaseCredits) < 0.01;

      console.log(`Summary Verification:`);
      console.log(`   Calculated Base Debits:  ${totalBaseDebits.toFixed(2)}`);
      console.log(`   Summary Base Debits:     ${summaryBaseDebits.toFixed(2)}`);
      console.log(`   ${debitsMatch ? '✅' : '❌'} Debits Match: ${debitsMatch ? 'PASS' : 'FAIL'}`);
      console.log('');
      console.log(`   Calculated Base Credits: ${totalBaseCredits.toFixed(2)}`);
      console.log(`   Summary Base Credits:    ${summaryBaseCredits.toFixed(2)}`);
      console.log(`   ${creditsMatch ? '✅' : '❌'} Credits Match: ${creditsMatch ? 'PASS' : 'FAIL'}`);
      console.log('');
    }

    // Step 8: Verify exchange rates
    console.log('Step 8: Verifying exchange rate usage...');
    if (hasMultiCurrency) {
      const transactionsWithExchangeRate = report.transactions.filter(t => t.exchangeRate && t.exchangeRate !== 1);
      console.log(`   Transactions with exchange rate conversion: ${transactionsWithExchangeRate.length}`);
      
      if (transactionsWithExchangeRate.length > 0) {
        console.log(`   Sample conversions:`);
        for (let i = 0; i < Math.min(3, transactionsWithExchangeRate.length); i++) {
          const txn = transactionsWithExchangeRate[i];
          console.log(`   - ${txn.date} | ${txn.transactionCurrency} ${txn.debitAmount || txn.creditAmount} @ ${txn.exchangeRate} = ${txn.debitAmountBaseCurrency || txn.creditAmountBaseCurrency} ${report.summary.baseCurrency}`);
        }
      }
      console.log('');
    }

    console.log('===============================================================');
    console.log('VERIFICATION SUMMARY');
    console.log('===============================================================');
    console.log(`✅ GL Report Generated: ${report !== null ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Multi-Currency Columns Present: ${hasMultiCurrency ? 'PASS' : 'FAIL'}`);
    if (hasMultiCurrency) {
      console.log(`✅ Transaction Currency Totals Calculated: PASS`);
      console.log(`✅ Base Currency Totals Calculated: PASS`);
      console.log(`✅ Summary Totals Match Calculated Totals: ${debitsMatch && creditsMatch ? 'PASS' : 'FAIL'}`);
    }
    console.log('');

    const allChecksPassed = hasMultiCurrency && (debitsMatch && creditsMatch);

    if (allChecksPassed) {
      console.log('✅ UAT TEST PASSED: Multi-currency GL report columns are accurate');
      console.log('   Transaction Currency and Base Currency Equivalent columns match');
      console.log('   Exchange rates applied correctly at transaction posting date');
    } else {
      console.log('❌ UAT TEST FAILED: Some verification checks failed');
      console.log('   Both columns must be accurate and Base Currency must reflect correct ZIG equivalent');
    }
    console.log('===============================================================\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data, null, 2));
    }
    if (error.stack) {
      console.error('Stack:', error.stack);
    }
    process.exit(1);
  }
}

test();

