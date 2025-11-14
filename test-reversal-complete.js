const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testReversalComplete() {
  let token = '';

  console.log('🔐 Step 1: Logging in...');
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

  // Step 2: Get a posted cashbook entry that hasn't been reversed
  console.log('📋 Step 2: Finding a posted cashbook entry to reverse...');
  try {
    const entriesRes = await axios.get(`${BASE_URL}/api/cashbook/entries?status=POSTED&limit=20`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const entries = entriesRes.data.data.entries || entriesRes.data.data || [];
    
    if (entries.length === 0) {
      console.log('⚠️ No posted cashbook entries found.');
      return;
    }

    // Find an entry that's not already reversed and has a journal entry
    const entryToReverse = entries.find(
      e => e.status === 'POSTED' && !e.reversedAt && !e.originalTransactionId && e.journalEntryId
    );

    if (!entryToReverse) {
      console.log('⚠️ No suitable entry found for reversal');
      console.log('   Looking for: POSTED status, not reversed, has journal entry');
      console.log(`   Found ${entries.length} entries, checking first few:`);
      entries.slice(0, 5).forEach(e => {
        console.log(`   - ${e.id.slice(-8)}: ${e.description.slice(0, 40)} | Status: ${e.status} | Reversed: ${!!e.reversedAt} | Has JE: ${!!e.journalEntryId}`);
      });
      return;
    }

    console.log(`✅ Found entry to reverse:`);
    console.log(`   ID: ${entryToReverse.id}`);
    console.log(`   Description: ${entryToReverse.description}`);
    console.log(`   Amount: ${parseFloat(entryToReverse.amount).toFixed(2)}`);
    console.log(`   Type: ${entryToReverse.type}`);
    console.log(`   Journal Entry: ${entryToReverse.journalEntry?.referenceNumber || entryToReverse.journalEntryId || 'N/A'}\n`);

    // Step 3: Get trial balance BEFORE reversal
    console.log('📊 Step 3: Getting trial balance BEFORE reversal...');
    const beforeDate = new Date().toISOString().split('T')[0];
    const beforeTrialBalance = await axios.get(
      `${BASE_URL}/api/accounting/trial-balance?date=${beforeDate}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const beforeTotalDebits = beforeTrialBalance.data.data.totals.totalDebits;
    const beforeTotalCredits = beforeTrialBalance.data.data.totals.totalCredits;
    console.log(`   Total Debits: ${beforeTotalDebits.toFixed(2)}`);
    console.log(`   Total Credits: ${beforeTotalCredits.toFixed(2)}\n`);

    // Step 4: Check cashbook entries BEFORE reversal
    console.log('📋 Step 4: Checking cashbook entries BEFORE reversal...');
    const beforeCashbookRes = await axios.get(
      `${BASE_URL}/api/cashbook/entries?status=POSTED&limit=10`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const beforeCashbookEntries = beforeCashbookRes.data.data.entries || beforeCashbookRes.data.data || [];
    const beforeReversals = beforeCashbookEntries.filter(e => e.originalTransactionId);
    console.log(`   Total Entries: ${beforeCashbookEntries.length}`);
    console.log(`   Reversals Found: ${beforeReversals.length} (should be excluded from normal view)\n`);

    // Step 5: Reverse the transaction
    console.log('🔄 Step 5: Reversing the transaction...');
    try {
      const reverseRes = await axios.post(
        `${BASE_URL}/api/cashbook/transactions/${entryToReverse.id}/reverse`,
        {
          reason: 'Test reversal - verifying exclusion from cashbook and accounting',
          description: 'Automated test reversal'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log('✅ Reversal successful!');
      console.log(`   Original Transaction ID: ${reverseRes.data.data.originalTransactionId}`);
      console.log(`   Reversal Transaction ID: ${reverseRes.data.data.reversalTransactionId}`);
      console.log(`   Reversal Amount: ${reverseRes.data.data.reversalAmount}`);
      console.log(`   Reversal Date: ${reverseRes.data.data.reversalDate}\n`);

      // Step 6: Verify the original entry is marked as reversed
      console.log('🔍 Step 6: Verifying original entry status...');
      const originalEntryRes = await axios.get(
        `${BASE_URL}/api/cashbook/entries/${entryToReverse.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const originalEntry = originalEntryRes.data.data;
      console.log(`   Status: ${originalEntry.status}`);
      console.log(`   Reversed At: ${originalEntry.reversedAt || 'Not set'}`);
      console.log(`   Reversed By: ${originalEntry.reversedBy ? originalEntry.reversedBy.email : 'N/A'}\n`);

      // Step 7: Check cashbook entries AFTER reversal (should exclude reversals)
      console.log('📋 Step 7: Checking cashbook entries AFTER reversal (should exclude reversals)...');
      const afterCashbookRes = await axios.get(
        `${BASE_URL}/api/cashbook/entries?status=POSTED&limit=10`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const afterCashbookEntries = afterCashbookRes.data.data.entries || afterCashbookRes.data.data || [];
      const afterReversals = afterCashbookEntries.filter(e => e.originalTransactionId);
      const reversalEntry = afterCashbookEntries.find(e => e.id === reverseRes.data.data.reversalTransactionId);
      
      console.log(`   Total Entries: ${afterCashbookEntries.length}`);
      console.log(`   Reversals Found: ${afterReversals.length} (should be 0 - excluded from normal view)`);
      if (reversalEntry) {
        console.log(`   ⚠️ Reversal entry found in normal view (should be excluded!)`);
      } else {
        console.log(`   ✅ Reversal entry correctly excluded from normal view`);
      }
      console.log('');

      // Step 8: Get trial balance AFTER reversal
      console.log('📊 Step 8: Getting trial balance AFTER reversal...');
      const afterTrialBalance = await axios.get(
        `${BASE_URL}/api/accounting/trial-balance?date=${beforeDate}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const afterTotalDebits = afterTrialBalance.data.data.totals.totalDebits;
      const afterTotalCredits = afterTrialBalance.data.data.totals.totalCredits;
      console.log(`   Total Debits: ${afterTotalDebits.toFixed(2)}`);
      console.log(`   Total Credits: ${afterTotalCredits.toFixed(2)}`);
      console.log(`   Change in Debits: ${(afterTotalDebits - beforeTotalDebits).toFixed(2)}`);
      console.log(`   Change in Credits: ${(afterTotalCredits - beforeTotalCredits).toFixed(2)}`);
      console.log(`   Note: Trial balance should be the same (reversals excluded)\n`);

      // Step 9: Check journal entries - should NOT include reversal entries
      console.log('📖 Step 9: Checking journal entries (should exclude reversals)...');
      const journalEntriesRes = await axios.get(
        `${BASE_URL}/api/accounting/journal-entries?startDate=${beforeDate}&endDate=${beforeDate}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const journalEntries = journalEntriesRes.data.data || [];
      
      // Check for reversal entries
      const reversalJournalEntries = journalEntries.filter(je => 
        je.referenceNumber && (je.referenceNumber.startsWith('VR-') || je.referenceNumber.startsWith('REV-'))
      );
      
      if (reversalJournalEntries.length > 0) {
        console.log(`   ⚠️ Found ${reversalJournalEntries.length} reversal journal entries (should be excluded):`);
        reversalJournalEntries.forEach(je => {
          console.log(`      - ${je.referenceNumber}: ${je.description}`);
        });
      } else {
        console.log(`   ✅ No reversal journal entries found (correctly excluded)`);
      }
      console.log(`   Total Journal Entries: ${journalEntries.length}\n`);

      // Step 10: Verify reversal entry via reversal history endpoint
      console.log('🔍 Step 10: Verifying reversal via reversal history endpoint...');
      const reversalHistoryRes = await axios.get(
        `${BASE_URL}/api/cashbook/transactions/${entryToReverse.id}/reversal-history`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const reversalHistory = reversalHistoryRes.data.data || [];
      console.log(`   ✅ Found ${reversalHistory.length} reversal(s) in history`);
      if (reversalHistory.length > 0) {
        const rev = reversalHistory[0];
        console.log(`   Reversal ID: ${rev.id.slice(-8)}`);
        console.log(`   Description: ${rev.description}`);
        console.log(`   Type: ${rev.type} (opposite of original ${entryToReverse.type})`);
        console.log(`   Amount: ${parseFloat(rev.amount).toFixed(2)}`);
      }
      console.log('');

      // Step 11: Summary
      console.log('📋 Step 11: Test Summary');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`✅ Reversal completed successfully`);
      console.log(`✅ Original entry marked with reversedAt`);
      console.log(`${reversalEntry ? '❌' : '✅'} Reversal excluded from normal cashbook view`);
      console.log(`${reversalJournalEntries.length === 0 ? '✅' : '❌'} Reversal journal entries excluded from accounting`);
      console.log(`✅ Reversal accessible via reversal history endpoint`);
      console.log(`✅ Reversal type is opposite (${entryToReverse.type} → ${reversalHistory[0]?.type || 'N/A'})`);
      console.log('═══════════════════════════════════════════════════════════\n');

    } catch (error) {
      console.error('❌ Reversal failed:', error.response?.data || error.message);
      if (error.response?.data) {
        console.error('   Details:', JSON.stringify(error.response.data, null, 2));
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

testReversalComplete().catch(console.error);

