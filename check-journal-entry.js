const axios = require('axios');
const BASE = 'http://localhost:3003';

async function checkJournalEntry() {
  const loginRes = await axios.post(BASE + '/api/auth/login', {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  });
  const token = loginRes.data.token;
  const jeId = 'cmhiwo46m000wunecdkf100fl';
  
  const res = await axios.get(BASE + '/api/accounting/journal-entries/' + jeId, {
    headers: { Authorization: 'Bearer ' + token }
  });
  
  const je = res.data.data;
  const lines = je.journalEntryLines || [];
  
  console.log('\n📋 Journal Entry Lines:', lines.length);
  console.log('─────────────────────────────────────────\n');
  
  lines.forEach((l, i) => {
    const acc = l.chartOfAccount || l.account || {};
    const debit = parseFloat(l.debitAmount || 0);
    const credit = parseFloat(l.creditAmount || 0);
    console.log(`${i + 1}. ${debit > 0 ? 'DR' : 'CR'} ${acc.accountNo || 'N/A'} (${acc.accountName || 'N/A'})`);
    if (debit > 0) console.log(`   Debit: $${debit.toFixed(2)}`);
    if (credit > 0) console.log(`   Credit: $${credit.toFixed(2)}`);
    console.log('');
  });
  
  const totalDebits = lines.reduce((sum, l) => sum + parseFloat(l.debitAmount || 0), 0);
  const totalCredits = lines.reduce((sum, l) => sum + parseFloat(l.creditAmount || 0), 0);
  
  console.log('─────────────────────────────────────────');
  console.log(`Total Debits: $${totalDebits.toFixed(2)}`);
  console.log(`Total Credits: $${totalCredits.toFixed(2)}`);
  console.log(`Balanced: ${Math.abs(totalDebits - totalCredits) < 0.01 ? 'Yes' : 'No'}\n`);
}

checkJournalEntry().catch(e => {
  console.error('Error:', e.response?.data || e.message);
});

