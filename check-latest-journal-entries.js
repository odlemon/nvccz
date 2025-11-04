const axios = require('axios');
const BASE = 'http://localhost:3004';

async function check() {
  console.log('\n🔍 Checking Latest Journal Entries...\n');

  // Login
  const loginRes = await axios.post(BASE + '/api/auth/login', {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  });
  const token = loginRes.data.token;

  // Get journal entries sorted by date (most recent first)
  const jeRes = await axios.get(BASE + '/api/accounting/journal-entries', {
    headers: { Authorization: 'Bearer ' + token },
    params: { limit: 50, status: 'ALL' }
  });

  const allJE = jeRes.data.data || [];
  console.log(`Total entries returned: ${allJE.length}\n`);
  console.log('Most recent 30 entries:\n');

  // Sort by date if possible, or just show the first ones
  allJE.slice(0, 30).forEach((je, i) => {
    const ref = je.referenceNumber || 'N/A';
    const desc = je.description || 'N/A';
    const amount = parseFloat(je.totalAmount || 0).toFixed(2);
    const date = je.transactionDate || je.createdAt || 'N/A';
    
    // Check if it's payroll-related
    const isPayroll = ref.toUpperCase().includes('PAYROLL') || 
                     desc.toLowerCase().includes('payroll') ||
                     desc.toLowerCase().includes('gross pay');
    const marker = isPayroll ? ' ⭐ PAYROLL' : '';
    
    console.log(`${i + 1}. ${ref}: ${desc} ($${amount})${marker}`);
    console.log(`   Date: ${date}`);
    console.log(`   ID: ${je.id}`);
    console.log('');
  });

  // Also try to find by searching for "MAY" in description
  console.log('\nSearching for entries with "MAY" in description...\n');
  const mayEntries = allJE.filter(je => 
    je.description?.toLowerCase().includes('may') ||
    je.referenceNumber?.toUpperCase().includes('MAY')
  );

  if (mayEntries.length > 0) {
    console.log(`Found ${mayEntries.length} entries with "MAY":\n`);
    mayEntries.forEach((je, i) => {
      console.log(`${i + 1}. ${je.referenceNumber}: ${je.description}`);
      console.log(`   Amount: $${parseFloat(je.totalAmount || 0).toFixed(2)}`);
      console.log(`   Status: ${je.status}`);
      console.log(`   ID: ${je.id}\n`);
    });
  } else {
    console.log('No entries with "MAY" found.\n');
  }
}

check().catch(e => {
  console.error('Error:', e.message);
  if (e.response) {
    console.error('Status:', e.response.status);
  }
});

