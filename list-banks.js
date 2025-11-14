const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function listBanks() {
  let token = '';

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🏦 AVAILABLE BANKS FOR GL DETAIL REPORT TESTING');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Step 1: Login
  console.log('🔐 Logging in...');
  try {
    const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    });
    token = loginRes.data.token;
    console.log('✅ Login successful\n');
  } catch (error) {
    console.error('❌ Login failed:');
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', error.response.data);
    } else if (error.request) {
      console.error('   No response received. Is the server running?');
      console.error('   URL:', error.config?.url);
    } else {
      console.error('   Error:', error.message);
    }
    return;
  }

  // Step 2: Get available banks
  console.log('📋 Fetching banks...\n');
  try {
    const banksRes = await axios.get(`${BASE_URL}/api/cashbook/banks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const banks = banksRes.data.data || [];
    
    if (banks.length === 0) {
      console.log('❌ No banks found. Please create a bank account first.');
      return;
    }

    console.log(`✅ Found ${banks.length} bank(s):\n`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 BANK LIST');
    console.log('═══════════════════════════════════════════════════════════\n');

    banks.forEach((bank, index) => {
      console.log(`${index + 1}. ${bank.name}`);
      console.log(`   Bank ID: ${bank.id}`);
      console.log(`   Account Number: ${bank.accountNumber || 'N/A'}`);
      console.log(`   GL Account: ${bank.glAccount?.accountNo || 'N/A'} - ${bank.glAccount?.accountName || 'N/A'}`);
      console.log(`   Currency: ${bank.currency?.code || 'N/A'} (${bank.currency?.name || 'N/A'})`);
      console.log(`   Status: ${bank.isActive ? '✅ Active' : '❌ Inactive'}`);
      
      if (bank.glAccount) {
        console.log(`   ✅ Ready for GL Detail Report`);
        console.log(`   Test URL: GET /api/accounting/gl-ledger-detail/bank/${bank.id}`);
      } else {
        console.log(`   ⚠️  No GL Account configured - cannot generate GL Detail Report`);
      }
      console.log('');
    });

    console.log('═══════════════════════════════════════════════════════════');
    console.log('🧪 TESTING EXAMPLES');
    console.log('═══════════════════════════════════════════════════════════\n');

    const banksWithGL = banks.filter(b => b.glAccount);
    
    if (banksWithGL.length > 0) {
      console.log('Example 1: Test with first bank (current year):');
      console.log(`   GET /api/accounting/gl-ledger-detail/bank/${banksWithGL[0].id}\n`);
      
      console.log('Example 2: Test with specific date range:');
      console.log(`   GET /api/accounting/gl-ledger-detail/bank/${banksWithGL[0].id}?startDate=2025-01-01&endDate=2025-12-31\n`);
      
      console.log('Example 3: Test with bank ID 1100 (if available):');
      const bank1100 = banks.find(b => b.glAccount?.accountNo === '1100');
      if (bank1100) {
        console.log(`   GET /api/accounting/gl-ledger-detail/bank/${bank1100.id}\n`);
      } else {
        console.log(`   ⚠️  No bank with GL account 1100 found\n`);
      }
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 QUICK REFERENCE - BANK IDs');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    banks.forEach((bank, index) => {
      if (bank.glAccount) {
        console.log(`${bank.name.padEnd(30)} | ID: ${bank.id} | GL: ${bank.glAccount.accountNo}`);
      }
    });

    console.log('\n═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

listBanks();

