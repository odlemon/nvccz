const axios = require('axios');
const BASE_URL = process.env.API_URL || 'http://localhost:3000';

// Login credentials
const EMAIL = process.env.EMAIL || 'admin@example.com';
const PASSWORD = process.env.PASSWORD || 'password123';

let AUTH_TOKEN = '';

async function login() {
  try {
    console.log('🔐 Logging in...');
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: EMAIL,
      password: PASSWORD
    });
    
    if (response.data.success && response.data.token) {
      AUTH_TOKEN = response.data.token;
      console.log('✅ Logged in successfully\n');
      return true;
    }
    return false;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data?.message || error.message);
    return false;
  }
}

async function getTrialBalance(startDate, endDate) {
  try {
    const response = await axios.get(`${BASE_URL}/api/accounting/trial-balance`, {
      params: {
        date: endDate,
        startDate: startDate,
        endDate: endDate
      },
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`
      }
    });
    
    if (response.data.success) {
      return response.data.data;
    }
    return null;
  } catch (error) {
    console.error('❌ Error fetching trial balance:', error.response?.data?.message || error.message);
    return null;
  }
}

async function getJournalEntries(startDate, endDate) {
  try {
    const response = await axios.get(`${BASE_URL}/api/accounting/journal-entries`, {
      params: {
        startDate: startDate,
        endDate: endDate,
        status: 'POSTED'
      },
      headers: {
        Authorization: `Bearer ${AUTH_TOKEN}`
      }
    });
    
    if (response.data.success) {
      return response.data.data;
    }
    return null;
  } catch (error) {
    console.error('❌ Error fetching journal entries:', error.response?.data?.message || error.message);
    return null;
  }
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🔍 TRIAL BALANCE vs JOURNAL ENTRIES VERIFICATION');
  console.log('════════════════════════════════════════════════════════════════\n');

  if (!await login()) {
    process.exit(1);
  }

  // Test for January 2025
  const startDate = '2025-01-01';
  const endDate = '2025-01-31';
  
  console.log(`📅 Testing Month-End Totals for: ${startDate} to ${endDate}\n`);

  // Get Trial Balance
  console.log('📊 Fetching Trial Balance...');
  const trialBalance = await getTrialBalance(startDate, endDate);
  
  if (!trialBalance) {
    console.error('❌ Failed to fetch trial balance');
    process.exit(1);
  }

  // Get Journal Entries
  console.log('📋 Fetching Journal Entries...');
  const journalEntriesData = await getJournalEntries(startDate, endDate);
  
  if (!journalEntriesData) {
    console.error('❌ Failed to fetch journal entries');
    process.exit(1);
  }

  // Calculate totals from Trial Balance
  const tbTotalDebits = trialBalance.totals?.totalDebits || 0;
  const tbTotalCredits = trialBalance.totals?.totalCredits || 0;
  
  // Calculate totals from Journal Entries
  let jeTotalDebits = 0;
  let jeTotalCredits = 0;
  let jeEntryCount = 0;
  let jeLineCount = 0;

  const journalEntries = journalEntriesData.journalEntries || journalEntriesData.entries || [];
  
  for (const entry of journalEntries) {
    if (entry.status !== 'POSTED') continue;
    if (entry.referenceNumber?.startsWith('VR-') || entry.referenceNumber?.startsWith('REV-')) continue;
    
    // Check if entry has voided/reversed cashbook entries
    if (entry.cashbookEntries && entry.cashbookEntries.some(cb => cb.status === 'VOIDED' || cb.reversedAt)) {
      continue;
    }

    const lines = entry.journalEntryLines || entry.lines || [];
    jeEntryCount++;
    
    for (const line of lines) {
      jeLineCount++;
      const debit = Number(line.debitAmount) || 0;
      const credit = Number(line.creditAmount) || 0;
      jeTotalDebits += debit;
      jeTotalCredits += credit;
    }
  }

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('📊 TRIAL BALANCE TOTALS');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`   Total Debits:  $${tbTotalDebits.toFixed(2)}`);
  console.log(`   Total Credits: $${tbTotalCredits.toFixed(2)}`);
  console.log(`   Is Balanced:   ${trialBalance.totals?.isBalanced ? '✅ YES' : '❌ NO'}`);
  console.log(`   Accounts:      ${trialBalance.accounts?.length || 0}`);

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('📋 JOURNAL ENTRIES TOTALS');
  console.log('════════════════════════════════════════════════════════════════');
  console.log(`   Total Debits:  $${jeTotalDebits.toFixed(2)}`);
  console.log(`   Total Credits: $${jeTotalCredits.toFixed(2)}`);
  console.log(`   Journal Entries: ${jeEntryCount}`);
  console.log(`   Journal Lines:   ${jeLineCount}`);

  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('🔍 COMPARISON');
  console.log('════════════════════════════════════════════════════════════════');
  
  const debitDiff = Math.abs(tbTotalDebits - jeTotalDebits);
  const creditDiff = Math.abs(tbTotalCredits - jeTotalCredits);
  
  const debitMatch = debitDiff < 0.01;
  const creditMatch = creditDiff < 0.01;
  
  console.log(`   Debits Match:  ${debitMatch ? '✅ YES' : '❌ NO'} (Difference: $${debitDiff.toFixed(2)})`);
  console.log(`   Credits Match: ${creditMatch ? '✅ YES' : '❌ NO'} (Difference: $${creditDiff.toFixed(2)})`);
  
  if (debitMatch && creditMatch) {
    console.log('\n✅ SUCCESS: Trial Balance totals match Journal Entry totals!');
  } else {
    console.log('\n❌ ERROR: Trial Balance totals do NOT match Journal Entry totals!');
    console.log('\n   This indicates a problem with how Trial Balance calculates totals.');
    console.log('   The Trial Balance should sum ALL debits and ALL credits from journal entries.');
  }

  console.log('\n════════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);

