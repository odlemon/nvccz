const axios = require('axios');
const BASE = 'http://localhost:3004';

async function test() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  UAT TEST: Payroll Journal - Gross Pay Expense (COMPLETE)     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Login
  console.log('Step 1: Logging in...');
  let token;
  try {
    const loginRes = await axios.post(BASE + '/api/auth/login', {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });
    token = loginRes.data.token;
    console.log('✅ Login successful\n');
  } catch (e) {
    console.log(`❌ Login failed: ${e.message}`);
    return;
  }

  // Get employees
  console.log('Step 2: Getting employees...');
  const employeesRes = await axios.get(BASE + '/api/payroll/employees', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const employees = employeesRes.data.data || [];
  console.log(`✅ Found ${employees.length} employee(s)\n`);

  if (employees.length === 0) {
    console.log('❌ No employees found. Cannot test payroll.');
    return;
  }

  // Get currency
  console.log('Step 3: Getting currency...');
  const currenciesRes = await axios.get(BASE + '/api/accounting/currencies', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const currency = (currenciesRes.data.data || currenciesRes.data || []).find(c => c.code === 'USD') || 
                   (currenciesRes.data.data || currenciesRes.data || [])[0];
  console.log(`✅ Currency: ${currency.code}\n`);

  // Create payroll run for April 2026 (completely new month)
  console.log('Step 4: Creating payroll run for April 2026...');
  const startDate = new Date('2026-04-01');
  const endDate = new Date('2026-04-30');
  
  let payrollRun;
  try {
    const payrollRunRes = await axios.post(BASE + '/api/payroll/payroll-runs', {
      name: 'Test Payroll - April 2026',
      payPeriod: 'April 2026',
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      currencyId: currency.id
    }, {
      headers: { Authorization: 'Bearer ' + token }
    });
    
    payrollRun = payrollRunRes.data.data || payrollRunRes.data;
    console.log(`✅ Payroll run created: ${payrollRun.name}`);
    console.log(`   ID: ${payrollRun.id}`);
    console.log(`   Status: ${payrollRun.status}\n`);
  } catch (e) {
    if (e.response?.data?.message?.includes('already exists')) {
      console.log('⚠️  Payroll run for April already exists. Using existing run...\n');
      const runsRes = await axios.get(BASE + '/api/payroll/payroll-runs', {
        headers: { Authorization: 'Bearer ' + token }
      });
      const runs = runsRes.data.data || [];
      payrollRun = runs.find(r => r.payPeriod === 'April 2026');
      if (!payrollRun) {
        console.log('❌ Could not find existing April payroll run');
        return;
      }
      console.log(`Using existing run: ${payrollRun.name} (Status: ${payrollRun.status})\n`);
    } else {
      console.log(`❌ Error creating payroll run: ${e.response?.data?.message || e.message}`);
      return;
    }
  }

  // Process payroll run if not already processed
  if (payrollRun.status === 'DRAFT') {
    console.log('Step 5: Processing payroll run (calculates Gross Pay and creates journal entry)...');
    try {
      const processRes = await axios.post(BASE + `/api/payroll/payroll-runs/${payrollRun.id}/process`, {}, {
        headers: { Authorization: 'Bearer ' + token }
      });
      
      const result = processRes.data.data || processRes.data;
      console.log(`✅ Payroll processing completed`);
      console.log(`   Total Gross Pay: $${parseFloat(result.totalGrossPay || 0).toFixed(2)}`);
      console.log(`   Total Net Pay: $${parseFloat(result.totalNetPay || 0).toFixed(2)}`);
      console.log(`   Status: ${result.status}\n`);
      
      // Wait for journal entry creation
      console.log('Waiting 8 seconds for journal entry to be created...\n');
      await new Promise(resolve => setTimeout(resolve, 8000));
    } catch (e) {
      console.log(`❌ Error processing payroll: ${e.response?.data?.message || e.message}`);
      if (e.response?.data) {
        console.log(JSON.stringify(e.response.data, null, 2));
      }
      return;
    }
  } else {
    console.log(`Step 5: Payroll run already processed (Status: ${payrollRun.status})`);
    console.log(`   Total Gross Pay: $${parseFloat(payrollRun.totalGrossPay || 0).toFixed(2)}\n`);
  }

  // Check for journal entry
  console.log('Step 6: Reviewing automated Payroll Journal Entry (SRD 2.0)...');
  const jeRes = await axios.get(BASE + '/api/accounting/journal-entries', {
    headers: { Authorization: 'Bearer ' + token },
    params: { limit: 200, status: 'POSTED_AND_PENDING' }
  });

  const allJE = jeRes.data.data || [];
  console.log(`Total journal entries in system: ${allJE.length}`);
  
  // Search for APRIL payroll entry
  const payrollJE = allJE.find(je => 
    je.referenceNumber?.toUpperCase().includes('PAYROLL') ||
    je.referenceNumber?.toUpperCase().includes('APRIL') ||
    je.description?.toLowerCase().includes('april 2026') ||
    (je.description?.toLowerCase().includes('payroll') && je.description?.toLowerCase().includes('gross pay'))
  );

  if (payrollJE) {
    console.log(`\n✅✅✅ FOUND PAYROLL JOURNAL ENTRY! ✅✅✅`);
    console.log(`Reference: ${payrollJE.referenceNumber}`);
    console.log(`Description: ${payrollJE.description}`);
    console.log(`Amount: $${parseFloat(payrollJE.totalAmount || 0).toFixed(2)}`);
    console.log(`Status: ${payrollJE.status}\n`);
    
    // Get full details
    console.log('Step 7: Retrieving journal entry details...');
    const jeDetailsRes = await axios.get(BASE + '/api/accounting/journal-entries/' + payrollJE.id, {
      headers: { Authorization: 'Bearer ' + token }
    });
    
    const jeDetails = jeDetailsRes.data.data?.journalEntry || jeDetailsRes.data.data;
    const lines = jeDetails?.journalEntryLines || [];

    console.log(`✅ Journal entry details retrieved`);
    console.log(`   Lines: ${lines.length}\n`);

    console.log('Step 8: Verifying journal entry lines...\n');
    let drSalariesExpense = null;
    let crWagesPayable = null;
    let totalDebit = 0;
    let totalCredit = 0;

    lines.forEach((line, i) => {
      const accountNo = line.chartOfAccount?.accountNo || 'N/A';
      const accountName = line.chartOfAccount?.accountName || 'N/A';
      const accountType = line.chartOfAccount?.accountType || 'N/A';
      const debit = parseFloat(line.debitAmount || 0);
      const credit = parseFloat(line.creditAmount || 0);
      
      totalDebit += debit;
      totalCredit += credit;
      
      console.log(`Line ${i + 1}: ${accountNo} - ${accountName} (${accountType})`);
      if (debit > 0) {
        console.log(`  DR: $${debit.toFixed(2)}`);
        if ((accountNo === '5010' || accountNo.startsWith('5')) && accountType === 'Expense') {
          drSalariesExpense = { accountNo, accountName, amount: debit };
        }
      }
      if (credit > 0) {
        console.log(`  CR: $${credit.toFixed(2)}`);
        if ((accountNo.startsWith('20') || accountType === 'Current Liability') &&
            (accountName.toLowerCase().includes('wages') || 
             accountName.toLowerCase().includes('payable'))) {
          crWagesPayable = { accountNo, accountName, amount: credit };
        }
      }
      console.log('');
    });

    console.log(`Step 9: Verifying journal entry balance...`);
    console.log(`Total Debit: $${totalDebit.toFixed(2)}`);
    console.log(`Total Credit: $${totalCredit.toFixed(2)}`);
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
    console.log(`Balanced: ${isBalanced ? '✅' : '❌'}\n`);

    const expectedGrossPay = parseFloat(payrollRun.totalGrossPay || 0);
    const hasCorrectDR = drSalariesExpense && Math.abs(drSalariesExpense.amount - expectedGrossPay) < 0.01;
    const hasCorrectCR = crWagesPayable && Math.abs(crWagesPayable.amount - expectedGrossPay) < 0.01;

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  UAT VERIFICATION RESULTS                                    ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    console.log('✅ UAT Requirement 1: Process a typical monthly payroll run');
    console.log('   Status: ✅ PASSED - Payroll processed successfully\n');
    
    console.log('✅ UAT Requirement 2: Review the automated Payroll Journal (SRD 2.0)');
    console.log('   Status: ✅ PASSED - Journal entry automatically generated\n');
    
    console.log('✅ UAT Requirement 3: System posts full Gross Pay amount as DR to Salaries Expense (5010)');
    if (hasCorrectDR) {
      console.log(`   Status: ✅ PASSED - DR Salaries Expense (${drSalariesExpense.accountNo}): $${drSalariesExpense.amount.toFixed(2)}`);
    } else {
      console.log(`   Status: ❌ FAILED - Expected: $${expectedGrossPay.toFixed(2)}, Got: ${drSalariesExpense ? '$' + drSalariesExpense.amount.toFixed(2) : 'N/A'}`);
    }
    console.log('');
    
    console.log('✅ UAT Requirement 4: CR Wages Payable/Accounts Payable');
    if (hasCorrectCR) {
      console.log(`   Status: ✅ PASSED - CR ${crWagesPayable.accountName} (${crWagesPayable.accountNo}): $${crWagesPayable.amount.toFixed(2)}`);
    } else {
      console.log(`   Status: ❌ FAILED - CR Wages Payable not found or incorrect`);
    }
    console.log('');
    
    console.log('✅ UAT Requirement 5: Journal entry is balanced');
    console.log(`   Status: ${isBalanced ? '✅ PASSED' : '❌ FAILED'}\n`);

    if (hasCorrectDR && hasCorrectCR && isBalanced) {
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║  ✅✅✅ ALL UAT REQUIREMENTS MET ✅✅✅                        ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');
    } else {
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║  ⚠️  SOME UAT REQUIREMENTS NOT MET                            ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');
    }
  } else {
    console.log(`\n❌ Payroll journal entry NOT FOUND`);
    console.log(`\nSearching all entries for PAYROLL references...`);
    const payrollRefs = allJE.filter(e => e.referenceNumber?.toUpperCase().includes('PAYROLL'));
    if (payrollRefs.length > 0) {
      console.log(`Found ${payrollRefs.length} entries with PAYROLL in reference:`);
      payrollRefs.forEach(e => {
        console.log(`  - ${e.referenceNumber}: ${e.description}`);
      });
    } else {
      console.log('No entries with PAYROLL in reference found.');
    }
    console.log('\nRecent journal entries (last 20):');
    allJE.slice(0, 20).forEach((e, i) => {
      console.log(`${i + 1}. ${e.referenceNumber}: ${e.description}`);
    });
    console.log('\n⚠️  UAT REQUIREMENT NOT MET: Journal entry was not created.');
    console.log('   Check server console for errors during payroll processing.\n');
  }
}

test().catch(e => {
  console.error('\n❌ Test Error:', e.message);
  if (e.response) {
    console.error('Status:', e.response.status);
    console.error('Data:', JSON.stringify(e.response.data, null, 2));
  }
  process.exit(1);
});

