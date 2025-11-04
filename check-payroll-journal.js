const axios = require('axios');
const BASE = 'http://localhost:3004';

async function check() {
  try {
    // Login
    const loginRes = await axios.post(BASE + '/api/auth/login', {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });
    const token = loginRes.data.token;

    // Get all journal entries
    const jeRes = await axios.get(BASE + '/api/accounting/journal-entries', {
      headers: { Authorization: 'Bearer ' + token },
      params: { limit: 100, status: 'POSTED' }
    });

    const entries = jeRes.data.data || [];
    console.log(`\nTotal journal entries found: ${entries.length}`);
    
    // Search for payroll entries
    const payrollEntries = entries.filter(e => 
      e.referenceNumber?.includes('PAYROLL') || 
      e.referenceNumber?.includes('payroll') ||
      e.description?.toLowerCase().includes('payroll') ||
      e.description?.toLowerCase().includes('gross pay')
    );
    
    console.log(`\nPayroll journal entries found: ${payrollEntries.length}\n`);
    
    if (payrollEntries.length > 0) {
      payrollEntries.forEach(e => {
        console.log(`Reference: ${e.referenceNumber}`);
        console.log(`Description: ${e.description}`);
        console.log(`Total Amount: $${parseFloat(e.totalAmount || 0).toFixed(2)}`);
        console.log(`Date: ${e.transactionDate}`);
        console.log('');
      });
      
      // Get details of first payroll entry
      if (payrollEntries[0]) {
        const detailsRes = await axios.get(BASE + '/api/accounting/journal-entries/' + payrollEntries[0].id, {
          headers: { Authorization: 'Bearer ' + token }
        });
        
        const jeDetails = detailsRes.data.data?.journalEntry || detailsRes.data.data;
        const lines = jeDetails?.journalEntryLines || [];
        
        console.log(`Journal Entry Details:`);
        console.log(`Lines: ${lines.length}\n`);
        
        lines.forEach((line, i) => {
          const accountNo = line.chartOfAccount?.accountNo || 'N/A';
          const accountName = line.chartOfAccount?.accountName || 'N/A';
          const debit = parseFloat(line.debitAmount || 0);
          const credit = parseFloat(line.creditAmount || 0);
          
          console.log(`Line ${i + 1}: ${accountNo} - ${accountName}`);
          if (debit > 0) console.log(`  DR: $${debit.toFixed(2)}`);
          if (credit > 0) console.log(`  CR: $${credit.toFixed(2)}`);
          console.log('');
        });
      }
    } else {
      console.log('No payroll journal entries found.');
      console.log('\nRecent entries (last 10):');
      entries.slice(0, 10).forEach(e => {
        console.log(`- ${e.referenceNumber}: ${e.description} ($${parseFloat(e.totalAmount || 0).toFixed(2)})`);
      });
    }
  } catch (e) {
    console.error('Error:', e.message);
    if (e.response) {
      console.error('Status:', e.response.status);
      console.error('Data:', JSON.stringify(e.response.data, null, 2));
    }
  }
}

check();


