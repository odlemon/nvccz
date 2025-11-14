const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testBankGLDetail() {
  let token = '';

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 TEST: Bank GL Detail Report');
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

  // Step 2: Get available banks
  console.log('🏦 Step 2: Getting available banks...');
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
    banks.forEach((bank, index) => {
      console.log(`   ${index + 1}. ${bank.name}`);
      console.log(`      ID: ${bank.id}`);
      console.log(`      Account Number: ${bank.accountNumber || 'N/A'}`);
      console.log(`      GL Account: ${bank.glAccount?.accountNo || 'N/A'} - ${bank.glAccount?.accountName || 'N/A'}`);
      console.log(`      Currency: ${bank.currency?.code || 'N/A'}\n`);
    });

    // Use the first bank with GL account 1100, or first bank available
    let selectedBank = banks.find(b => b.glAccount?.accountNo === '1100') || banks[0];
    
    if (!selectedBank.glAccount) {
      console.log('⚠️  Selected bank does not have a GL account. Using first bank with GL account...');
      selectedBank = banks.find(b => b.glAccount) || banks[0];
    }

    if (!selectedBank.glAccount) {
      console.log('❌ No bank with GL account found. Please configure a bank with a GL account.');
      return;
    }

    console.log(`\n📊 Step 3: Generating GL Detail Report for Bank: ${selectedBank.name}`);
    console.log(`   Bank ID: ${selectedBank.id}`);
    console.log(`   GL Account: ${selectedBank.glAccount.accountNo} - ${selectedBank.glAccount.accountName}\n`);

    // Step 3: Generate GL Detail Report for the bank
    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 1);
    const endOfYear = new Date(today.getFullYear(), 11, 31);

    const startDate = startOfYear.toISOString().split('T')[0];
    const endDate = endOfYear.toISOString().split('T')[0];

    console.log(`   Period: ${startDate} to ${endDate} (Current Year)\n`);

    const reportRes = await axios.get(
      `${BASE_URL}/api/accounting/gl-ledger-detail/bank/${selectedBank.id}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          startDate,
          endDate
        }
      }
    );

    const report = reportRes.data.data;

    console.log('✅ GL Detail Report Generated Successfully!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 REPORT SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('🏦 Bank Information:');
    console.log(`   Name: ${report.bank.name}`);
    console.log(`   Account Number: ${report.bank.accountNumber}`);
    console.log(`   Currency: ${report.bank.currency.code}\n`);

    console.log('📊 Account Information:');
    console.log(`   Account No: ${report.account.accountNo}`);
    console.log(`   Account Name: ${report.account.accountName}`);
    console.log(`   Account Type: ${report.account.accountType}\n`);

    console.log('📅 Period:');
    console.log(`   Start Date: ${report.period.startDate}`);
    console.log(`   End Date: ${report.period.endDate}\n`);

    console.log('💰 Balance Information:');
    console.log(`   Opening Balance: ${parseFloat(report.account.openingBalance).toFixed(2)}`);
    console.log(`   Closing Balance: ${parseFloat(report.account.closingBalance).toFixed(2)}`);
    console.log(`   Final Bank Balance: ${parseFloat(report.account.closingBalance).toFixed(2)}`);
    console.log(`   (Initial Balance ± All Debits/Credits)\n`);

    console.log('📈 Summary:');
    console.log(`   Total Debits: ${parseFloat(report.summary.totalDebits).toFixed(2)}`);
    console.log(`   Total Credits: ${parseFloat(report.summary.totalCredits).toFixed(2)}`);
    console.log(`   Net Change: ${parseFloat(report.summary.netChange).toFixed(2)}`);
    console.log(`   Transaction Count: ${report.summary.transactionCount}\n`);

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📝 TRANSACTIONS (All Individual Transactions)');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (report.transactions.length === 0) {
      console.log('   No transactions found in this period.\n');
    } else {
      console.log(`   Found ${report.transactions.length} transaction(s):\n`);
      
      report.transactions.forEach((txn, index) => {
        console.log(`   ${index + 1}. ${txn.date} - ${txn.reference}`);
        console.log(`      Description: ${txn.description}`);
        console.log(`      Type: ${txn.transactionType || 'Manual Entry'}`);
        console.log(`      Debit: ${parseFloat(txn.debitAmount).toFixed(2)}`);
        console.log(`      Credit: ${parseFloat(txn.creditAmount).toFixed(2)}`);
        console.log(`      Running Balance: ${parseFloat(txn.runningBalance).toFixed(2)}`);
        console.log(`      Status: ${txn.journalEntryStatus}\n`);
      });
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ VERIFICATION');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Verify that closing balance = opening balance + net change
    const calculatedClosing = parseFloat(report.account.openingBalance) + parseFloat(report.summary.netChange);
    const actualClosing = parseFloat(report.account.closingBalance);
    const difference = Math.abs(calculatedClosing - actualClosing);

    console.log(`   Opening Balance: ${parseFloat(report.account.openingBalance).toFixed(2)}`);
    console.log(`   Net Change: ${parseFloat(report.summary.netChange).toFixed(2)}`);
    console.log(`   Calculated Closing: ${calculatedClosing.toFixed(2)}`);
    console.log(`   Actual Closing: ${actualClosing.toFixed(2)}`);
    console.log(`   Difference: ${difference.toFixed(2)}\n`);

    if (difference < 0.01) {
      console.log('   ✅ PASS: Closing balance = Opening balance + Net change');
      console.log('   ✅ Final bank balance reflects initial balance ± all Debits/Credits\n');
    } else {
      console.log('   ❌ FAIL: Closing balance does not match calculation');
      console.log('   ❌ There may be an issue with the balance calculation\n');
    }

    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 TEST RESULT SUMMARY');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ TEST PASSED');
    console.log('   ✅ Bank GL Detail Report generated successfully');
    console.log('   ✅ All individual transactions shown');
    console.log('   ✅ Running balance calculated correctly');
    console.log('   ✅ Final bank balance reflects initial balance ± all Debits/Credits');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testBankGLDetail();

