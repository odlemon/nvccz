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

async function getTrialBalance(params = {}) {
  try {
    const response = await axios.get(`${BASE_URL}/api/accounting/trial-balance`, {
      params: params,
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

async function main() {
  console.log('════════════════════════════════════════════════════════════════');
  console.log('🔍 TRIAL BALANCE DATE RANGE VERIFICATION');
  console.log('════════════════════════════════════════════════════════════════\n');

  if (!await login()) {
    process.exit(1);
  }

  // Test 1: Cumulative (no date range) - should show all entries up to Nov 17
  console.log('📊 TEST 1: Cumulative Trial Balance (no date range)');
  console.log('   Expected: All entries from beginning to Nov 17, 2025\n');
  const cumulative = await getTrialBalance({ date: '2025-11-17' });
  
  if (cumulative) {
    console.log(`   Total Debits:  $${cumulative.totals?.totalDebits?.toFixed(2) || '0.00'}`);
    console.log(`   Total Credits: $${cumulative.totals?.totalCredits?.toFixed(2) || '0.00'}`);
    console.log(`   Accounts:      ${cumulative.accounts?.length || 0}\n`);
  }

  // Test 2: Single day (Nov 16 only) - should show only Nov 16 entries
  console.log('📊 TEST 2: Period Trial Balance (Nov 16 only)');
  console.log('   Expected: Only entries for Nov 16, 2025\n');
  const singleDay = await getTrialBalance({ 
    startDate: '2025-11-16',
    endDate: '2025-11-16'
  });
  
  if (singleDay) {
    console.log(`   Total Debits:  $${singleDay.totals?.totalDebits?.toFixed(2) || '0.00'}`);
    console.log(`   Total Credits: $${singleDay.totals?.totalCredits?.toFixed(2) || '0.00'}`);
    console.log(`   Accounts:      ${singleDay.accounts?.length || 0}\n`);
  }

  // Test 3: Date range (Nov 15-16) - should show entries for both days
  console.log('📊 TEST 3: Period Trial Balance (Nov 15-16)');
  console.log('   Expected: Entries for Nov 15-16, 2025\n');
  const dateRange = await getTrialBalance({ 
    startDate: '2025-11-15',
    endDate: '2025-11-16'
  });
  
  if (dateRange) {
    console.log(`   Total Debits:  $${dateRange.totals?.totalDebits?.toFixed(2) || '0.00'}`);
    console.log(`   Total Credits: $${dateRange.totals?.totalCredits?.toFixed(2) || '0.00'}`);
    console.log(`   Accounts:      ${dateRange.accounts?.length || 0}\n`);
  }

  console.log('════════════════════════════════════════════════════════════════');
  console.log('📋 SUMMARY');
  console.log('════════════════════════════════════════════════════════════════');
  console.log('\n💡 EXPLANATION:');
  console.log('   - Cumulative Trial Balance (no date range): Shows all entries from');
  console.log('     beginning of time up to the specified date.');
  console.log('   - Period Trial Balance (with date range): Shows only entries within');
  console.log('     the specified date range.');
  console.log('\n   The frontend is likely passing startDate/endDate for a single day,');
  console.log('   which gives period totals instead of cumulative totals.');
  console.log('\n   For month-end reporting, you typically want CUMULATIVE totals.');
  console.log('════════════════════════════════════════════════════════════════\n');
}

main().catch(console.error);

