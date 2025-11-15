const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function traceDifferences() {
  let token = '';

  console.log('🔍 TRACING ACCOUNTING DIFFERENCES - DETAILED ANALYSIS\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Login
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

  // Get currencies
  let currencyId = null;
  try {
    const currenciesRes = await axios.get(`${BASE_URL}/api/accounting/currencies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const currencies = currenciesRes.data.data || [];
    const defaultCurrency = currencies.find(c => c.isDefault) || currencies[0];
    currencyId = defaultCurrency.id;
    console.log(`💱 Using currency: ${defaultCurrency.code} (ID: ${currencyId})\n`);
  } catch (error) {
    console.error('⚠️  Could not get currencies:', error.message);
    return;
  }

  const yearStart = '2025-01-01';
  const yearEnd = '2025-12-31';
  const asOfDate = yearEnd;

  // 1. Get Trial Balance - account by account
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 STEP 1: TRIAL BALANCE - Account Details');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  let tbAccounts = [];
  let tbTotalDebits = 0;
  let tbTotalCredits = 0;
  let tbCashAccounts = [];

  try {
    const tbRes = await axios.get(`${BASE_URL}/api/accounting/trial-balance`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        asOfDate: asOfDate,
        currencyId: currencyId
      },
      timeout: 120000
    });

    const tb = tbRes.data.data || tbRes.data;
    tbAccounts = tb.accounts || [];
    tbTotalDebits = parseFloat(tb.totals?.totalDebits || 0);
    tbTotalCredits = parseFloat(tb.totals?.totalCredits || 0);

    // Find cash accounts
    tbCashAccounts = tbAccounts.filter(acc => 
      acc.accountNo === '1000' || 
      acc.accountNo === '1010' || 
      acc.accountNo === '1020' ||
      acc.accountName?.toLowerCase().includes('cash') ||
      acc.accountName?.toLowerCase().includes('bank')
    );

    console.log(`Total Accounts: ${tbAccounts.length}`);
    console.log(`Total Debits: ${tbTotalDebits.toFixed(2)}`);
    console.log(`Total Credits: ${tbTotalCredits.toFixed(2)}`);
    console.log(`Difference: ${(tbTotalDebits - tbTotalCredits).toFixed(2)}\n`);

    console.log('Cash Accounts in Trial Balance:');
    tbCashAccounts.forEach(acc => {
      const debit = parseFloat(acc.debitBalance || 0);
      const credit = parseFloat(acc.creditBalance || 0);
      const net = debit - credit;
      console.log(`   ${acc.accountNo} - ${acc.accountName}`);
      console.log(`      Debit: ${debit.toFixed(2)}, Credit: ${credit.toFixed(2)}, Net: ${net.toFixed(2)}`);
    });
    console.log('');

  } catch (error) {
    console.error('❌ Error getting Trial Balance:', error.message);
    return;
  }

  // 2. Get General Ledger - account by account
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 STEP 2: GENERAL LEDGER - Account Details');
  console.log('═══════════════════════════════════════════════════════════\n');
  
  let glAccounts = [];
  let glTotalDebits = 0;
  let glTotalCredits = 0;
  let glCashAccounts = [];

  try {
    const accountsRes = await axios.get(`${BASE_URL}/api/accounting/chart-of-accounts`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit: 1000 }
    });
    const accounts = accountsRes.data.data || accountsRes.data || [];

    console.log(`Processing ${accounts.length} accounts for GL Detail...\n`);

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

          glAccounts.push({
            accountNo: account.accountNo,
            accountName: account.accountName,
            debits: debits,
            credits: credits,
            net: debits - credits
          });

          // Track cash accounts
          if (account.accountNo === '1000' || 
              account.accountNo === '1010' || 
              account.accountNo === '1020' ||
              account.accountName?.toLowerCase().includes('cash') ||
              account.accountName?.toLowerCase().includes('bank')) {
            glCashAccounts.push({
              accountNo: account.accountNo,
              accountName: account.accountName,
              debits: debits,
              credits: credits,
              net: debits - credits
            });
          }
        }
      } catch (error) {
        // Skip errors for now
      }
    }

    console.log(`Total Accounts Processed: ${glAccounts.length}`);
    console.log(`Total Debits: ${glTotalDebits.toFixed(2)}`);
    console.log(`Total Credits: ${glTotalCredits.toFixed(2)}`);
    console.log(`Difference: ${(glTotalDebits - glTotalCredits).toFixed(2)}\n`);

    console.log('Cash Accounts in General Ledger:');
    glCashAccounts.forEach(acc => {
      console.log(`   ${acc.accountNo} - ${acc.accountName}`);
      console.log(`      Debits: ${acc.debits.toFixed(2)}, Credits: ${acc.credits.toFixed(2)}, Net: ${acc.net.toFixed(2)}`);
    });
    console.log('');

  } catch (error) {
    console.error('❌ Error getting General Ledger:', error.message);
  }

  // 3. Compare account by account
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 STEP 3: ACCOUNT-BY-ACCOUNT COMPARISON');
  console.log('═══════════════════════════════════════════════════════════\n');

  const differences = [];
  
  // Create maps for easy lookup
  const tbMap = new Map();
  tbAccounts.forEach(acc => {
    const debit = parseFloat(acc.debitBalance || 0);
    const credit = parseFloat(acc.creditBalance || 0);
    tbMap.set(acc.accountNo, {
      debit: debit,
      credit: credit,
      net: debit - credit
    });
  });

  const glMap = new Map();
  glAccounts.forEach(acc => {
    glMap.set(acc.accountNo, {
      debit: acc.debits,
      credit: acc.credits,
      net: acc.net
    });
  });

  // Find all unique accounts
  const allAccountNos = new Set([...tbMap.keys(), ...glMap.keys()]);

  console.log('Accounts with differences (> 0.01):\n');
  let totalDifference = 0;

  for (const accountNo of allAccountNos) {
    const tb = tbMap.get(accountNo) || { debit: 0, credit: 0, net: 0 };
    const gl = glMap.get(accountNo) || { debit: 0, credit: 0, net: 0 };

    const debitDiff = Math.abs(tb.debit - gl.debit);
    const creditDiff = Math.abs(tb.credit - gl.credit);
    const netDiff = Math.abs(tb.net - gl.net);

    if (debitDiff > 0.01 || creditDiff > 0.01 || netDiff > 0.01) {
      const accountName = tbAccounts.find(a => a.accountNo === accountNo)?.accountName || 
                         glAccounts.find(a => a.accountNo === accountNo)?.accountName || 'Unknown';
      
      differences.push({
        accountNo,
        accountName,
        tbDebit: tb.debit,
        glDebit: gl.debit,
        debitDiff: tb.debit - gl.debit,
        tbCredit: tb.credit,
        glCredit: gl.credit,
        creditDiff: tb.credit - gl.credit,
        tbNet: tb.net,
        glNet: gl.net,
        netDiff: tb.net - gl.net
      });

      totalDifference += Math.abs(netDiff);

      console.log(`   ${accountNo} - ${accountName}`);
      console.log(`      TB: Debit ${tb.debit.toFixed(2)}, Credit ${tb.credit.toFixed(2)}, Net ${tb.net.toFixed(2)}`);
      console.log(`      GL: Debit ${gl.debit.toFixed(2)}, Credit ${gl.credit.toFixed(2)}, Net ${gl.net.toFixed(2)}`);
      console.log(`      Diff: Debit ${(tb.debit - gl.debit).toFixed(2)}, Credit ${(tb.credit - gl.credit).toFixed(2)}, Net ${(tb.net - gl.net).toFixed(2)}\n`);
    }
  }

  console.log(`\nTotal accounts with differences: ${differences.length}`);
  console.log(`Sum of absolute differences: ${totalDifference.toFixed(2)}\n`);

  // 4. Overall totals comparison
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 STEP 4: OVERALL TOTALS COMPARISON');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('Trial Balance:');
  console.log(`   Total Debits: ${tbTotalDebits.toFixed(2)}`);
  console.log(`   Total Credits: ${tbTotalCredits.toFixed(2)}`);
  console.log(`   Difference: ${(tbTotalDebits - tbTotalCredits).toFixed(2)}\n`);

  console.log('General Ledger:');
  console.log(`   Total Debits: ${glTotalDebits.toFixed(2)}`);
  console.log(`   Total Credits: ${glTotalCredits.toFixed(2)}`);
  console.log(`   Difference: ${(glTotalDebits - glTotalCredits).toFixed(2)}\n`);

  const debitDiff = tbTotalDebits - glTotalDebits;
  const creditDiff = tbTotalCredits - glTotalCredits;

  console.log('Differences:');
  console.log(`   Debit Difference: ${debitDiff.toFixed(2)} (${((debitDiff / tbTotalDebits) * 100).toFixed(4)}%)`);
  console.log(`   Credit Difference: ${creditDiff.toFixed(2)} (${((creditDiff / tbTotalCredits) * 100).toFixed(4)}%)\n`);

  // 5. Check Balance Sheet and Cash Flow
  console.log('═══════════════════════════════════════════════════════════');
  console.log('💰 STEP 5: CASH BALANCES COMPARISON');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    const bsRes = await axios.get(`${BASE_URL}/api/accounting/balance-sheet`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        asOfDate: asOfDate,
        currencyId: currencyId
      },
      timeout: 120000
    });

    const bs = bsRes.data.data || bsRes.data;
    const bsCash = parseFloat(bs.cashAndCashEquivalents || 0);

    const cfRes = await axios.post(
      `${BASE_URL}/api/accounting/cash-flow/generate`,
      {
        startDate: yearStart,
        endDate: yearEnd,
        currencyId: currencyId
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 120000
      }
    );

    const cf = cfRes.data.data || cfRes.data;
    const cfCash = parseFloat(cf.endingCash || 0);

    // Calculate TB cash
    const tbCashNet = tbCashAccounts.reduce((sum, acc) => {
      const debit = parseFloat(acc.debitBalance || 0);
      const credit = parseFloat(acc.creditBalance || 0);
      return sum + (debit - credit);
    }, 0);

    // Calculate GL cash
    const glCashNet = glCashAccounts.reduce((sum, acc) => {
      return sum + acc.net;
    }, 0);

    console.log('Cash & Cash Equivalents:');
    console.log(`   Trial Balance: ${tbCashNet.toFixed(2)}`);
    console.log(`   General Ledger: ${glCashNet.toFixed(2)}`);
    console.log(`   Balance Sheet: ${bsCash.toFixed(2)}`);
    console.log(`   Cash Flow: ${cfCash.toFixed(2)}\n`);

    console.log('Differences:');
    console.log(`   TB vs GL: ${(tbCashNet - glCashNet).toFixed(2)}`);
    console.log(`   TB vs BS: ${(tbCashNet - bsCash).toFixed(2)}`);
    console.log(`   TB vs CF: ${(tbCashNet - cfCash).toFixed(2)}`);
    console.log(`   GL vs BS: ${(glCashNet - bsCash).toFixed(2)}`);
    console.log(`   GL vs CF: ${(glCashNet - cfCash).toFixed(2)}`);
    console.log(`   BS vs CF: ${(bsCash - cfCash).toFixed(2)}\n`);

  } catch (error) {
    console.error('❌ Error getting Balance Sheet or Cash Flow:', error.message);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ ANALYSIS COMPLETE');
  console.log('═══════════════════════════════════════════════════════════\n');
}

traceDifferences();

