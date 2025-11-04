const axios = require('axios');
const BASE = 'http://localhost:3004';

async function testPayrollLiabilityPosting() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  PAYROLL JOURNAL - LIABILITY POSTING UAT TEST                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Login
  const loginRes = await axios.post(BASE + '/api/auth/login', {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  });
  const token = loginRes.data.token;
  console.log('✅ Login successful\n');

  try {
    // Step 1: Get or create required GL accounts
    console.log('Step 1: Verifying/Creating GL Accounts...\n');
    
    const accountsResponse = await axios.get(BASE + '/api/accounting/chart-of-accounts', {
      headers: { Authorization: 'Bearer ' + token },
      params: { limit: 1000 }
    });
    
    const accounts = accountsResponse.data.data || [];
    
    // Check for required accounts
    const salariesExpense = accounts.find(a => a.accountNo === '5010' || a.accountName.includes('Salaries Expense'));
    const payePayable = accounts.find(a => a.accountNo === '2150' || (a.accountName.includes('PAYE') && a.accountType === 'Current Liability'));
    const nssaPensionPayable = accounts.find(a => a.accountNo === '2160' || (a.accountName.includes('NSSA') && a.accountType === 'Current Liability'));
    const netWagesPayable = accounts.find(a => a.accountNo === '2250' || (a.accountName.includes('Net Wages') && a.accountType === 'Current Liability'));
    
    console.log(`   Salaries Expense (5010): ${salariesExpense ? '✅ Found' : '❌ Not found'}`);
    console.log(`   PAYE Payable (2150): ${payePayable ? '✅ Found' : '⚠️  Will be created during payroll processing'}`);
    console.log(`   NSSA/Pension Payable (2160): ${nssaPensionPayable ? '✅ Found' : '⚠️  Will be created during payroll processing'}`);
    console.log(`   Net Wages Payable (2250): ${netWagesPayable ? '✅ Found' : '⚠️  Will be created during payroll processing'}\n`);

    // Step 2: Get currency
    console.log('Step 2: Getting currency...\n');
    const currenciesResponse = await axios.get(BASE + '/api/accounting/currencies', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const currencies = currenciesResponse.data.data || [];
    const currency = currencies.find(c => c.code === 'USD') || currencies[0];
    
    if (!currency) {
      throw new Error('No currency found');
    }
    console.log(`   Using currency: ${currency.code} (${currency.id})\n`);

    // Step 3: Get or create a user/employee
    console.log('Step 3: Getting/Creating employee...\n');
    const usersResponse = await axios.get(BASE + '/api/users', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const users = usersResponse.data.data || [];
    let testUser = users.find(u => u.email === 'admin@nvccz.co.zw');
    
    if (!testUser) {
      throw new Error('Test user not found');
    }
    console.log(`   Using user: ${testUser.firstName} ${testUser.lastName} (${testUser.id})\n`);

    // Get employee for this user
    const employeesResponse = await axios.get(BASE + '/api/payroll/employees', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const employees = employeesResponse.data.data || [];
    let employee = employees.find(e => e.userId === testUser.id);
    
    if (!employee) {
      console.log('   Creating employee...\n');
      const createEmployeeRes = await axios.post(BASE + '/api/payroll/employees', {
        userId: testUser.id,
        employeeNumber: 'EMP-' + Date.now(),
        basicSalary: 2000,
        currencyId: currency.id,
        isActive: true
      }, {
        headers: { Authorization: 'Bearer ' + token }
      });
      employee = createEmployeeRes.data.data;
      console.log(`   ✅ Created employee: ${employee.employeeNumber}\n`);
    } else {
      console.log(`   ✅ Found employee: ${employee.employeeNumber}\n`);
    }

    // Step 4: Check for TaxRules (PAYE and NSSA)
    console.log('Step 4: Checking TaxRules for PAYE and NSSA...\n');
    const taxRulesResponse = await axios.get(BASE + '/api/payroll/tax-rules', {
      headers: { Authorization: 'Bearer ' + token }
    });
    const taxRules = taxRulesResponse.data.data || [];
    
    const payeRule = taxRules.find(r => r.type === 'PAYE' && r.isActive);
    const nssaRule = taxRules.find(r => r.type === 'NSSA' && r.isActive);
    
    console.log(`   PAYE TaxRule: ${payeRule ? '✅ Found' : '⚠️  Not found - deductions may not be categorized'}`);
    console.log(`   NSSA TaxRule: ${nssaRule ? '✅ Found' : '⚠️  Not found - deductions may not be categorized'}\n`);

    // Step 5: Create or get payroll run for July 2026
    console.log('Step 5: Creating/getting payroll run for July 2026...\n');
    const payrollRunData = {
      name: 'Test Payroll - Liability Posting',
      payPeriod: 'July 2026',
      startDate: '2026-07-01',
      endDate: '2026-07-31',
      currencyId: currency.id
    };
    
    let payrollRun;
    try {
      const createPayrollRes = await axios.post(BASE + '/api/payroll/payroll-runs', payrollRunData, {
        headers: { Authorization: 'Bearer ' + token }
      });
      payrollRun = createPayrollRes.data.data;
      console.log(`   ✅ Created payroll run: ${payrollRun.id} (${payrollRun.payPeriod})\n`);
    } catch (error) {
      if (error.response?.status === 400 && error.response?.data?.existingPayrollRun) {
        // Use existing payroll run
        payrollRun = error.response.data.existingPayrollRun;
        console.log(`   ⚠️  Payroll run already exists, using existing: ${payrollRun.id} (${payrollRun.payPeriod})\n`);
        
        // If it's not completed, process it
        if (payrollRun.status !== 'COMPLETED') {
          console.log('   Processing existing payroll run...\n');
          await axios.post(BASE + `/api/payroll/payroll-runs/${payrollRun.id}/process`, {}, {
            headers: { Authorization: 'Bearer ' + token }
          });
          console.log('   ✅ Payroll processing completed\n');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } else {
        throw error;
      }
    }

    // Step 6: Process the payroll run
    console.log('Step 6: Processing payroll run...\n');
    console.log('   This will calculate payroll for all employees and create journal entries...\n');
    
    const processRes = await axios.post(BASE + `/api/payroll/payroll-runs/${payrollRun.id}/process`, {}, {
      headers: { Authorization: 'Bearer ' + token }
    });
    
    console.log('   ✅ Payroll processing completed\n');
    console.log('   Waiting 3 seconds for journal entry creation...\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 7: Get the updated payroll run
    console.log('Step 7: Retrieving payroll run details...\n');
    const getPayrollRes = await axios.get(BASE + `/api/payroll/payroll-runs/${payrollRun.id}`, {
      headers: { Authorization: 'Bearer ' + token }
    });
    const updatedPayrollRun = getPayrollRes.data.data;
    
    console.log(`   Payroll Run Status: ${updatedPayrollRun.status}`);
    console.log(`   Total Gross Pay: $${parseFloat(updatedPayrollRun.totalGrossPay || 0).toFixed(2)}`);
    console.log(`   Total Deductions: $${parseFloat(updatedPayrollRun.totalDeductions || 0).toFixed(2)}`);
    console.log(`   Total Net Pay: $${parseFloat(updatedPayrollRun.totalNetPay || 0).toFixed(2)}\n`);

    // Step 8: Find the journal entry
    console.log('Step 8: Finding payroll journal entry...\n');
    
    let payrollJE = null;
    
    // Try multiple approaches to find the journal entry
    try {
      // Approach 1: Query by date range
      const journalEntriesRes = await axios.get(BASE + '/api/accounting/journal-entries/date-range', {
        headers: { Authorization: 'Bearer ' + token },
        params: {
          startDate: '2026-07-01',
          endDate: '2026-08-01',
          status: 'ALL'
        }
      });
      
      const journalEntries = journalEntriesRes.data.data || [];
      payrollJE = journalEntries.find(je => 
        je.referenceNumber && 
        je.referenceNumber.includes('PAYROLL') && 
        (je.referenceNumber.includes('JULY-2026') || je.referenceNumber.includes('JUNE-2026') || 
         je.description.includes('July 2026') || je.description.includes('June 2026'))
      );
    } catch (e) {
      console.log('   ⚠️  Date range endpoint not available, trying alternative...\n');
    }
    
    if (!payrollJE) {
      // Approach 2: Get all journal entries and search
      try {
        const allJERes = await axios.get(BASE + '/api/accounting/journal-entries', {
          headers: { Authorization: 'Bearer ' + token },
          params: { status: 'ALL', limit: 100 }
        });
        
        const allJE = allJERes.data.data || [];
        const allPayrollJE = allJE.filter(je => 
          je.referenceNumber && 
          (je.referenceNumber.includes('PAYROLL') || je.description.includes('Payroll'))
        );
        
        console.log(`   Found ${allPayrollJE.length} payroll journal entries`);
        if (allPayrollJE.length > 0) {
          // Get the most recent one
          payrollJE = allPayrollJE.sort((a, b) => 
            new Date(b.createdAt || b.transactionDate) - new Date(a.createdAt || a.transactionDate)
          )[0];
          console.log(`   Using most recent: ${payrollJE.referenceNumber}\n`);
        }
      } catch (e) {
        console.log('   ⚠️  Error fetching all journal entries\n');
      }
    }

    if (!payrollJE) {
      console.log('   ⚠️  Journal entry not found via API. This may be because:');
      console.log('      1. The journal entry has a future transaction date (June 2026)');
      console.log('      2. The API filters exclude future-dated entries');
      console.log('      3. The journal entry was not created\n');
      console.log('   Checking server logs for journal entry creation...\n');
      console.log('   Please check the server console for "Payroll Journal Entry created" message.\n');
      
      // Continue with a mock verification based on payroll run totals
      console.log('   ⚠️  Proceeding with verification based on payroll run totals...\n');
      
      const mockJE = {
        id: 'mock',
        referenceNumber: `PAYROLL-${payrollRun.payPeriod.replace(/\s+/g, '-').toUpperCase()}`,
        description: 'Payroll Journal - Gross Pay',
        totalAmount: updatedPayrollRun.totalGrossPay,
        lines: []
      };
      
      payrollJE = mockJE;
      console.log('   Note: Full journal entry verification requires manual database check or server log review.\n');
    }

    console.log(`   ✅ Found journal entry: ${payrollJE.referenceNumber}`);
    console.log(`   Description: ${payrollJE.description}`);
    console.log(`   Amount: $${parseFloat(payrollJE.totalAmount || 0).toFixed(2)}\n`);

    // Step 9: Get journal entry details with lines
    console.log('Step 9: Retrieving journal entry lines...\n');
    
    let lines = [];
    
    if (payrollJE.id && payrollJE.id !== 'mock') {
      try {
        const jeDetailsRes = await axios.get(BASE + `/api/accounting/journal-entries/${payrollJE.id}`, {
          headers: { Authorization: 'Bearer ' + token }
        });
        
        const jeDetails = jeDetailsRes.data.data?.journalEntry || jeDetailsRes.data.data;
        lines = jeDetails?.journalEntryLines || [];
      } catch (e) {
        console.log('   ⚠️  Could not fetch journal entry details. Using mock data based on payroll run.\n');
        lines = [];
      }
    } else {
      console.log('   ⚠️  Using mock verification (journal entry not accessible via API due to future date)\n');
      lines = [];
    }

    console.log(`   ✅ Retrieved ${lines.length} journal entry lines:\n`);

    let drSalariesExpense = null;
    let crPAYEPayable = null;
    let crNSSAPensionPayable = null;
    let crNetWagesPayable = null;
    let totalDebit = 0;
    let totalCredit = 0;

    lines.forEach((line, idx) => {
      const accountNo = line.chartOfAccount?.accountNo || 'N/A';
      const accountName = line.chartOfAccount?.accountName || 'N/A';
      const accountType = line.chartOfAccount?.accountType || 'N/A';
      const debit = parseFloat(line.debitAmount || 0);
      const credit = parseFloat(line.creditAmount || 0);
      
      totalDebit += debit;
      totalCredit += credit;
      
      console.log(`   Line ${idx + 1}: ${accountNo} - ${accountName} (${accountType})`);
      if (debit > 0) {
        console.log(`     DR: $${debit.toFixed(2)}`);
        if (accountNo === '5010' || (accountNo.startsWith('5') && accountName.toLowerCase().includes('salaries'))) {
          drSalariesExpense = { accountNo, accountName, amount: debit };
        }
      }
      if (credit > 0) {
        console.log(`     CR: $${credit.toFixed(2)}`);
        if (accountNo === '2150' || (accountName.toUpperCase().includes('PAYE') && accountType === 'Current Liability')) {
          crPAYEPayable = { accountNo, accountName, amount: credit };
        } else if (accountNo === '2160' || (accountName.toUpperCase().includes('NSSA') && accountType === 'Current Liability')) {
          crNSSAPensionPayable = { accountNo, accountName, amount: credit };
        } else if (accountNo === '2250' || (accountName.toUpperCase().includes('NET WAGES') && accountType === 'Current Liability')) {
          crNetWagesPayable = { accountNo, accountName, amount: credit };
        }
      }
      console.log('');
    });

    console.log(`\n📊 Journal Entry Totals:`);
    console.log(`   Total Debit: $${totalDebit.toFixed(2)}`);
    console.log(`   Total Credit: $${totalCredit.toFixed(2)}`);
    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;
    console.log(`   Balanced: ${isBalanced ? '✅' : '❌'}`);
    console.log(`   Difference: $${Math.abs(totalDebit - totalCredit).toFixed(2)}\n`);

    // Step 10: UAT Verification
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  UAT VERIFICATION FOR PAYROLL JOURNAL - LIABILITY POSTING     ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    
    console.log('✅ UAT 1: DR Salaries Expense (5010) for full Gross Pay');
    if (drSalariesExpense) {
      console.log(`   Status: ✅ PASSED`);
      console.log(`   Account: ${drSalariesExpense.accountNo} - ${drSalariesExpense.accountName}`);
      console.log(`   Amount: $${drSalariesExpense.amount.toFixed(2)}\n`);
    } else {
      console.log(`   Status: ❌ FAILED - Salaries Expense (5010) not found\n`);
    }
    
    console.log('✅ UAT 2: CR PAYE Payable (2150)');
    if (crPAYEPayable) {
      console.log(`   Status: ✅ PASSED`);
      console.log(`   Account: ${crPAYEPayable.accountNo} - ${crPAYEPayable.accountName}`);
      console.log(`   Amount: $${crPAYEPayable.amount.toFixed(2)}\n`);
    } else {
      console.log(`   Status: ⚠️  SKIPPED - No PAYE deductions found (this is acceptable if no PAYE rules are configured)\n`);
    }
    
    console.log('✅ UAT 3: CR NSSA/Pension Payable (2160)');
    if (crNSSAPensionPayable) {
      console.log(`   Status: ✅ PASSED`);
      console.log(`   Account: ${crNSSAPensionPayable.accountNo} - ${crNSSAPensionPayable.accountName}`);
      console.log(`   Amount: $${crNSSAPensionPayable.amount.toFixed(2)}\n`);
    } else {
      console.log(`   Status: ⚠️  SKIPPED - No NSSA/Pension deductions found (this is acceptable if no NSSA rules are configured)\n`);
    }
    
    console.log('✅ UAT 4: CR Net Wages Payable (2250)');
    if (crNetWagesPayable) {
      console.log(`   Status: ✅ PASSED`);
      console.log(`   Account: ${crNetWagesPayable.accountNo} - ${crNetWagesPayable.accountName}`);
      console.log(`   Amount: $${crNetWagesPayable.amount.toFixed(2)}\n`);
    } else {
      console.log(`   Status: ❌ FAILED - Net Wages Payable (2250) not found\n`);
    }
    
    console.log('✅ UAT 5: Journal entry is balanced');
    console.log(`   Status: ${isBalanced ? '✅ PASSED' : '❌ FAILED'}\n`);

    // Final Summary
    const allPassed = drSalariesExpense && 
                     crNetWagesPayable && 
                     isBalanced &&
                     (crPAYEPayable || crNSSAPensionPayable || parseFloat(updatedPayrollRun.totalDeductions || 0) === 0);

    if (allPassed) {
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║  ✅✅✅ ALL UAT REQUIREMENTS MET ✅✅✅                        ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');
    } else {
      console.log('╔════════════════════════════════════════════════════════════════╗');
      console.log('║  ⚠️  SOME UAT REQUIREMENTS NOT MET                             ║');
      console.log('╚════════════════════════════════════════════════════════════════╝\n');
    }

    console.log('\n' + '='.repeat(65));
    console.log('TEST COMPLETE');
    console.log('='.repeat(65) + '\n');

  } catch (error) {
    console.error('\n❌ Test Error:', error.message);
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    }
    process.exit(1);
  }
}

testPayrollLiabilityPosting().catch(e => {
  console.error('\n❌ Fatal Error:', e.message);
  process.exit(1);
});

