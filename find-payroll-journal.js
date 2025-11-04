const axios = require('axios');
const BASE = 'http://localhost:3004';

async function find() {
  console.log('\n🔍 Searching for Payroll Journal Entry...\n');

  // Login
  const loginRes = await axios.post(BASE + '/api/auth/login', {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  });
  const token = loginRes.data.token;

  // Get ALL journal entries
  const jeRes = await axios.get(BASE + '/api/accounting/journal-entries', {
    headers: { Authorization: 'Bearer ' + token },
    params: { limit: 500, status: 'ALL' }
  });

  const allJE = jeRes.data.data || [];
  console.log(`Total journal entries: ${allJE.length}\n`);

  // Search for any PAYROLL entries
  const payrollEntries = allJE.filter(je => 
    je.referenceNumber?.toUpperCase().includes('PAYROLL') ||
    je.description?.toLowerCase().includes('payroll') ||
    je.description?.toLowerCase().includes('gross pay')
  );

  console.log(`Found ${payrollEntries.length} PAYROLL-related entries:\n`);
  
  if (payrollEntries.length > 0) {
    payrollEntries.forEach((je, i) => {
      console.log(`${i + 1}. Reference: ${je.referenceNumber}`);
      console.log(`   Description: ${je.description}`);
      console.log(`   Amount: $${parseFloat(je.totalAmount || 0).toFixed(2)}`);
      console.log(`   Status: ${je.status}`);
      console.log(`   Date: ${je.transactionDate}`);
      console.log(`   ID: ${je.id}\n`);
    });

    // Get details of the first one
    if (payrollEntries[0]) {
      console.log('Getting details for first entry...\n');
      const jeDetailsRes = await axios.get(BASE + '/api/accounting/journal-entries/' + payrollEntries[0].id, {
        headers: { Authorization: 'Bearer ' + token }
      });
      
      const jeDetails = jeDetailsRes.data.data?.journalEntry || jeDetailsRes.data.data;
      const lines = jeDetails?.journalEntryLines || [];

      console.log(`Journal Entry Lines (${lines.length}):`);
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
    }
  } else {
    console.log('No PAYROLL entries found. Recent entries (last 20):\n');
    allJE.slice(0, 20).forEach((e, i) => {
      console.log(`${i + 1}. ${e.referenceNumber}: ${e.description}`);
    });
  }
}

find().catch(e => {
  console.error('Error:', e.message);
  if (e.response) {
    console.error('Status:', e.response.status);
    console.error('Data:', JSON.stringify(e.response.data, null, 2));
  }
});

