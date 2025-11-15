const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function checkJournalEntries() {
  let token = '';

  console.log('Checking journal entries...\n');

  // Login
  try {
    const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    token = loginRes.data.token;
    console.log('✅ Login successful\n');
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    return;
  }

  // Get journal entries
  try {
    const journalRes = await axios.get(`${BASE_URL}/api/accounting/journal-entries`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit: 10 }
    });

    const entries = journalRes.data.data || journalRes.data || [];
    console.log(`Found ${entries.length} journal entries (showing first 10):\n`);

    entries.forEach((entry, idx) => {
      console.log(`${idx + 1}. ${entry.referenceNumber || entry.id}`);
      console.log(`   Date: ${entry.transactionDate}`);
      console.log(`   Status: ${entry.status}`);
      console.log(`   Lines: ${entry.entries?.length || entry.journalEntryLines?.length || 0}`);
      if (entry.cashbookEntries && entry.cashbookEntries.length > 0) {
        console.log(`   Cashbook Entries: ${entry.cashbookEntries.length}`);
        entry.cashbookEntries.forEach(cb => {
          console.log(`     - ${cb.id}: ${cb.status}${cb.reversedAt ? ' (REVERSED)' : ''}`);
        });
      }
      console.log('');
    });

    // Check totals
    const postedEntries = entries.filter(e => e.status === 'POSTED');
    const voidEntries = entries.filter(e => e.status === 'VOID');
    const pendingEntries = entries.filter(e => e.status === 'PENDING');

    console.log(`\nSummary:`);
    console.log(`  Total: ${entries.length}`);
    console.log(`  POSTED: ${postedEntries.length}`);
    console.log(`  VOID: ${voidEntries.length}`);
    console.log(`  PENDING: ${pendingEntries.length}`);

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

checkJournalEntries();

