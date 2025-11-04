const axios = require('axios');
const BASE = 'http://localhost:3004';

async function check() {
  const loginRes = await axios.post(BASE + '/api/auth/login', {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  });
  const token = loginRes.data.token;

  // Get existing payroll runs
  const runsRes = await axios.get(BASE + '/api/payroll/payroll-runs', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const runs = runsRes.data.data || [];
  
  console.log(`\nFound ${runs.length} payroll run(s)\n`);
  
  if (runs.length > 0) {
    const latestRun = runs[0];
    console.log(`Latest Payroll Run:`);
    console.log(`  ID: ${latestRun.id}`);
    console.log(`  Name: ${latestRun.name}`);
    console.log(`  Period: ${latestRun.payPeriod}`);
    console.log(`  Status: ${latestRun.status}`);
    console.log(`  Total Gross Pay: $${parseFloat(latestRun.totalGrossPay || 0).toFixed(2)}`);
    console.log(`  Total Net Pay: $${parseFloat(latestRun.totalNetPay || 0).toFixed(2)}\n`);

    // Check for journal entry
    const jeRes = await axios.get(BASE + '/api/accounting/journal-entries', {
      headers: { Authorization: 'Bearer ' + token },
      params: { limit: 100, status: 'POSTED' }
    });

    const entries = jeRes.data.data || [];
    const payrollJE = entries.find(e => 
      e.referenceNumber?.includes('PAYROLL') ||
      e.description?.toLowerCase().includes('payroll') ||
      e.description?.toLowerCase().includes('gross pay') ||
      (e.description?.includes(latestRun.name) && e.description?.toLowerCase().includes('payroll'))
    );

    if (payrollJE) {
      console.log(`✅ Found journal entry: ${payrollJE.referenceNumber}`);
      console.log(`   Description: ${payrollJE.description}\n`);
      
      // Get details
      const jeDetailsRes = await axios.get(BASE + '/api/accounting/journal-entries/' + payrollJE.id, {
        headers: { Authorization: 'Bearer ' + token }
      });
      
      const jeDetails = jeDetailsRes.data.data?.journalEntry || jeDetailsRes.data.data;
      const lines = jeDetails?.journalEntryLines || [];

      console.log(`Journal Entry Lines:`);
      lines.forEach((line, i) => {
        const accountNo = line.chartOfAccount?.accountNo || 'N/A';
        const accountName = line.chartOfAccount?.accountName || 'N/A';
        const debit = parseFloat(line.debitAmount || 0);
        const credit = parseFloat(line.creditAmount || 0);
        
        if (debit > 0) {
          console.log(`  Line ${i + 1}: DR ${accountNo} - ${accountName}: $${debit.toFixed(2)}`);
        }
        if (credit > 0) {
          console.log(`  Line ${i + 1}: CR ${accountNo} - ${accountName}: $${credit.toFixed(2)}`);
        }
      });
      
      const totalDebit = lines.reduce((sum, l) => sum + parseFloat(l.debitAmount || 0), 0);
      const totalCredit = lines.reduce((sum, l) => sum + parseFloat(l.creditAmount || 0), 0);
      
      console.log(`\nTotal Debit: $${totalDebit.toFixed(2)}`);
      console.log(`Total Credit: $${totalCredit.toFixed(2)}`);
      console.log(`Balanced: ${Math.abs(totalDebit - totalCredit) < 0.01 ? '✅' : '❌'}`);
      
      const expectedGrossPay = parseFloat(latestRun.totalGrossPay || 0);
      const drAmount = parseFloat(lines.find(l => parseFloat(l.debitAmount || 0) > 0)?.debitAmount || 0);
      
      if (Math.abs(drAmount - expectedGrossPay) < 0.01) {
        console.log(`✅ DR amount matches Gross Pay: $${expectedGrossPay.toFixed(2)}\n`);
      } else {
        console.log(`⚠️  DR amount ($${drAmount.toFixed(2)}) ≠ Gross Pay ($${expectedGrossPay.toFixed(2)})\n`);
      }
    } else {
      console.log(`❌ No journal entry found for this payroll run\n`);
    }
  }
}

check().catch(e => {
  console.error('Error:', e.message);
  if (e.response) console.error('Data:', JSON.stringify(e.response.data, null, 2));
});


