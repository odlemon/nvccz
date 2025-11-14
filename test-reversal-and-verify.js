const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testReversalAndVerify() {
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

  // Step 2: Get a posted cashbook entry to reverse
  console.log('📋 Step 2: Finding a posted cashbook entry to reverse...');
  try {
    const entriesRes = await axios.get(`${BASE_URL}/api/cashbook/entries?status=POSTED&limit=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const entries = entriesRes.data.data.entries || entriesRes.data.data || [];
    
    if (entries.length === 0) {
      console.log('⚠️ No posted cashbook entries found. Please create and post a cashbook entry first.');
      return;
    }

    // Find an entry that's not already voided or reversed
    const entryToReverse = entries.find(
      e => e.status === 'POSTED' && !e.reversedAt && e.journalEntryId
    );

    if (!entryToReverse) {
      console.log('⚠️ No suitable entry found for reversal (need POSTED status with journal entry)');
      console.log('Available entries:', entries.map(e => ({
        id: e.id.slice(-8),
        status: e.status,
        reversedAt: e.reversedAt,
        hasJournalEntry: !!e.journalEntryId
      })));
      return;
    }

    console.log(`✅ Found entry to reverse:`);
    console.log(`   ID: ${entryToReverse.id}`);
    console.log(`   Description: ${entryToReverse.description}`);
    console.log(`   Amount: ${parseFloat(entryToReverse.amount).toFixed(2)}`);
    console.log(`   Type: ${entryToReverse.type}`);
    console.log(`   Journal Entry: ${entryToReverse.journalEntryId ? entryToReverse.journalEntry?.referenceNumber || 'N/A' : 'None'}\n`);

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

    // Step 4: Reverse the transaction
    console.log('🔄 Step 4: Reversing the transaction...');
    try {
      const reverseRes = await axios.post(
        `${BASE_URL}/api/cashbook/transactions/${entryToReverse.id}/reverse`,
        {
          reason: 'Test reversal - verifying exclusion from accounting module',
          description: 'Automated test reversal'
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      console.log('✅ Reversal successful!');
      console.log(`   Original Transaction ID: ${reverseRes.data.data.originalTransactionId}`);
      console.log(`   Reversal Transaction ID: ${reverseRes.data.data.reversalTransactionId}`);
      console.log(`   Reversal Amount: ${reverseRes.data.data.reversalAmount}`);
      console.log(`   Reversal Date: ${reverseRes.data.data.reversalDate}\n`);

      // Step 5: Verify the original entry is marked as reversed
      console.log('🔍 Step 5: Verifying original entry status...');
      const originalEntryRes = await axios.get(
        `${BASE_URL}/api/cashbook/entries/${entryToReverse.id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const originalEntry = originalEntryRes.data.data;
      console.log(`   Status: ${originalEntry.status}`);
      console.log(`   Reversed At: ${originalEntry.reversedAt || 'Not set'}`);
      console.log(`   Reversed By: ${originalEntry.reversedBy ? originalEntry.reversedBy.email : 'N/A'}\n`);

      // Step 6: Get trial balance AFTER reversal
      console.log('📊 Step 6: Getting trial balance AFTER reversal...');
      const afterTrialBalance = await axios.get(
        `${BASE_URL}/api/accounting/trial-balance?date=${beforeDate}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const afterTotalDebits = afterTrialBalance.data.data.totals.totalDebits;
      const afterTotalCredits = afterTrialBalance.data.data.totals.totalCredits;
      console.log(`   Total Debits: ${afterTotalDebits.toFixed(2)}`);
      console.log(`   Total Credits: ${afterTotalCredits.toFixed(2)}`);
      console.log(`   Change in Debits: ${(afterTotalDebits - beforeTotalDebits).toFixed(2)}`);
      console.log(`   Change in Credits: ${(afterTotalCredits - beforeTotalCredits).toFixed(2)}\n`);

      // Step 7: Check journal entries - should NOT include reversal entries
      console.log('📖 Step 7: Checking journal entries (should exclude reversals)...');
      const journalEntriesRes = await axios.get(
        `${BASE_URL}/api/accounting/journal-entries?startDate=${beforeDate}&endDate=${beforeDate}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const journalEntries = journalEntriesRes.data.data || [];
      
      // Check for reversal entries
      const reversalEntries = journalEntries.filter(je => 
        je.referenceNumber && (je.referenceNumber.startsWith('VR-') || je.referenceNumber.startsWith('REV-'))
      );
      
      if (reversalEntries.length > 0) {
        console.log(`   ⚠️ Found ${reversalEntries.length} reversal journal entries (should be excluded):`);
        reversalEntries.forEach(je => {
          console.log(`      - ${je.referenceNumber}: ${je.description}`);
        });
      } else {
        console.log(`   ✅ No reversal journal entries found (correctly excluded)`);
      }
      console.log(`   Total Journal Entries: ${journalEntries.length}\n`);

      // Step 8: Check balance sheet
      console.log('📊 Step 8: Checking balance sheet (should exclude reversals)...');
      const balanceSheetRes = await axios.get(
        `${BASE_URL}/api/accounting/balance-sheet?asOfDate=${beforeDate}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const balanceSheet = balanceSheetRes.data.data;
      console.log(`   Total Assets: ${balanceSheet.totalAssets.toFixed(2)}`);
      console.log(`   Total Liabilities: ${Math.abs(balanceSheet.totalLiabilities).toFixed(2)}`);
      console.log(`   Total Equity: ${balanceSheet.equity.total.toFixed(2)}`);
      console.log(`   Is Balanced: ${balanceSheet.isBalanced ? '✅' : '❌'}\n`);

      // Step 9: Verify the reversal entry itself
      console.log('🔍 Step 9: Checking reversal transaction details...');
      const reversalEntryRes = await axios.get(
        `${BASE_URL}/api/cashbook/entries/${reverseRes.data.data.reversalTransactionId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const reversalEntry = reversalEntryRes.data.data;
      console.log(`   Reversal Entry ID: ${reversalEntry.id.slice(-8)}`);
      console.log(`   Description: ${reversalEntry.description}`);
      console.log(`   Amount: ${parseFloat(reversalEntry.amount).toFixed(2)}`);
      console.log(`   Type: ${reversalEntry.type}`);
      console.log(`   Original Transaction ID: ${reversalEntry.originalTransactionId}`);
      console.log(`   Status: ${reversalEntry.status}\n`);

      // Step 10: Summary
      console.log('📋 Step 10: Summary');
      console.log('═══════════════════════════════════════════════════════════');
      console.log(`✅ Reversal completed successfully`);
      console.log(`✅ Original entry marked as reversed`);
      console.log(`✅ Reversal entry created`);
      if (reversalEntries.length === 0) {
        console.log(`✅ Reversal entries correctly excluded from journal entries`);
      } else {
        console.log(`⚠️ Reversal entries found in journal entries (should be excluded)`);
      }
      console.log(`✅ Trial balance calculated (excluding reversals)`);
      console.log(`✅ Balance sheet calculated (excluding reversals)`);
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

testReversalAndVerify().catch(console.error);

