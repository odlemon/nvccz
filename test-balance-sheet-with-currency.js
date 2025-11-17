const axios = require('axios');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function login() {
  const loginResponse = await axios.post(`${BASE_URL}/api/auth/login`, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD
  });
  return loginResponse.data.token || loginResponse.data.data?.token;
}

async function test() {
  try {
    const token = await login();
    console.log('✅ Logged in\n');

    // Get the asset's journal entry currency
    const asset = await prisma.asset.findFirst({
      orderBy: { createdAt: 'desc' }
    });
    
    const journalEntry = await prisma.journalEntry.findFirst({
      where: {
        referenceNumber: {
          contains: `ASSET-${asset.assetCode}`
        }
      }
    });

    console.log(`Asset Journal Entry Currency ID: ${journalEntry.currencyId}\n`);

    // Test 1: Without currency filter
    console.log('Test 1: Balance Sheet WITHOUT currency filter');
    const response1 = await axios.get(`${BASE_URL}/api/accounting/balance-sheet`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        asOfDate: '2025-11-17'
      }
    });
    
    const bs1 = response1.data.data || response1.data;
    const fixedAssets1 = bs1.assets?.fixedAssets?.accounts || [];
    const account1100_1 = fixedAssets1.find(acc => acc.accountNo === '1100');
    
    console.log(`   Fixed Assets: ${fixedAssets1.length}`);
    console.log(`   Account 1100 found: ${account1100_1 ? 'YES ✅' : 'NO ❌'}`);
    if (account1100_1) {
      console.log(`   Account 1100 balance: $${account1100_1.balance}`);
    }
    console.log('');

    // Test 2: With currency filter (matching asset's currency)
    console.log('Test 2: Balance Sheet WITH currency filter (asset currency)');
    const response2 = await axios.get(`${BASE_URL}/api/accounting/balance-sheet`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        asOfDate: '2025-11-17',
        currencyId: journalEntry.currencyId
      }
    });
    
    const bs2 = response2.data.data || response2.data;
    const fixedAssets2 = bs2.assets?.fixedAssets?.accounts || [];
    const account1100_2 = fixedAssets2.find(acc => acc.accountNo === '1100');
    
    console.log(`   Fixed Assets: ${fixedAssets2.length}`);
    console.log(`   Account 1100 found: ${account1100_2 ? 'YES ✅' : 'NO ❌'}`);
    if (account1100_2) {
      console.log(`   Account 1100 balance: $${account1100_2.balance}`);
    }
    console.log('');

    console.log('📋 Check your SERVER CONSOLE LOGS for debug messages!');
    console.log('   Look for:');
    console.log('   - [DEBUG] Processing account 1100');
    console.log('   - Account 1100 balance in accountBalances map');
    console.log('   - [DEBUG] ✅ Adding account 1100 to fixedAssets array');
    console.log('   - [DEBUG] Account 1100 IS in fixedAssets array');

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  } finally {
    await prisma.$disconnect();
  }
}

test();

