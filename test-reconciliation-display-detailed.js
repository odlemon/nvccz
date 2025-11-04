const axios = require('axios');
const BASE = 'http://localhost:3003';

async function test() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  DETAILED TEST: Reconciliation Display Real-time Updates    ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  // Login
  const loginRes = await axios.post(BASE + '/api/auth/login', {
    email: 'admin@nvccz.co.zw',
    password: 'admin123'
  });
  const token = loginRes.data.token;

  // Get Bank account
  const banksRes = await axios.get(BASE + '/api/cashbook/banks', {
    headers: { Authorization: 'Bearer ' + token }
  });
  const bankId = banksRes.data.data?.[0]?.id;
  const periodEndDate = new Date().toISOString().split('T')[0];

  console.log('Initial state (no items ticked):');
  const display1 = await axios.get(BASE + '/api/cashbook/reconciliation/display', {
    headers: { Authorization: 'Bearer ' + token },
    params: { bankId, periodEndDate }
  });
  
  const data1 = display1.data.data;
  console.log(`   GL Bank Balance: $${data1.glBankBalance.toFixed(2)}`);
  console.log(`   Total Un-ticked Items: $${data1.totalUntickedItems.toFixed(2)}`);
  console.log(`   Cleared Balance: $${data1.clearedBalance.toFixed(2)}`);
  console.log(`   Total Entries: ${data1.unreconciledEntries.length}\n`);

  // Get first few entries and their amounts
  const firstFewEntries = data1.unreconciledEntries.slice(0, 5);
  console.log('First 5 entries:');
  firstFewEntries.forEach((entry, i) => {
    console.log(`   ${i + 1}. ${entry.type} - $${entry.amount.toFixed(2)} (Signed: $${entry.signedAmount.toFixed(2)}) - ${entry.description?.substring(0, 30)}`);
  });
  console.log();

  // Calculate expected total if we tick the first entry
  const firstEntryAmount = firstFewEntries[0]?.signedAmount || 0;
  const expectedNewTotal = data1.totalUntickedItems - firstEntryAmount;
  const expectedNewCleared = data1.glBankBalance - expectedNewTotal;

  console.log(`Ticking first entry (${firstFewEntries[0]?.type}, $${Math.abs(firstEntryAmount).toFixed(2)}):`);
  console.log(`   Expected Total Un-ticked: $${expectedNewTotal.toFixed(2)} (was $${data1.totalUntickedItems.toFixed(2)})`);
  console.log(`   Expected Cleared Balance: $${expectedNewCleared.toFixed(2)} (was $${data1.clearedBalance.toFixed(2)})\n`);

  // Tick the first entry
  // Pass as JSON string array which the controller can parse
  const tickedIds = [firstFewEntries[0].id];
  
  const display2 = await axios.get(BASE + '/api/cashbook/reconciliation/display', {
    headers: { Authorization: 'Bearer ' + token },
    params: {
      bankId,
      periodEndDate,
      tickedEntryIds: JSON.stringify(tickedIds) // Pass as JSON string
    }
  });

  const data2 = display2.data.data;
  console.log('After ticking first entry:');
  console.log(`   GL Bank Balance: $${data2.glBankBalance.toFixed(2)} (unchanged)`);
  console.log(`   Total Un-ticked Items: $${data2.totalUntickedItems.toFixed(2)}`);
  console.log(`   Cleared Balance: $${data2.clearedBalance.toFixed(2)}\n`);

  // Verify
  const totalDiff = Math.abs(data2.totalUntickedItems - expectedNewTotal);
  const clearedDiff = Math.abs(data2.clearedBalance - expectedNewCleared);

  if (totalDiff < 0.01 && clearedDiff < 0.01) {
    console.log('✅ TEST PASSED: Real-time calculation is working correctly!');
    console.log(`   Total Un-ticked Items updated correctly (diff: $${totalDiff.toFixed(2)})`);
    console.log(`   Cleared Balance updated correctly (diff: $${clearedDiff.toFixed(2)})\n`);
  } else {
    console.log('❌ TEST FAILED: Calculation mismatch');
    console.log(`   Total Un-ticked Items: Expected $${expectedNewTotal.toFixed(2)}, Got $${data2.totalUntickedItems.toFixed(2)}`);
    console.log(`   Cleared Balance: Expected $${expectedNewCleared.toFixed(2)}, Got $${data2.clearedBalance.toFixed(2)}\n`);
  }

  // Test with multiple entries
  if (firstFewEntries.length >= 3) {
    console.log('Testing with 3 entries ticked:');
    const tickedIds3 = firstFewEntries.slice(0, 3).map(e => e.id);
    const sumTicked = firstFewEntries.slice(0, 3).reduce((sum, e) => sum + e.signedAmount, 0);
    const expectedTotal3 = data1.totalUntickedItems - sumTicked;
    const expectedCleared3 = data1.glBankBalance - expectedTotal3;

    const display3 = await axios.get(BASE + '/api/cashbook/reconciliation/display', {
      headers: { Authorization: 'Bearer ' + token },
      params: {
        bankId,
        periodEndDate,
        tickedEntryIds: JSON.stringify(tickedIds3) // Pass as JSON string
      }
    });

    const data3 = display3.data.data;
    console.log(`   Total Un-ticked Items: $${data3.totalUntickedItems.toFixed(2)} (expected: $${expectedTotal3.toFixed(2)})`);
    console.log(`   Cleared Balance: $${data3.clearedBalance.toFixed(2)} (expected: $${expectedCleared3.toFixed(2)})`);
    
    const diff3 = Math.abs(data3.totalUntickedItems - expectedTotal3);
    const clearedDiff3 = Math.abs(data3.clearedBalance - expectedCleared3);
    
    if (diff3 < 0.01 && clearedDiff3 < 0.01) {
      console.log('   ✅ Calculation correct for multiple entries\n');
    } else {
      console.log('   ❌ Calculation mismatch for multiple entries\n');
    }
  }
}

test().catch(e => {
  console.error('\n❌ Test Error:', e.message);
  if (e.response) {
    console.error('Status:', e.response.status);
    console.error('Data:', JSON.stringify(e.response.data, null, 2));
  }
  process.exit(1);
});

