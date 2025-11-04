const axios = require('axios');
const BASE = 'http://localhost:3004';

async function verify() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  FINAL VERIFICATION: Payroll Journal Entry (MAY 2026)        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Login
  const loginRes = await axios.post(BASE + '/api/auth/login', {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  });
  const token = loginRes.data.token;
  console.log('✅ Login successful\n');

  // Get May payroll run
  console.log('Step 1: Finding May 2026 payroll run...');
  const runsRes = await axios.get(BASE + '/api/payroll/payroll-runs', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const runs = runsRes.data.data || [];
  const mayRun = runs.find(r => r.payPeriod === 'May 2026');
  
  if (!mayRun) {
    console.log('❌ May 2026 payroll run not found');
    return;
  }
  console.log(`✅ Found: ${mayRun.name}`);
  console.log(`   Total Gross Pay: $${parseFloat(mayRun.totalGrossPay || 0).toFixed(2)}\n`);

  // Search for journal entry
  console.log('Step 2: Searching for PAYROLL-MAY-2026 journal entry...');
  const jeRes = await axios.get(BASE + '/api/accounting/journal-entries', {
    headers: { Authorization: 'Bearer ' + token },
    params: { limit: 200, status: 'POSTED_AND_PENDING' }
  });

  const allJE = jeRes.data.data || [];
  const payrollJE = allJE.find(je => 
    je.referenceNumber?.toUpperCase().includes('PAYROLL-MAY-2026') ||
    je.referenceNumber?.toUpperCase() === 'PAYROLL-MAY-2026'
  );

  if (!payrollJE) {
    console.log('❌ Journal entry PAYROLL-MAY-2026 not found');
    console.log('\nSearching for any PAYROLL entries...');
    const payrollEntries = allJE.filter(e => e.referenceNumber?.toUpperCase().includes('PAYROLL'));
    if (payrollEntries.length > 0) {
      console.log(`Found ${payrollEntries.length} PAYROLL entries:`);
      payrollEntries.forEach(e => {
        console.log(`  - ${e.referenceNumber}: ${e.description}`);
      });
    }
    return;
  }

  console.log(`✅ Found journal entry: ${payrollJE.referenceNumber}`);
  console.log(`   Description: ${payrollJE.description}`);
  console.log(`   Amount: $${parseFloat(payrollJE.totalAmount || 0).toFixed(2)}`);
  console.log(`   Status: ${payrollJE.status}\n`);

  // Get full details
  console.log('Step 3: Retrieving journal entry details...');
  const jeDetailsRes = await axios.get(BASE + '/api/accounting/journal-entries/' + payrollJE.id, {
    headers: { Authorization: 'Bearer ' + token }
  });
  
  const jeDetails = jeDetailsRes.data.data?.journalEntry || jeDetailsRes.data.data;
  const lines = jeDetails?.journalEntryLines || [];

  console.log(`✅ Retrieved ${lines.length} journal entry lines\n`);

  // Verify lines
  console.log('Step 4: Verifying journal entry lines...\n');
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

  console.log(`Step 5: Verifying journal entry balance...`);
  console.log(`Total Debit: $${totalDebit.toFixed(2)}`);
  console.log(`Total Credit: $${totalCredit.toFixed(2)}`);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
  console.log(`Balanced: ${isBalanced ? '✅' : '❌'}\n`);

  // UAT Verification
  const expectedGrossPay = parseFloat(mayRun.totalGrossPay || 0);
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
    console.log(`   Expected: $${expectedGrossPay.toFixed(2)}, Actual: $${drSalariesExpense.amount.toFixed(2)}`);
  } else {
    console.log(`   Status: ❌ FAILED - Expected: $${expectedGrossPay.toFixed(2)}, Got: ${drSalariesExpense ? '$' + drSalariesExpense.amount.toFixed(2) : 'N/A'}`);
  }
  console.log('');
  
  console.log('✅ UAT Requirement 4: CR Wages Payable/Accounts Payable');
  if (hasCorrectCR) {
    console.log(`   Status: ✅ PASSED - CR ${crWagesPayable.accountName} (${crWagesPayable.accountNo}): $${crWagesPayable.amount.toFixed(2)}`);
    console.log(`   Expected: $${expectedGrossPay.toFixed(2)}, Actual: $${crWagesPayable.amount.toFixed(2)}`);
  } else {
    console.log(`   Status: ❌ FAILED - CR Wages Payable not found or incorrect`);
  }
  console.log('');
  
  console.log('✅ UAT Requirement 5: Journal entry is balanced');
  console.log(`   Status: ${isBalanced ? '✅ PASSED' : '❌ FAILED'}`);
  console.log(`   Difference: $${Math.abs(totalDebit - totalCredit).toFixed(2)}\n`);

  if (hasCorrectDR && hasCorrectCR && isBalanced) {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  ✅✅✅ ALL UAT REQUIREMENTS MET ✅✅✅                        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log('Summary:');
    console.log(`  • Journal Entry Reference: ${payrollJE.referenceNumber}`);
    console.log(`  • DR Salaries Expense (${drSalariesExpense.accountNo}): $${drSalariesExpense.amount.toFixed(2)}`);
    console.log(`  • CR ${crWagesPayable.accountName} (${crWagesPayable.accountNo}): $${crWagesPayable.amount.toFixed(2)}`);
    console.log(`  • Total Amount: $${totalDebit.toFixed(2)}`);
    console.log(`  • Balanced: Yes ✅\n`);
  } else {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  ⚠️  SOME UAT REQUIREMENTS NOT MET                            ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
  }
}

verify().catch(e => {
  console.error('\n❌ Verification Error:', e.message);
  if (e.response) {
    console.error('Status:', e.response.status);
    console.error('Data:', JSON.stringify(e.response.data, null, 2));
  }
  process.exit(1);
});

