const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function setupTestBank() {
  let token = '';

  console.log('🔐 Logging in...');
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

  // Step 1: Check if GL Account 1100 exists
  console.log('📋 Step 1: Checking if GL Account 1100 exists...');
  try {
    const glAccountsRes = await axios.get(`${BASE_URL}/api/accounting/chart-of-accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    const glAccounts = glAccountsRes.data.data || [];
    let account1100 = glAccounts.find(a => a.accountNo === '1100');
    
    if (!account1100) {
      console.log('⚠️ GL Account 1100 not found. Creating it...');
      // Create GL Account 1100
      const createAccountRes = await axios.post(
        `${BASE_URL}/api/accounting/chart-of-accounts`,
        {
          accountNo: '1100',
          accountName: 'Bank Account - ZWL',
          accountType: 'Current Asset',
          financialStatement: 'Balance Sheet',
          isActive: true
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      account1100 = createAccountRes.data.data;
      console.log('✅ GL Account 1100 created\n');
    } else {
      console.log('✅ GL Account 1100 exists\n');
    }
    
    // Step 2: Check if ZWL currency exists
    console.log('💱 Step 2: Checking if ZWL currency exists...');
    const currenciesRes = await axios.get(`${BASE_URL}/api/accounting/currencies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    const currencies = currenciesRes.data.data || [];
    let zwlCurrency = currencies.find(c => c.code === 'ZWL' || c.code === 'ZW$');
    
    if (!zwlCurrency) {
      console.log('⚠️ ZWL currency not found. Creating it...');
      const createCurrencyRes = await axios.post(
        `${BASE_URL}/api/accounting/currencies`,
        {
          code: 'ZWL',
          name: 'Zimbabwe Dollar',
          symbol: 'ZW$',
          isActive: true
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      zwlCurrency = createCurrencyRes.data.data;
      console.log('✅ ZWL currency created\n');
    } else {
      console.log('✅ ZWL currency exists\n');
    }
    
    // Step 3: Check if bank account with GL 1100 exists
    console.log('🏦 Step 3: Checking if bank account with GL 1100 exists...');
    const banksRes = await axios.get(`${BASE_URL}/api/cashbook/banks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    const banks = banksRes.data.data || [];
    const bank1100 = banks.find(b => b.glAccount && b.glAccount.accountNo === '1100');
    
    if (!bank1100) {
      console.log('⚠️ Bank account with GL 1100 not found. Creating it...');
      const createBankRes = await axios.post(
        `${BASE_URL}/api/cashbook/banks`,
        {
          name: 'Bank Account - ZWL',
          accountNumber: '1100-001',
          glAccountId: account1100.id,
          currencyId: zwlCurrency.id,
          isActive: true
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log('✅ Bank account created with GL 1100\n');
      console.log('Bank Details:');
      console.log(JSON.stringify(createBankRes.data.data, null, 2));
    } else {
      console.log('✅ Bank account with GL 1100 already exists\n');
    }
    
    console.log('✅ Setup complete! Ready for testing.\n');
    
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Details:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

setupTestBank().catch(console.error);

