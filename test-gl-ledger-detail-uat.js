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
  console.log('RUNNING BALANCE ON GL REPORT UAT TEST');
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

    // Step 2: Verify GL Account 1100 exists
    console.log('Step 2: Verifying GL Account 1100 (Bank) exists...');
    const accountsResponse = await apiRequest('GET', '/api/accounting/chart-of-accounts?accountNo=1100', null, token);
    
    let account1100 = null;
    if (accountsResponse.status === 200) {
      const accounts = accountsResponse.data.data || accountsResponse.data || [];
      account1100 = accounts.find(a => a.accountNo === '1100' || a.accountNo === '1100');
      if (!account1100 && accounts.length > 0) {
        // Try to find any bank account
        account1100 = accounts.find(a => a.accountName.toLowerCase().includes('bank'));
      }
    }

    if (!account1100) {
      console.log('⚠️  Account 1100 not found. Searching for Bank accounts...');
      const allAccountsResponse = await apiRequest('GET', '/api/accounting/chart-of-accounts?limit=100', null, token);
      if (allAccountsResponse.status === 200) {
        const allAccounts = allAccountsResponse.data.data || allAccountsResponse.data || [];
        account1100 = allAccounts.find(a => 
          a.accountName.toLowerCase().includes('bank') || 
          a.accountNo === '1100' ||
          a.accountType === 'Current Asset'
        );
      }
    }

    if (!account1100) {
      throw new Error('GL Account 1100 (Bank) not found. Please ensure the account exists in the chart of accounts.');
    }

    console.log(`✅ GL Account found: ${account1100.accountName} (${account1100.accountNo})`);
    console.log(`   Account Type: ${account1100.accountType}\n`);

    // Step 3: Generate GL Detail Report for entire year (2025)
    console.log('Step 3: Generating GL Detail Report for Account 1100 for entire year 2025...');
    const yearStart = new Date('2025-01-01');
    const yearEnd = new Date('2025-12-31');
    
    const reportResponse = await apiRequest('GET', 
      `/api/accounting/gl-ledger-detail?accountNo=${account1100.accountNo}&startDate=${yearStart.toISOString().split('T')[0]}&endDate=${yearEnd.toISOString().split('T')[0]}`, 
      null, 
      token
    );
    
    if (reportResponse.status !== 200) {
      throw new Error(`Failed to generate GL Detail report: ${reportResponse.status} - ${JSON.stringify(reportResponse.data)}`);
    }

    const report = reportResponse.data.data;
    console.log('✅ GL Detail Report generated successfully\n');

    // Step 4: Verify the report
    console.log('Step 4: Verifying GL Detail Report...');
    console.log('===============================================================');
    console.log('UAT VERIFICATION');
    console.log('===============================================================\n');

    console.log(`Account: ${report.account.accountName} (${report.account.accountNo})`);
    console.log(`Account Type: ${report.account.accountType}`);
    console.log(`Period: ${report.period.startDate} to ${report.period.endDate}`);
    console.log(`Opening Balance: $${report.account.openingBalance.toFixed(2)}`);
    console.log(`Closing Balance: $${report.account.closingBalance.toFixed(2)}\n`);

    console.log(`Total Transactions: ${report.transactions.length}`);
    console.log(`Total Debits: $${report.summary.totalDebits.toFixed(2)}`);
    console.log(`Total Credits: $${report.summary.totalCredits.toFixed(2)}`);
    console.log(`Net Change: $${report.summary.netChange.toFixed(2)}\n`);

    // Display sample transactions with running balance
    if (report.transactions.length > 0) {
      console.log('Sample Transactions (with Running Balance):');
      console.log('─'.repeat(100));
      console.log('Date       | Reference        | Description                          | Debit      | Credit     | Running Balance');
      console.log('─'.repeat(100));
      
      // Show first 5 and last 5 transactions
      const sampleSize = Math.min(10, report.transactions.length);
      const transactionsToShow = report.transactions.slice(0, 5);
      
      if (report.transactions.length > 10) {
        transactionsToShow.push(...report.transactions.slice(-5));
      } else {
        transactionsToShow.push(...report.transactions.slice(5));
      }

      for (const txn of transactionsToShow) {
        const date = txn.date.substring(0, 10);
        const ref = (txn.reference || '').substring(0, 15).padEnd(15);
        const desc = (txn.description || '').substring(0, 35).padEnd(35);
        const debit = txn.debitAmount.toFixed(2).padStart(10);
        const credit = txn.creditAmount.toFixed(2).padStart(10);
        const balance = txn.runningBalance.toFixed(2).padStart(15);
        
        console.log(`${date} | ${ref} | ${desc} | $${debit} | $${credit} | $${balance}`);
      }
      
      if (report.transactions.length > 10) {
        console.log(`\n... (${report.transactions.length - 10} more transactions) ...`);
      }
      
      console.log('─'.repeat(100));
      console.log('');
    }

    // Verification
    const verificationResults = {
      reportGenerated: report !== null,
      accountInfoPresent: report.account && report.account.accountNo === account1100.accountNo,
      openingBalancePresent: typeof report.account.openingBalance === 'number',
      closingBalancePresent: typeof report.account.closingBalance === 'number',
      transactionsHaveRunningBalance: report.transactions.length === 0 || report.transactions.every(t => typeof t.runningBalance === 'number'),
      runningBalanceCalculated: false, // Will verify below
      closingBalanceMatches: false // Will verify below
    };

    // Verify running balance calculation
    if (report.transactions.length > 0) {
      let calculatedBalance = report.account.openingBalance;
      let balanceMatches = true;
      
      for (const txn of report.transactions) {
        // For Asset accounts: Debit increases, Credit decreases
        // For Liability/Equity accounts: Credit increases, Debit decreases
        const isAsset = ['Current Asset', 'Fixed Asset', 'Non-Current Asset', 'Asset', 'Bank', 'Cash'].includes(report.account.accountType);
        
        if (isAsset) {
          calculatedBalance = calculatedBalance + txn.debitAmount - txn.creditAmount;
        } else {
          calculatedBalance = calculatedBalance + txn.creditAmount - txn.debitAmount;
        }
        
        // Allow small rounding differences (0.01)
        if (Math.abs(calculatedBalance - txn.runningBalance) > 0.01) {
          balanceMatches = false;
          console.log(`⚠️  Running balance mismatch at transaction ${txn.reference}: Expected $${calculatedBalance.toFixed(2)}, Got $${txn.runningBalance.toFixed(2)}`);
          break;
        }
      }
      
      verificationResults.runningBalanceCalculated = balanceMatches;
      
      // Verify closing balance matches final running balance
      const finalRunningBalance = report.transactions.length > 0 
        ? report.transactions[report.transactions.length - 1].runningBalance 
        : report.account.openingBalance;
      
      verificationResults.closingBalanceMatches = Math.abs(finalRunningBalance - report.account.closingBalance) <= 0.01;
    } else {
      // No transactions, closing balance should equal opening balance
      verificationResults.closingBalanceMatches = Math.abs(report.account.openingBalance - report.account.closingBalance) <= 0.01;
      verificationResults.runningBalanceCalculated = true; // No transactions to verify
    }

    console.log('===============================================================');
    console.log('VERIFICATION SUMMARY');
    console.log('===============================================================');
    console.log(`✅ Report Generated: ${verificationResults.reportGenerated ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Account Information Present: ${verificationResults.accountInfoPresent ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Opening Balance Present: ${verificationResults.openingBalancePresent ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Closing Balance Present: ${verificationResults.closingBalancePresent ? 'PASS' : 'FAIL'}`);
    console.log(`✅ All Transactions Have Running Balance: ${verificationResults.transactionsHaveRunningBalance ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Running Balance Calculated Correctly: ${verificationResults.runningBalanceCalculated ? 'PASS' : 'FAIL'}`);
    console.log(`✅ Closing Balance Matches Final Running Balance: ${verificationResults.closingBalanceMatches ? 'PASS' : 'FAIL'}`);
    console.log('');

    const allPassed = Object.values(verificationResults).every(v => v === true);
    if (allPassed) {
      console.log('✅ UAT TEST PASSED: GL Detail Report correctly shows running balance after each transaction');
    } else {
      console.log('❌ UAT TEST FAILED: Some verification checks failed');
    }
    console.log('===============================================================\n');

    // Show closing balance verification
    if (report.transactions.length > 0) {
      const finalBalance = report.transactions[report.transactions.length - 1].runningBalance;
      console.log(`Closing Balance Verification:`);
      console.log(`   Final Running Balance: $${finalBalance.toFixed(2)}`);
      console.log(`   Reported Closing Balance: $${report.account.closingBalance.toFixed(2)}`);
      console.log(`   Match: ${verificationResults.closingBalanceMatches ? '✅ YES' : '❌ NO'}\n`);
    }

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

