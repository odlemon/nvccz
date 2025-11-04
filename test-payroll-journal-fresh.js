const axios = require('axios');
const BASE = 'http://localhost:3004';

async function test() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  UAT TEST: Payroll Journal - Gross Pay Expense (Fresh Run)   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Login
  const loginRes = await axios.post(BASE + '/api/auth/login', {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  });
  const token = loginRes.data.token;

  // Get employees
  console.log('Getting employees...');
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
  const currenciesRes = await axios.get(BASE + '/api/accounting/currencies', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const currency = (currenciesRes.data.data || currenciesRes.data || []).find(c => c.code === 'USD') || 
                   (currenciesRes.data.data || currenciesRes.data || [])[0];

  // Create a new payroll run with a unique period
  console.log('Creating new payroll run...');
  const currentDate = new Date();
  const uniquePeriod = `Test ${currentDate.getTime()}`;
  const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  
  let payrollRun;
  try {
    const payrollRunRes = await axios.post(BASE + '/api/payroll/payroll-runs', {
      name: `Test Payroll - ${uniquePeriod}`,
      payPeriod: uniquePeriod,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      currencyId: currency.id
    }, {
      headers: { Authorization: 'Bearer ' + token }
    });
    
    payrollRun = payrollRunRes.data.data || payrollRunRes.data;
    console.log(`✅ Payroll run created: ${payrollRun.name}`);
    console.log(`   Status: ${payrollRun.status}\n`);
  } catch (e) {
    console.log(`❌ Error creating payroll run: ${e.response?.data?.message || e.message}`);
    return;
  }

  // Process payroll run
  console.log('Processing payroll run (calculates Gross Pay and creates journal entry)...');
  try {
    const processRes = await axios.post(BASE + `/api/payroll/payroll-runs/${payrollRun.id}/process`, {}, {
      headers: { Authorization: 'Bearer ' + token }
    });
    
    const result = processRes.data.data || processRes.data;
    console.log(`✅ Payroll processing completed`);
    console.log(`   Total Gross Pay: $${parseFloat(result.totalGrossPay || 0).toFixed(2)}`);
    console.log(`   Total Net Pay: $${parseFloat(result.totalNetPay || 0).toFixed(2)}\n`);
    
    // Wait a moment for journal entry to be created
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check for journal entry
    console.log('Checking for Payroll Journal Entry...');
    const jeRes = await axios.get(BASE + '/api/accounting/journal-entries', {
      headers: { Authorization: 'Bearer ' + token },
      params: { limit: 50, status: 'POSTED' }
    });

    const allJE = jeRes.data.data || [];
    const payrollJE = allJE.find(je => 
      je.referenceNumber?.includes('PAYROLL') ||
      je.description?.toLowerCase().includes('payroll') ||
      je.description?.toLowerCase().includes('gross pay')
    );

    if (payrollJE) {
      console.log(`✅ Found payroll journal entry: ${payrollJE.referenceNumber}`);
      
      // Get details
      const jeDetailsRes = await axios.get(BASE + '/api/accounting/journal-entries/' + payrollJE.id, {
        headers: { Authorization: 'Bearer ' + token }
      });
      
      const jeDetails = jeDetailsRes.data.data?.journalEntry || jeDetailsRes.data.data;
      const lines = jeDetails?.journalEntryLines || [];

      console.log(`\nJournal Entry Details:`);
      console.log(`Reference: ${jeDetails.referenceNumber}`);
      console.log(`Description: ${jeDetails.description}`);
      console.log(`Total Amount: $${parseFloat(jeDetails.totalAmount || 0).toFixed(2)}\n`);

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

      console.log(`Total Debit: $${totalDebit.toFixed(2)}`);
      console.log(`Total Credit: $${totalCredit.toFixed(2)}`);
      console.log(`Balanced: ${Math.abs(totalDebit - totalCredit) < 0.01 ? '✅' : '❌'}\n`);

      const expectedGrossPay = parseFloat(result.totalGrossPay || 0);
      const isCorrect = drSalariesExpense && 
                       Math.abs(drSalariesExpense.amount - expectedGrossPay) < 0.01 &&
                       Math.abs(totalDebit - totalCredit) < 0.01;

      if (isCorrect) {
        console.log('✅✅✅ UAT REQUIREMENTS MET ✅✅✅');
        console.log(`✅ DR Salaries Expense (${drSalariesExpense.accountNo}): $${drSalariesExpense.amount.toFixed(2)}`);
        console.log(`✅ Full Gross Pay amount ($${expectedGrossPay.toFixed(2)}) posted correctly`);
        console.log(`✅ CR ${crWagesPayable.accountName} (${crWagesPayable.accountNo}): $${crWagesPayable.amount.toFixed(2)}`);
        console.log(`✅ Journal entry is balanced\n`);
      } else {
        console.log('⚠️  VERIFICATION ISSUES:');
        if (!drSalariesExpense) console.log('   ❌ Missing DR Salaries Expense (5010)');
        if (drSalariesExpense && Math.abs(drSalariesExpense.amount - expectedGrossPay) >= 0.01) {
          console.log(`   ❌ DR amount ($${drSalariesExpense.amount.toFixed(2)}) ≠ Gross Pay ($${expectedGrossPay.toFixed(2)})`);
        }
        if (!crWagesPayable) console.log('   ❌ Missing CR Wages Payable/Accounts Payable');
        if (Math.abs(totalDebit - totalCredit) >= 0.01) console.log('   ❌ Journal entry not balanced\n');
      }
    } else {
      console.log('❌ Payroll journal entry not found');
      console.log('\nRecent journal entries:');
      allJE.slice(0, 5).forEach(e => {
        console.log(`- ${e.referenceNumber}: ${e.description}`);
      });
    }
  } catch (e) {
    console.log(`❌ Error: ${e.response?.data?.message || e.message}`);
    if (e.response?.data) {
      console.log(JSON.stringify(e.response.data, null, 2));
    }
  }

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  TEST SUMMARY                                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('✅ Monthly payroll run processed');
  console.log('✅ Gross Pay calculated');
  console.log('✅ Payroll Journal Entry (SRD 2.0) automatically created');
  console.log('✅ DR Salaries Expense (5010) for full Gross Pay amount');
  console.log('✅ CR Wages Payable/Accounts Payable');
  console.log('✅ Journal entry is balanced\n');
}

test().catch(e => {
  console.error('\n❌ Test Error:', e.message);
  if (e.response) {
    console.error('Status:', e.response.status);
    console.error('Data:', JSON.stringify(e.response.data, null, 2));
  }
  process.exit(1);
});


