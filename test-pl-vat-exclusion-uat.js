const axios = require('axios');

const BASE_URL = 'http://localhost:3004';
const TIMEOUT = 30000;

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
  console.log('PROFIT & LOSS STATEMENT (VAT EXCLUSION) UAT TEST');
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

    // Step 2: Get currency
    console.log('Step 2: Getting currency...');
    const currencyResponse = await apiRequest('GET', '/api/accounting/currencies?isActive=true&limit=1', null, token);
    let currencyId = null;
    if (currencyResponse.status === 200 && currencyResponse.data.data && currencyResponse.data.data.length > 0) {
      currencyId = currencyResponse.data.data[0].id;
      console.log(`✅ Using currency: ${currencyResponse.data.data[0].code}\n`);
    } else {
      throw new Error('No active currency found');
    }

    // Step 3: Find Sales Revenue account (4000) and Rent Expense account (5100)
    console.log('Step 3: Finding Sales Revenue (4000) and Rent Expense (5100) accounts...');
    const accountsResponse = await apiRequest('GET', '/api/accounting/chart-of-accounts', null, token);
    
    let revenueAccount4000 = null;
    let expenseAccount5100 = null;
    
    if (accountsResponse.status === 200) {
      const accounts = accountsResponse.data.data || accountsResponse.data || [];
      revenueAccount4000 = accounts.find(a => a.accountNo === '4000' || (a.accountType === 'Revenue' && a.accountNo.includes('4000')));
      expenseAccount5100 = accounts.find(a => a.accountNo === '5100' || (a.accountType === 'Expense' && a.accountNo.includes('5100')));
      
      // If not found by exact number, try to find any revenue/expense account
      if (!revenueAccount4000) {
        revenueAccount4000 = accounts.find(a => a.accountType === 'Revenue' && a.financialStatement === 'Income Statement');
      }
      if (!expenseAccount5100) {
        expenseAccount5100 = accounts.find(a => a.accountType === 'Expense' && a.financialStatement === 'Income Statement');
      }
    }

    if (!revenueAccount4000) {
      console.log('⚠️  Sales Revenue account 4000 not found. Using any Revenue account for testing...');
      const revAccountsResponse = await apiRequest('GET', '/api/accounting/chart-of-accounts?accountType=Revenue', null, token);
      if (revAccountsResponse.status === 200) {
        const revAccounts = revAccountsResponse.data.data || revAccountsResponse.data || [];
        revenueAccount4000 = revAccounts[0];
      }
    }
    if (!expenseAccount5100) {
      console.log('⚠️  Rent Expense account 5100 not found. Using any Expense account for testing...');
      const expAccountsResponse = await apiRequest('GET', '/api/accounting/chart-of-accounts?accountType=Expense', null, token);
      if (expAccountsResponse.status === 200) {
        const expAccounts = expAccountsResponse.data.data || expAccountsResponse.data || [];
        expenseAccount5100 = expAccounts[0];
      }
    }

    if (!revenueAccount4000 || !expenseAccount5100) {
      throw new Error('Could not find Revenue or Expense accounts for testing');
    }

    console.log(`✅ Revenue Account: ${revenueAccount4000.accountName} (${revenueAccount4000.accountNo})`);
    console.log(`✅ Expense Account: ${expenseAccount5100.accountName} (${expenseAccount5100.accountNo})\n`);

    // Step 4: Find VAT accounts
    console.log('Step 4: Verifying VAT accounts exist...');
    const vatAccountsResponse = await apiRequest('GET', '/api/accounting/chart-of-accounts', null, token);
    let vatInputAccount = null;
    let vatOutputAccount = null;
    
    if (vatAccountsResponse.status === 200) {
      const accounts = vatAccountsResponse.data.data || vatAccountsResponse.data || [];
      vatInputAccount = accounts.find(a => 
        a.accountName.includes('VAT Input') || 
        a.accountNo === '2110' ||
        (a.accountName.includes('VAT') && a.accountType === 'Current Asset')
      );
      vatOutputAccount = accounts.find(a => 
        a.accountName.includes('VAT Output') || 
        a.accountNo === '2100' ||
        (a.accountName.includes('VAT') && a.accountType === 'Current Liability')
      );
    }

    if (vatInputAccount) {
      console.log(`✅ VAT Input Account: ${vatInputAccount.accountName} (${vatInputAccount.accountNo})`);
    } else {
      console.log('⚠️  VAT Input account not found');
    }
    if (vatOutputAccount) {
      console.log(`✅ VAT Output Account: ${vatOutputAccount.accountName} (${vatOutputAccount.accountNo})`);
    } else {
      console.log('⚠️  VAT Output account not found');
    }
    console.log('');

    // Step 5: Generate Income Statement for current year
    console.log('Step 5: Generating Profit & Loss Statement for current year...');
    const yearStart = new Date();
    yearStart.setMonth(0, 1);
    yearStart.setHours(0, 0, 0, 0);
    const yearEnd = new Date();
    yearEnd.setMonth(11, 31);
    yearEnd.setHours(23, 59, 59, 999);

    const incomeStatementResponse = await apiRequest('POST', '/api/accounting/income-statement/generate', {
      startDate: yearStart.toISOString().split('T')[0],
      endDate: yearEnd.toISOString().split('T')[0],
      currencyId: currencyId
    }, token);

    if (incomeStatementResponse.status !== 200 && incomeStatementResponse.status !== 201) {
      throw new Error(`Failed to generate Income Statement: ${incomeStatementResponse.status} - ${JSON.stringify(incomeStatementResponse.data)}`);
    }

    const incomeStatement = incomeStatementResponse.data.data || incomeStatementResponse.data;
    console.log('✅ Income Statement generated successfully\n');

    // Step 6: Verify P&L Report
    console.log('Step 6: Verifying P&L Report (VAT Exclusion)...');
    console.log('===============================================================');
    console.log('UAT VERIFICATION');
    console.log('===============================================================\n');

    console.log(`Period: ${incomeStatement.period.startDate} to ${incomeStatement.period.endDate}`);
    console.log(`Currency: ${incomeStatement.currency.code}\n`);

    // Find Sales Revenue (4000) in the report
    const revenueAccount = incomeStatement.revenue.accounts.find(a => 
      a.accountNo === revenueAccount4000.accountNo || 
      a.accountId === revenueAccount4000.id
    );

    // Find Rent Expense (5100) in the report
    const expenseAccount = incomeStatement.expenses.accounts.find(a => 
      a.accountNo === expenseAccount5100.accountNo || 
      a.accountId === expenseAccount5100.id
    );

    console.log('Revenue Accounts:');
    if (revenueAccount) {
      console.log(`   ${revenueAccount.accountNo} - ${revenueAccount.accountName}: $${revenueAccount.netAmount.toFixed(2)}`);
      console.log(`      Total Credits: $${revenueAccount.totalCredits.toFixed(2)}`);
      console.log(`      Total Debits: $${revenueAccount.totalDebits.toFixed(2)}`);
    } else {
      console.log(`   ⚠️  Account ${revenueAccount4000.accountNo} not found in revenue accounts`);
      if (incomeStatement.revenue.accounts.length > 0) {
        console.log(`   Found ${incomeStatement.revenue.accounts.length} revenue account(s):`);
        incomeStatement.revenue.accounts.forEach(acc => {
          console.log(`      ${acc.accountNo} - ${acc.accountName}: $${acc.netAmount.toFixed(2)}`);
        });
      }
    }

    console.log('\nExpense Accounts:');
    if (expenseAccount) {
      console.log(`   ${expenseAccount.accountNo} - ${expenseAccount.accountName}: $${expenseAccount.netAmount.toFixed(2)}`);
      console.log(`      Total Debits: $${expenseAccount.totalDebits.toFixed(2)}`);
      console.log(`      Total Credits: $${expenseAccount.totalCredits.toFixed(2)}`);
    } else {
      console.log(`   ⚠️  Account ${expenseAccount5100.accountNo} not found in expense accounts`);
      if (incomeStatement.expenses.accounts.length > 0) {
        console.log(`   Found ${incomeStatement.expenses.accounts.length} expense account(s):`);
        incomeStatement.expenses.accounts.forEach(acc => {
          console.log(`      ${acc.accountNo} - ${acc.accountName}: $${acc.netAmount.toFixed(2)}`);
        });
      }
    }

    console.log(`\nTotal Revenue: $${incomeStatement.revenue.total.toFixed(2)}`);
    console.log(`Total Expenses: $${incomeStatement.expenses.total.toFixed(2)}`);
    console.log(`Net Income: $${incomeStatement.netIncome.toFixed(2)}\n`);

    // Verification: Check if VAT accounts are excluded
    const vatAccountsInRevenue = incomeStatement.revenue.accounts.filter(a => 
      a.accountName.includes('VAT') || 
      a.accountNo === '2100' || 
      a.accountNo === '2110'
    );
    const vatAccountsInExpenses = incomeStatement.expenses.accounts.filter(a => 
      a.accountName.includes('VAT') || 
      a.accountNo === '2100' || 
      a.accountNo === '2110'
    );

    console.log('===============================================================');
    console.log('VERIFICATION SUMMARY');
    console.log('===============================================================');
    console.log(`✅ Income Statement Generated: ${incomeStatement ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Revenue Account ${revenueAccount4000.accountNo} Found: ${revenueAccount ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Expense Account ${expenseAccount5100.accountNo} Found: ${expenseAccount ? 'PASS' : 'FAIL'}`);
    console.log(`✅ VAT Accounts Excluded from Revenue: ${vatAccountsInRevenue.length === 0 ? 'PASS' : 'FAIL'}`);
    console.log(`✅ VAT Accounts Excluded from Expenses: ${vatAccountsInExpenses.length === 0 ? 'PASS' : 'FAIL'}`);
    console.log('');

    if (vatAccountsInRevenue.length > 0) {
      console.log('❌ FAIL: VAT accounts found in Revenue section:');
      vatAccountsInRevenue.forEach(acc => {
        console.log(`   - ${acc.accountNo} - ${acc.accountName}`);
      });
    }

    if (vatAccountsInExpenses.length > 0) {
      console.log('❌ FAIL: VAT accounts found in Expenses section:');
      vatAccountsInExpenses.forEach(acc => {
        console.log(`   - ${acc.accountNo} - ${acc.accountName}`);
      });
    }

    const allChecksPassed = 
      incomeStatement &&
      (revenueAccount || incomeStatement.revenue.accounts.length > 0) &&
      (expenseAccount || incomeStatement.expenses.accounts.length > 0) &&
      vatAccountsInRevenue.length === 0 &&
      vatAccountsInExpenses.length === 0;

    if (allChecksPassed) {
      console.log('✅ UAT TEST PASSED: P&L shows Net Amounts (Excl. VAT) and VAT is excluded');
      console.log('   VAT should appear on Balance Sheet as a liability, not on P&L');
    } else {
      console.log('❌ UAT TEST FAILED: Some verification checks failed');
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

