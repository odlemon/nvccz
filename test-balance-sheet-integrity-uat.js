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
  console.log('BALANCE SHEET INTEGRITY UAT TEST');
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

    // Step 3: Find control accounts
    console.log('Step 3: Finding control accounts (Bank 1100, Debtors 1300, Creditors 2000)...');
    const accountsResponse = await apiRequest('GET', '/api/accounting/chart-of-accounts', null, token);
    
    let bankAccount = null;
    let debtorsAccount = null;
    let creditorsAccount = null;
    
    if (accountsResponse.status === 200) {
      const accounts = accountsResponse.data.data || accountsResponse.data || [];
      bankAccount = accounts.find(a => 
        a.accountNo === '1100' || 
        (a.accountName.includes('Bank') && a.accountType === 'Current Asset')
      );
      debtorsAccount = accounts.find(a => 
        a.accountNo === '1300' || 
        a.accountName.includes('Debtors Control') ||
        (a.accountName.includes('Accounts Receivable') && a.accountType === 'Current Asset')
      );
      creditorsAccount = accounts.find(a => 
        a.accountNo === '2000' || 
        a.accountName.includes('Creditors Control') ||
        (a.accountName.includes('Accounts Payable') && a.accountType === 'Current Liability')
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

    if (!debtorsAccount) {
      console.log('⚠️  Debtors Control account 1300 not found. Searching...');
    }

    if (!creditorsAccount) {
      console.log('⚠️  Creditors Control account 2000 not found. Searching...');
    }

    if (bankAccount) {
      console.log(`✅ Bank Account: ${bankAccount.accountName} (${bankAccount.accountNo})`);
    } else {
      console.log('⚠️  Bank account not found');
    }
    if (debtorsAccount) {
      console.log(`✅ Debtors Control: ${debtorsAccount.accountName} (${debtorsAccount.accountNo})`);
    } else {
      console.log('⚠️  Debtors Control account not found');
    }
    if (creditorsAccount) {
      console.log(`✅ Creditors Control: ${creditorsAccount.accountName} (${creditorsAccount.accountNo})`);
    } else {
      console.log('⚠️  Creditors Control account not found');
    }
    console.log('');

    // Step 4: Get Cashbook sub-ledger totals
    console.log('Step 4: Getting Cashbook sub-ledger totals...');
    let cashbookTotal = 0;
    try {
      const cashbookResponse = await apiRequest('GET', '/api/cashbook/transactions?status=POSTED&limit=1000', null, token);
      if (cashbookResponse.status === 200) {
        const entries = cashbookResponse.data.data || cashbookResponse.data || [];
        // Calculate net cashbook balance (receipts - payments)
        cashbookTotal = entries.reduce((sum, entry) => {
          if (entry.transactionType === 'RECEIPT') {
            return sum + Number(entry.amount || entry.totalAmount || 0);
          } else if (entry.transactionType === 'PAYMENT') {
            return sum - Number(entry.amount || entry.totalAmount || 0);
          }
          return sum;
        }, 0);
        console.log(`   Cashbook Sub-ledger Total: $${cashbookTotal.toFixed(2)}\n`);
      }
    } catch (error) {
      console.log('   ⚠️  Could not retrieve cashbook totals');
    }

    // Step 5: Get Accounts Receivable sub-ledger totals
    console.log('Step 5: Getting Accounts Receivable sub-ledger totals...');
    let arTotal = 0;
    try {
      const invoicesResponse = await apiRequest('GET', '/api/accounting/invoices?status=SENT,PARTIALLY_PAID,OVERDUE&limit=1000', null, token);
      if (invoicesResponse.status === 200) {
        const invoices = invoicesResponse.data.data || invoicesResponse.data || [];
        arTotal = invoices.reduce((sum, inv) => {
          return sum + Number(inv.outstandingAmount || 0);
        }, 0);
        console.log(`   A/R Sub-ledger Total: $${arTotal.toFixed(2)}\n`);
      }
    } catch (error) {
      console.log('   ⚠️  Could not retrieve A/R totals');
    }

    // Step 6: Get Accounts Payable sub-ledger totals
    console.log('Step 6: Getting Accounts Payable sub-ledger totals...');
    let apTotal = 0;
    try {
      // Get invoices with vendorId (creditor bills)
      const apResponse = await apiRequest('GET', '/api/accounting/invoices?limit=1000', null, token);
      if (apResponse.status === 200) {
        const invoices = apResponse.data.data || apResponse.data || [];
        const creditorBills = invoices.filter(inv => inv.vendorId && ['SENT', 'PARTIALLY_PAID', 'OVERDUE'].includes(inv.status));
        apTotal = creditorBills.reduce((sum, bill) => {
          return sum + Number(bill.outstandingAmount || 0);
        }, 0);
        console.log(`   A/P Sub-ledger Total: $${apTotal.toFixed(2)}\n`);
      }
    } catch (error) {
      console.log('   ⚠️  Could not retrieve A/P totals');
    }

    // Step 7: Generate Balance Sheet
    console.log('Step 7: Generating Balance Sheet for current date...');
    const asOfDate = new Date();
    const balanceSheetResponse = await apiRequest('POST', '/api/accounting/balance-sheet/generate', {
      asOfDate: asOfDate.toISOString().split('T')[0],
      currencyId: currencyId
    }, token);

    if (balanceSheetResponse.status !== 200 && balanceSheetResponse.status !== 201) {
      throw new Error(`Failed to generate Balance Sheet: ${balanceSheetResponse.status} - ${JSON.stringify(balanceSheetResponse.data)}`);
    }

    const balanceSheet = balanceSheetResponse.data.data || balanceSheetResponse.data;
    console.log('✅ Balance Sheet generated successfully\n');

    // Step 8: Verify Balance Sheet Integrity
    console.log('Step 8: Verifying Balance Sheet Integrity...');
    console.log('===============================================================');
    console.log('UAT VERIFICATION');
    console.log('===============================================================\n');

    console.log(`As of Date: ${balanceSheet.asOfDate}`);
    console.log(`Currency: ${balanceSheet.currency}\n`);

    // Find control account balances in Balance Sheet
    let bankBalance = null;
    let debtorsBalance = null;
    let creditorsBalance = null;

    // Search in current assets
    for (const asset of balanceSheet.assets.currentAssets.accounts || []) {
      if (bankAccount && (asset.accountNo === bankAccount.accountNo || asset.accountName === bankAccount.accountName)) {
        bankBalance = asset.balance;
      }
      if (debtorsAccount && (asset.accountNo === debtorsAccount.accountNo || asset.accountName === debtorsAccount.accountName)) {
        debtorsBalance = asset.balance;
      }
    }

    // Search in current liabilities
    for (const liability of balanceSheet.liabilities.currentLiabilities.accounts || []) {
      if (creditorsAccount && (liability.accountNo === creditorsAccount.accountNo || liability.accountName === creditorsAccount.accountName)) {
        creditorsBalance = liability.balance;
      }
    }

    const verificationResults = {
      balanceSheetGenerated: balanceSheet !== null,
      bankAccountFound: bankAccount !== null,
      debtorsAccountFound: debtorsAccount !== null,
      creditorsAccountFound: creditorsAccount !== null,
      bankBalanceMatches: false,
      debtorsBalanceMatches: false,
      creditorsBalanceMatches: false
    };

    // Verify Bank (1100) balance
    if (bankAccount && bankBalance !== null) {
      console.log(`💰 Bank Account (${bankAccount.accountNo} - ${bankAccount.accountName}):`);
      console.log(`   GL Balance:                $${bankBalance.toFixed(2)}`);
      console.log(`   Cashbook Sub-ledger Total: $${cashbookTotal.toFixed(2)}`);
      const bankDifference = Math.abs(bankBalance - cashbookTotal);
      if (bankDifference < 0.01) {
        console.log(`   ✅ MATCH: Balances reconcile\n`);
        verificationResults.bankBalanceMatches = true;
      } else {
        console.log(`   ⚠️  DIFFERENCE: $${bankDifference.toFixed(2)}\n`);
      }
    } else {
      console.log('⚠️  Bank account balance not found in Balance Sheet\n');
    }

    // Verify Debtors Control (1300) balance
    if (debtorsAccount && debtorsBalance !== null) {
      console.log(`📊 Debtors Control (${debtorsAccount.accountNo} - ${debtorsAccount.accountName}):`);
      console.log(`   GL Balance:                $${debtorsBalance.toFixed(2)}`);
      console.log(`   A/R Sub-ledger Total:      $${arTotal.toFixed(2)}`);
      const arDifference = Math.abs(debtorsBalance - arTotal);
      if (arDifference < 0.01) {
        console.log(`   ✅ MATCH: Balances reconcile\n`);
        verificationResults.debtorsBalanceMatches = true;
      } else {
        console.log(`   ⚠️  DIFFERENCE: $${arDifference.toFixed(2)}\n`);
      }
    } else {
      console.log('⚠️  Debtors Control balance not found in Balance Sheet\n');
    }

    // Verify Creditors Control (2000) balance
    if (creditorsAccount && creditorsBalance !== null) {
      console.log(`💳 Creditors Control (${creditorsAccount.accountNo} - ${creditorsAccount.accountName}):`);
      console.log(`   GL Balance:                $${creditorsBalance.toFixed(2)}`);
      console.log(`   A/P Sub-ledger Total:      $${apTotal.toFixed(2)}`);
      const apDifference = Math.abs(creditorsBalance - apTotal);
      if (apDifference < 0.01) {
        console.log(`   ✅ MATCH: Balances reconcile\n`);
        verificationResults.creditorsBalanceMatches = true;
      } else {
        console.log(`   ⚠️  DIFFERENCE: $${apDifference.toFixed(2)}\n`);
      }
    } else {
      console.log('⚠️  Creditors Control balance not found in Balance Sheet\n');
    }

    console.log('===============================================================');
    console.log('VERIFICATION SUMMARY');
    console.log('===============================================================');
    console.log(`✅ Balance Sheet Generated: ${verificationResults.balanceSheetGenerated ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Bank Account Found: ${verificationResults.bankAccountFound ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Debtors Control Found: ${verificationResults.debtorsAccountFound ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Creditors Control Found: ${verificationResults.creditorsAccountFound ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Bank Balance Matches Sub-ledger: ${verificationResults.bankBalanceMatches ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Debtors Balance Matches Sub-ledger: ${verificationResults.debtorsBalanceMatches ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Creditors Balance Matches Sub-ledger: ${verificationResults.creditorsBalanceMatches ? 'PASS' : 'FAIL'}`);
    console.log('');

    const allChecksPassed = 
      verificationResults.balanceSheetGenerated &&
      verificationResults.bankAccountFound &&
      verificationResults.debtorsAccountFound &&
      verificationResults.creditorsAccountFound &&
      verificationResults.bankBalanceMatches &&
      verificationResults.debtorsBalanceMatches &&
      verificationResults.creditorsBalanceMatches;

    if (allChecksPassed) {
      console.log('✅ UAT TEST PASSED: Balance Sheet balances match sub-ledger totals');
      console.log('   All control accounts (Bank, Debtors, Creditors) reconcile correctly');
    } else {
      console.log('❌ UAT TEST FAILED: Some verification checks failed');
      console.log('   Balance Sheet balances must match sub-ledger totals');
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

