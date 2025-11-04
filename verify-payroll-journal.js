const axios = require('axios');
const BASE = 'http://localhost:3004';

async function verify() {
  console.log('\n🔍 Verifying Payroll Journal Entry Creation...\n');

  // Login
  const loginRes = await axios.post(BASE + '/api/auth/login', {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  });
  const token = loginRes.data.token;

  // Get all journal entries
  const jeRes = await axios.get(BASE + '/api/accounting/journal-entries', {
    headers: { Authorization: 'Bearer ' + token },
    params: { limit: 200, status: 'POSTED_AND_PENDING' }
  });

  const allJE = jeRes.data.data || [];
  console.log(`Total journal entries: ${allJE.length}\n`);

  // Search for ALL payroll entries
  const payrollEntries = allJE.filter(je => 
    je.referenceNumber?.toUpperCase().includes('PAYROLL') ||
    je.description?.toLowerCase().includes('payroll') ||
    je.description?.toLowerCase().includes('gross pay') ||
    je.description?.toLowerCase().includes('wages payable') ||
    je.description?.toLowerCase().includes('salaries expense')
  );

  console.log(`Payroll-related journal entries found: ${payrollEntries.length}\n`);

  if (payrollEntries.length > 0) {
    payrollEntries.forEach((je, i) => {
      console.log(`${i + 1}. ${je.referenceNumber}`);
      console.log(`   Description: ${je.description}`);
      console.log(`   Amount: $${parseFloat(je.totalAmount || 0).toFixed(2)}`);
      console.log(`   Status: ${je.status}`);
      console.log(`   Date: ${je.transactionDate}`);
      console.log('');
    });

    // Get details of first payroll entry
    if (payrollEntries[0]) {
      const jeDetailsRes = await axios.get(BASE + '/api/accounting/journal-entries/' + payrollEntries[0].id, {
        headers: { Authorization: 'Bearer ' + token }
      });
      
      const jeDetails = jeDetailsRes.data.data?.journalEntry || jeDetailsRes.data.data;
      const lines = jeDetails?.journalEntryLines || [];

      console.log(`\n📋 Details of First Payroll Entry:`);
      console.log(`Reference: ${jeDetails.referenceNumber}`);
      console.log(`Description: ${jeDetails.description}`);
      console.log(`Total Amount: $${parseFloat(jeDetails.totalAmount || 0).toFixed(2)}`);
      console.log(`Lines: ${lines.length}\n`);

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
      console.log(`Balanced: ${Math.abs(totalDebit - totalCredit) < 0.01 ? '✅' : '❌'}\n`);
    }
  } else {
    console.log('❌ No payroll journal entries found.\n');
    console.log('Recent journal entries (last 20):');
    allJE.slice(0, 20).forEach((e, i) => {
      console.log(`${i + 1}. ${e.referenceNumber}: ${e.description} ($${parseFloat(e.totalAmount || 0).toFixed(2)})`);
    });
  }
}

verify().catch(e => {
  console.error('Error:', e.message);
  if (e.response) {
    console.error('Status:', e.response.status);
    console.error('Data:', JSON.stringify(e.response.data, null, 2));
  }
});


