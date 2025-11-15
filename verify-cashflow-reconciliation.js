const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function verifyReconciliation() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ CASH FLOW RECONCILIATION VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════\n');

  let token = '';

  // Login
  console.log('🔐 Logging in...');
  try {
    const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    }, { timeout: 30000 });
    token = loginRes.data.token;
    console.log('✅ Login successful\n');
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data?.message || error.message);
    return;
  }

  // Get Cash Flow Statement (Jan 1 - Dec 31, 2025)
  console.log('📊 Getting Cash Flow Statement (Jan 1 - Dec 31, 2025)...');
  let cashFlowData;
  try {
    const cashFlowRes = await axios.post(
      `${BASE_URL}/api/accounting/cash-flow/generate`,
      {
        startDate: '2025-01-01T00:00:00.000Z',
        endDate: '2025-12-31T00:00:00.000Z'
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 60000
      }
    );
    cashFlowData = cashFlowRes.data.data || cashFlowRes.data;
    console.log('✅ Cash Flow Statement retrieved\n');
  } catch (error) {
    console.error('❌ Failed to get cash flow:', error.response?.data?.message || error.message);
    return;
  }

  // Get Balance Sheet (Dec 31, 2025)
  console.log('📊 Getting Balance Sheet (Dec 31, 2025)...');
  let balanceSheetData;
  try {
    const balanceSheetRes = await axios.post(
      `${BASE_URL}/api/accounting/balance-sheet/generate`,
      {
        asOfDate: '2025-12-31T00:00:00.000Z'
      },
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: 60000
      }
    );
    balanceSheetData = balanceSheetRes.data.data || balanceSheetRes.data;
    console.log('✅ Balance Sheet retrieved\n');
  } catch (error) {
    console.error('❌ Failed to get balance sheet:', error.response?.data?.message || error.message);
    return;
  }

  // Compare values
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📊 RECONCILIATION COMPARISON');
  console.log('═══════════════════════════════════════════════════════════\n');

  const cashFlowEnding = cashFlowData.endingCashBalance || cashFlowData.endingCash;
  const balanceSheetCash = balanceSheetData.assets?.cashAndCashEquivalents;

  console.log('Cash Flow Statement:');
  console.log(`   Beginning Cash: ${cashFlowData.beginningCashBalance?.toFixed(2) || cashFlowData.beginningCash?.toFixed(2) || 'N/A'}`);
  console.log(`   Net Cash Flow: ${cashFlowData.netCashFlow?.toFixed(2) || 'N/A'}`);
  console.log(`   Ending Cash Balance: ${cashFlowEnding?.toFixed(2) || 'N/A'}\n`);

  console.log('Balance Sheet:');
  console.log(`   Cash and Cash Equivalents: ${balanceSheetCash?.toFixed(2) || 'N/A'}\n`);

  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ RECONCILIATION RESULT');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (cashFlowEnding !== undefined && balanceSheetCash !== undefined) {
    const difference = Math.abs(cashFlowEnding - balanceSheetCash);
    console.log(`Cash Flow Ending: ${cashFlowEnding.toFixed(2)}`);
    console.log(`Balance Sheet Cash: ${balanceSheetCash.toFixed(2)}`);
    console.log(`Difference: ${difference.toFixed(2)}\n`);

    if (difference < 0.01) {
      console.log('✅ PERFECT MATCH!');
      console.log('✅ Cash Flow Statement ending balance matches Balance Sheet Cash and Cash Equivalents');
      console.log('✅ Reconciliation is correct!\n');
    } else if (difference < 1.00) {
      console.log('⚠️  Small difference (likely rounding)');
      console.log('   This is acceptable for accounting purposes\n');
    } else {
      console.log('❌ Significant difference detected');
      console.log('   Please review the calculations\n');
    }
  } else {
    console.log('⚠️  Cannot compare - missing data');
    console.log(`   Cash Flow Ending: ${cashFlowEnding !== undefined ? 'Available' : 'Missing'}`);
    console.log(`   Balance Sheet Cash: ${balanceSheetCash !== undefined ? 'Available' : 'Missing'}\n`);
  }

  // Check if cash accounts are in activities
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🔍 CHECKING FOR CASH ACCOUNTS IN ACTIVITIES');
  console.log('═══════════════════════════════════════════════════════════\n');

  const operatingAccounts = cashFlowData.operatingActivities?.accounts || [];
  const investingAccounts = cashFlowData.investingActivities?.accounts || [];
  const financingAccounts = cashFlowData.financingActivities?.accounts || [];

  const cashAccountNumbers = ['1000', '1010', '1020', '1030'];
  const cashAccountNames = ['cash', 'bank'];

  let foundCashInActivities = false;

  // Check operating
  const cashInOperating = operatingAccounts.filter(acc => 
    cashAccountNumbers.includes(acc.accountNo) ||
    cashAccountNames.some(name => acc.accountName?.toLowerCase().includes(name))
  );
  if (cashInOperating.length > 0) {
    console.log('❌ Found cash accounts in Operating Activities:');
    cashInOperating.forEach(acc => console.log(`   - ${acc.accountNo} - ${acc.accountName}`));
    foundCashInActivities = true;
  }

  // Check investing
  const cashInInvesting = investingAccounts.filter(acc => 
    cashAccountNumbers.includes(acc.accountNo) ||
    cashAccountNames.some(name => acc.accountName?.toLowerCase().includes(name))
  );
  if (cashInInvesting.length > 0) {
    console.log('❌ Found cash accounts in Investing Activities:');
    cashInInvesting.forEach(acc => console.log(`   - ${acc.accountNo} - ${acc.accountName}`));
    foundCashInActivities = true;
  }

  // Check financing
  const cashInFinancing = financingAccounts.filter(acc => 
    cashAccountNumbers.includes(acc.accountNo) ||
    cashAccountNames.some(name => acc.accountName?.toLowerCase().includes(name))
  );
  if (cashInFinancing.length > 0) {
    console.log('❌ Found cash accounts in Financing Activities:');
    cashInFinancing.forEach(acc => console.log(`   - ${acc.accountNo} - ${acc.accountName}`));
    foundCashInActivities = true;
  }

  if (!foundCashInActivities) {
    console.log('✅ No cash accounts found in activity sections');
    console.log('✅ Cash accounts are correctly excluded from Operating, Investing, and Financing activities\n');
  }

  console.log('═══════════════════════════════════════════════════════════');
}

verifyReconciliation().catch(console.error);


