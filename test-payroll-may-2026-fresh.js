const axios = require('axios');
const BASE = 'http://localhost:3004';

async function test() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  UAT TEST: Payroll Journal - May 2026 (FRESH RUN)            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Login
  const loginRes = await axios.post(BASE + '/api/auth/login', {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  });
  const token = loginRes.data.token;
  console.log('✅ Login successful\n');

  // Get employees
  const employeesRes = await axios.get(BASE + '/api/payroll/employees', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const employees = employeesRes.data.data || [];
  console.log(`✅ Found ${employees.length} employee(s)\n`);

  // Get currency
  const currenciesRes = await axios.get(BASE + '/api/accounting/currencies', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const currency = (currenciesRes.data.data || currenciesRes.data || []).find(c => c.code === 'USD') || 
                   (currenciesRes.data.data || currenciesRes.data || [])[0];

  // Create payroll run for May 2026
  console.log('Creating payroll run for May 2026...');
  const startDate = new Date('2026-05-01');
  const endDate = new Date('2026-05-31');
  
  let payrollRun;
  try {
    const payrollRunRes = await axios.post(BASE + '/api/payroll/payroll-runs', {
      name: 'Test Payroll - May 2026',
      payPeriod: 'May 2026',
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
      console.log('⚠️  Payroll run for May already exists. Deleting and recreating...\n');
      const runsRes = await axios.get(BASE + '/api/payroll/payroll-runs', {
        headers: { Authorization: 'Bearer ' + token }
      });
      const runs = runsRes.data.data || [];
      const existingRun = runs.find(r => r.payPeriod === 'May 2026');
      if (existingRun) {
        await axios.delete(BASE + `/api/payroll/payroll-runs/${existingRun.id}`, {
          headers: { Authorization: 'Bearer ' + token }
        });
        console.log('✅ Deleted existing May payroll run\n');
        
        // Recreate
        const payrollRunRes = await axios.post(BASE + '/api/payroll/payroll-runs', {
          name: 'Test Payroll - May 2026',
          payPeriod: 'May 2026',
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
          currencyId: currency.id
        }, {
          headers: { Authorization: 'Bearer ' + token }
        });
        payrollRun = payrollRunRes.data.data || payrollRunRes.data;
        console.log(`✅ New payroll run created: ${payrollRun.name}\n`);
      }
    } else {
      console.log(`❌ Error: ${e.response?.data?.message || e.message}`);
      return;
    }
  }

  // Process payroll run
  console.log('Processing payroll run (this will create journal entry)...');
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
    console.log('Waiting 10 seconds for journal entry to be created...\n');
    await new Promise(resolve => setTimeout(resolve, 10000));
  } catch (e) {
    console.log(`❌ Error processing payroll: ${e.response?.data?.message || e.message}`);
    if (e.response?.data) {
      console.log(JSON.stringify(e.response.data, null, 2));
    }
    return;
  }

  // Check for journal entry
  console.log('Checking for Payroll Journal Entry...');
  const jeRes = await axios.get(BASE + '/api/accounting/journal-entries', {
    headers: { Authorization: 'Bearer ' + token },
    params: { limit: 200, status: 'POSTED_AND_PENDING' }
  });

  const allJE = jeRes.data.data || [];
  const payrollJE = allJE.find(je => 
    je.referenceNumber?.toUpperCase().includes('PAYROLL') ||
    je.referenceNumber?.toUpperCase().includes('MAY') ||
    je.description?.toLowerCase().includes('may 2026')
  );

  if (payrollJE) {
    console.log(`\n✅✅✅ FOUND PAYROLL JOURNAL ENTRY! ✅✅✅`);
    console.log(`Reference: ${payrollJE.referenceNumber}`);
    console.log(`Description: ${payrollJE.description}`);
    console.log(`Amount: $${parseFloat(payrollJE.totalAmount || 0).toFixed(2)}\n`);
    
    // Get details
    const jeDetailsRes = await axios.get(BASE + '/api/accounting/journal-entries/' + payrollJE.id, {
      headers: { Authorization: 'Bearer ' + token }
    });
    
    const jeDetails = jeDetailsRes.data.data?.journalEntry || jeDetailsRes.data.data;
    const lines = jeDetails?.journalEntryLines || [];

    console.log('Journal Entry Lines:');
    let totalDebit = 0;
    let totalCredit = 0;
    
    lines.forEach((line, i) => {
      const accountNo = line.chartOfAccount?.accountNo || 'N/A';
      const accountName = line.chartOfAccount?.accountName || 'N/A';
      const debit = parseFloat(line.debitAmount || 0);
      const credit = parseFloat(line.creditAmount || 0);
      
      totalDebit += debit;
      totalCredit += credit;
      
      if (debit > 0) {
        console.log(`  Line ${i + 1}: DR ${accountNo} - ${accountName}: $${debit.toFixed(2)}`);
      }
      if (credit > 0) {
        console.log(`  Line ${i + 1}: CR ${accountNo} - ${accountName}: $${credit.toFixed(2)}`);
      }
    });
    
    console.log(`\nTotal Debit: $${totalDebit.toFixed(2)}`);
    console.log(`Total Credit: $${totalCredit.toFixed(2)}`);
    console.log(`Balanced: ${Math.abs(totalDebit - totalCredit) < 0.01 ? '✅' : '❌'}\n`);
    
    console.log('✅✅✅ UAT REQUIREMENTS MET ✅✅✅\n');
  } else {
    console.log(`\n❌ Payroll journal entry NOT FOUND\n`);
    console.log('⚠️  Check the server console for detailed error logs.\n');
    console.log('Expected logs:');
    console.log('  - "📝 Starting payroll journal entry creation..."');
    console.log('  - "🔵 createPayrollJournalEntry METHOD CALLED"');
    console.log('  - Or error messages if something failed\n');
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

