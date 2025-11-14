const axios = require('axios');
const fs = require('fs');
const FormData = require('form-data');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testHistoricalDates() {
  let token = '';

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 TEST: Historical Transaction Dates in CSV Import');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Step 1: Login
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

  // Step 2: Create test CSV with historical dates
  console.log('📝 Step 2: Creating test CSV with historical dates...');
  const lastMonth = new Date();
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  const lastMonthStr = lastMonth.toISOString().split('T')[0];
  
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
  const twoMonthsAgoStr = twoMonthsAgo.toISOString().split('T')[0];
  
  const lastWeek = new Date();
  lastWeek.setDate(lastWeek.getDate() - 7);
  const lastWeekStr = lastWeek.toISOString().split('T')[0];

  const testCSV = `bankName,transactionDate,description,amount,reference,counterpartyType,customerName,vendorName,glAccountNo,vatCode,projectCode,discount
Main Bank Account,${lastMonthStr},Historical Payment - Last Month,1000.00,HIST-001,GL,,,3000,0%,,0
Main Bank Account,${twoMonthsAgoStr},Historical Payment - Two Months Ago,2000.00,HIST-002,GL,,,3000,0%,,0
Main Bank Account,${lastWeekStr},Historical Payment - Last Week,500.00,HIST-003,GL,,,3000,0%,,0`;

  fs.writeFileSync('test-historical-dates.csv', testCSV);
  console.log('✅ Test CSV created with dates:');
  console.log(`   - Last Month: ${lastMonthStr}`);
  console.log(`   - Two Months Ago: ${twoMonthsAgoStr}`);
  console.log(`   - Last Week: ${lastWeekStr}\n`);

  // Step 3: Import CSV
  console.log('📤 Step 3: Importing CSV...');
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream('test-historical-dates.csv'), {
      filename: 'test-historical-dates.csv',
      contentType: 'text/csv'
    });

    const importRes = await axios.post(
      `${BASE_URL}/api/cashbook/batches/import`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Authorization: `Bearer ${token}`
        }
      }
    );

    console.log('✅ CSV imported successfully!');
    const batchId = importRes.data.data.batchId;
    console.log(`   Batch ID: ${batchId}\n`);

    // Step 4: Get batch details and verify dates
    console.log('📊 Step 4: Verifying transaction dates...');
    const batchRes = await axios.get(
      `${BASE_URL}/api/cashbook/batches/${batchId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const batch = batchRes.data.data;
    const transactions = batch.transactions || [];

    console.log(`\n   Found ${transactions.length} transactions:\n`);

    let allDatesCorrect = true;
    for (const txn of transactions) {
      const txnDate = new Date(txn.transactionDate).toISOString().split('T')[0];
      const expectedDate = txn.reference === 'HIST-001' ? lastMonthStr :
                          txn.reference === 'HIST-002' ? twoMonthsAgoStr :
                          txn.reference === 'HIST-003' ? lastWeekStr : null;

      const isCorrect = txnDate === expectedDate;
      if (!isCorrect) allDatesCorrect = false;

      console.log(`   ${txn.reference}: ${txn.description}`);
      console.log(`      Expected Date: ${expectedDate}`);
      console.log(`      Actual Date:   ${txnDate}`);
      console.log(`      Status: ${isCorrect ? '✅ CORRECT' : '❌ INCORRECT'}\n`);
    }

    // Step 5: Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 TEST RESULT SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (allDatesCorrect) {
      console.log('✅ TEST PASSED');
      console.log('   All historical dates were recorded correctly!');
      console.log('   The system preserves the dates from the CSV file.\n');
    } else {
      console.log('❌ TEST FAILED');
      console.log('   Some dates were not recorded correctly.');
      console.log('   The system may be using today\'s date instead of CSV dates.\n');
    }

  } catch (error) {
    console.error('❌ Import failed:', error.response?.data || error.message);
  }
}

testHistoricalDates();

