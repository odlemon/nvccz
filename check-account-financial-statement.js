const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:3000';

// Admin credentials
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

let TOKEN = null;

async function login() {
  try {
    const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });

    if (loginResponse.data.success || loginResponse.data.token) {
      TOKEN = loginResponse.data.token || loginResponse.data.data?.token;
      return true;
    }
    return false;
  } catch (error) {
    console.error('Login error:', error.response?.data || error.message);
    return false;
  }
}

async function checkAccountFinancialStatement() {
  try {
    await login();
    if (!TOKEN) {
      console.log('Failed to login');
      return;
    }

    console.log('🔍 Checking Account Financial Statement Setting\n');

    // Get the Office Equipment account (1100)
    const accountResponse = await axios.get(`${BASE_URL}/api/accounting/chart-of-accounts`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
      params: {
        accountNo: '1100'
      }
    });

    const accounts = accountResponse.data.data || accountResponse.data || [];
    const officeEquipmentAccount = accounts.find(acc => acc.accountNo === '1100') || accounts[0];

    if (!officeEquipmentAccount) {
      console.log('Account 1100 not found');
      return;
    }

    console.log(`Account: ${officeEquipmentAccount.accountNo} - ${officeEquipmentAccount.accountName}`);
    console.log(`Account Type: ${officeEquipmentAccount.accountType}`);
    console.log(`Financial Statement: ${officeEquipmentAccount.financialStatement || 'NOT SET'}`);
    console.log(`Is Active: ${officeEquipmentAccount.isActive}`);
    console.log('');

    // Check what the balance sheet filter expects
    console.log('Balance Sheet Filter:');
    console.log('  - financialStatement must be "Balance Sheet" or "Balance sheet"');
    console.log('  - isActive must be true');
    console.log('');

    if (!officeEquipmentAccount.financialStatement || 
        (officeEquipmentAccount.financialStatement !== 'Balance Sheet' && 
         officeEquipmentAccount.financialStatement !== 'Balance sheet')) {
      console.log('❌ PROBLEM FOUND!');
      console.log(`   The account's financialStatement is "${officeEquipmentAccount.financialStatement || 'NOT SET'}"`);
      console.log(`   But the Balance Sheet only includes accounts with financialStatement = "Balance Sheet" or "Balance sheet"`);
      console.log(`   This is why the asset is not appearing on the balance sheet.`);
      console.log('');
      console.log('   SOLUTION: Update the account to set financialStatement = "Balance Sheet"');
    } else {
      console.log('✅ Account financialStatement is correct');
    }

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('Full error:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

checkAccountFinancialStatement();

