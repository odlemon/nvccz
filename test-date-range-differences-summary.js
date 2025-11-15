const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testDateRangeDifferences() {
  let token = '';

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 DATE RANGE DIFFERENCES SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

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

  const yearStart = '2025-01-01';
  const yearEnd = '2025-12-31';
  const asOfDate = yearEnd;

  console.log(`📅 Date Range: ${yearStart} to ${yearEnd}\n`);

  // Get Trial Balance
  const tbRes = await axios.get(`${BASE_URL}/api/accounting/trial-balance`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { date: asOfDate, startDate: yearStart, endDate: yearEnd }
  });
  const tb = tbRes.data.data || tbRes.data;
  const tbTotals = tb.totals || {};
  const tbTotalDebits = parseFloat(tbTotals.totalDebits || 0);
  const tbTotalCredits = parseFloat(tbTotals.totalCredits || 0);

  // Get General Ledger (sum all accounts)
  const accountsRes = await axios.get(`${BASE_URL}/api/accounting/chart-of-accounts`, {
    headers: { Authorization: `Bearer ${token}` },
    params: { limit: 1000 }
  });
  const accounts = accountsRes.data.data || accountsRes.data || [];

  let glTotalDebits = 0;
  let glTotalCredits = 0;
  let glNetDebits = 0; // Net debits (debits - credits) per account
  let glNetCredits = 0; // Net credits (credits - debits) per account

  for (const account of accounts) {
    try {
      const glRes = await axios.get(`${BASE_URL}/api/accounting/gl-ledger-detail`, {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          accountNo: account.accountNo,
          startDate: yearStart,
          endDate: yearEnd
        },
        timeout: 60000
      });

      const glData = glRes.data.data || glRes.data;
      if (glRes.status === 200 && glData && glData.summary) {
        const debits = parseFloat(glData.summary.totalDebits || 0);
        const credits = parseFloat(glData.summary.totalCredits || 0);
        glTotalDebits += debits;
        glTotalCredits += credits;

        // Calculate net balance for this account
        const netBalance = debits - credits;
        if (netBalance > 0) {
          glNetDebits += netBalance;
        } else {
          glNetCredits += Math.abs(netBalance);
        }
      }
    } catch (error) {
      // Skip errors
    }
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 COMPARISON RESULTS');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('TRIAL BALANCE (Net Balances):');
  console.log(`   Total Debits (Net): ${tbTotalDebits.toFixed(2)}`);
  console.log(`   Total Credits (Net): ${tbTotalCredits.toFixed(2)}`);
  console.log(`   Note: Shows NET balances per account (debit OR credit, not both)\n`);

  console.log('GENERAL LEDGER (Gross Totals):');
  console.log(`   Total Debits (Gross): ${glTotalDebits.toFixed(2)}`);
  console.log(`   Total Credits (Gross): ${glTotalCredits.toFixed(2)}`);
  console.log(`   Note: Shows ALL debits and ALL credits separately\n`);

  console.log('GENERAL LEDGER (Net Balances - Calculated):');
  console.log(`   Total Net Debits: ${glNetDebits.toFixed(2)}`);
  console.log(`   Total Net Credits: ${glNetCredits.toFixed(2)}`);
  console.log(`   Note: Calculated from GL by taking net balance per account\n`);

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 DIFFERENCE ANALYSIS');
  console.log('═══════════════════════════════════════════════════════════\n');

  const netDebitDiff = Math.abs(tbTotalDebits - glNetDebits);
  const netCreditDiff = Math.abs(tbTotalCredits - glNetCredits);

  console.log('Trial Balance vs General Ledger (Net Balances):');
  console.log(`   TB Net Debits: ${tbTotalDebits.toFixed(2)}`);
  console.log(`   GL Net Debits: ${glNetDebits.toFixed(2)}`);
  console.log(`   Difference: ${netDebitDiff.toFixed(2)}`);
  if (netDebitDiff > 0.01) {
    console.log(`   ⚠️  MISMATCH: ${netDebitDiff.toFixed(2)} difference\n`);
  } else {
    console.log(`   ✅ MATCH\n`);
  }

  console.log(`   TB Net Credits: ${tbTotalCredits.toFixed(2)}`);
  console.log(`   GL Net Credits: ${glNetCredits.toFixed(2)}`);
  console.log(`   Difference: ${netCreditDiff.toFixed(2)}`);
  if (netCreditDiff > 0.01) {
    console.log(`   ⚠️  MISMATCH: ${netCreditDiff.toFixed(2)} difference\n`);
  } else {
    console.log(`   ✅ MATCH\n`);
  }

  console.log('═══════════════════════════════════════════════════════════');
  console.log('📋 SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('Key Finding:');
  console.log('  - Trial Balance shows NET balances (debit OR credit per account)');
  console.log('  - General Ledger shows GROSS totals (all debits and all credits)');
  console.log('  - When comparing, we should compare NET balances, not gross totals');
  console.log('');

  if (netDebitDiff > 0.01 || netCreditDiff > 0.01) {
    console.log('⚠️  There are still differences in NET balances:');
    console.log(`   - Net Debit Difference: ${netDebitDiff.toFixed(2)}`);
    console.log(`   - Net Credit Difference: ${netCreditDiff.toFixed(2)}`);
    console.log('');
    console.log('This suggests:');
    console.log('  1. Different filtering logic between TB and GL');
    console.log('  2. Different account inclusion');
    console.log('  3. Currency conversion differences');
    console.log('  4. Opening balance handling differences');
  } else {
    console.log('✅ NET balances match! The difference in gross totals is expected.');
    console.log('   Trial Balance and General Ledger are consistent when comparing net balances.');
  }

  console.log('\n✅ Test completed');
}

testDateRangeDifferences().catch(console.error);

