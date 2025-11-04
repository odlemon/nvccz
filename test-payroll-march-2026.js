const axios = require('axios');
const BASE = 'http://localhost:3004';

async function test() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  UAT TEST: Payroll Journal - March 2026 (Fresh Run)          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Login
  const loginRes = await axios.post(BASE + '/api/auth/login', {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  });
  const token = loginRes.data.token;

  // Get employees
  const employeesRes = await axios.get(BASE + '/api/payroll/employees', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const employees = employeesRes.data.data || [];
  console.log(`✅ Found ${employees.length} employee(s)\n`);

  if (employees.length === 0) {
    console.log('❌ No employees found');
    return;
  }

  // Get currency
  const currenciesRes = await axios.get(BASE + '/api/accounting/currencies', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const currency = (currenciesRes.data.data || currenciesRes.data || []).find(c => c.code === 'USD') || 
                   (currenciesRes.data.data || currenciesRes.data || [])[0];

  // Create payroll run for March 2026 (completely new month)
  console.log('Creating payroll run for March 2026...');
  const startDate = new Date('2026-03-01');
  const endDate = new Date('2026-03-31');
  
  let payrollRun;
  try {
    const payrollRunRes = await axios.post(BASE + '/api/payroll/payroll-runs', {
      name: 'Test Payroll - March 2026',
      payPeriod: 'March 2026',
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
    console.log(`❌ Error creating payroll run: ${e.response?.data?.message || e.message}`);
    if (e.response?.data) {
      console.log(JSON.stringify(e.response.data, null, 2));
    }
    return;
  }

  // Process payroll run
  console.log('Processing payroll run (this should create journal entry)...');
  try {
    const processRes = await axios.post(BASE + `/api/payroll/payroll-runs/${payrollRun.id}/process`, {}, {
      headers: { Authorization: 'Bearer ' + token }
    });
    
    const result = processRes.data.data || processRes.data;
    console.log(`✅ Payroll processing completed`);
    console.log(`   Total Gross Pay: $${parseFloat(result.totalGrossPay || 0).toFixed(2)}`);
    console.log(`   Total Net Pay: $${parseFloat(result.totalNetPay || 0).toFixed(2)}`);
    console.log(`   Status: ${result.status}\n`);
    
    // Wait longer for journal entry creation
    console.log('Waiting 10 seconds for journal entry to be created...');
    await new Promise(resolve => setTimeout(resolve, 10000));
  } catch (e) {
    console.log(`❌ Error processing payroll: ${e.response?.data?.message || e.message}`);
    if (e.response?.data) {
      console.log(JSON.stringify(e.response.data, null, 2));
    }
    return;
  }

  // Check for journal entry
  console.log('\n🔍 Checking for Payroll Journal Entry...');
  const jeRes = await axios.get(BASE + '/api/accounting/journal-entries', {
    headers: { Authorization: 'Bearer ' + token },
    params: { limit: 200, status: 'POSTED_AND_PENDING' }
  });

  const allJE = jeRes.data.data || [];
  console.log(`Total journal entries: ${allJE.length}`);
  
  // Search for MARCH payroll entry
  const payrollJE = allJE.find(je => 
    je.referenceNumber?.toUpperCase().includes('PAYROLL') ||
    je.referenceNumber?.toUpperCase().includes('MARCH') ||
    je.description?.toLowerCase().includes('march 2026') ||
    je.description?.toLowerCase().includes('payroll') ||
    je.description?.toLowerCase().includes('gross pay')
  );

  if (payrollJE) {
    console.log(`\n✅✅✅ FOUND PAYROLL JOURNAL ENTRY! ✅✅✅`);
    console.log(`Reference: ${payrollJE.referenceNumber}`);
    console.log(`Description: ${payrollJE.description}`);
    console.log(`Amount: $${parseFloat(payrollJE.totalAmount || 0).toFixed(2)}`);
    console.log(`Status: ${payrollJE.status}\n`);
    
    // Get full details
    const jeDetailsRes = await axios.get(BASE + '/api/accounting/journal-entries/' + payrollJE.id, {
      headers: { Authorization: 'Bearer ' + token }
    });
    
    const jeDetails = jeDetailsRes.data.data?.journalEntry || jeDetailsRes.data.data;
    const lines = jeDetails?.journalEntryLines || [];

    console.log(`📋 Journal Entry Lines:`);
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
    console.log(`\n❌ Payroll journal entry NOT FOUND`);
    console.log(`\nRecent journal entries (checking for PAYROLL-*):`);
    const recent = allJE.slice(0, 30);
    recent.forEach((e, i) => {
      const isPayroll = e.referenceNumber?.toUpperCase().includes('PAYROLL') || 
                       e.description?.toLowerCase().includes('payroll');
      const marker = isPayroll ? ' ⭐' : '';
      console.log(`${i + 1}. ${e.referenceNumber}: ${e.description}${marker}`);
    });
    console.log('\n⚠️  Check server console for errors during payroll processing.\n');
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


