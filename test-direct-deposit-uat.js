const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testDirectDepositUAT() {
  let token = '';

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 UAT TEST: Direct Deposit');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
  console.log('Test Scenario:');
  console.log('  DR Bank (1100) ZWL 20,000');
  console.log('  CR Management Fees Revenue (4000)');
  console.log('');
  console.log('Expected: System validates Debit = Credit rule and allows posting');
  console.log('');

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

  let bank1100, account4000;

  // Step 2: Find Bank Account with GL Account 1100 in ZWL
  console.log('🏦 Step 2: Finding Bank Account (1100) in ZWL currency...');
  try {
    const banksRes = await axios.get(`${BASE_URL}/api/cashbook/banks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    const banks = banksRes.data.data || [];
    bank1100 = banks.find(b => 
      b.glAccount && b.glAccount.accountNo === '1100' && 
      b.currency && (b.currency.code === 'ZWL' || b.currency.code === 'USD')
    );
    
    if (!bank1100) {
      console.log('⚠️ Bank account with GL 1100 not found. Available banks:');
      banks.forEach(b => {
        console.log(`   - ${b.name}: GL ${b.glAccount?.accountNo || 'N/A'} (${b.currency?.code || 'N/A'})`);
      });
      console.log('\n❌ Test cannot proceed without bank account 1100');
      return;
    }
    
    console.log(`✅ Found bank: ${bank1100.name}`);
    console.log(`   Bank ID: ${bank1100.id}`);
    console.log(`   GL Account: ${bank1100.glAccount.accountNo} - ${bank1100.glAccount.accountName}`);
    console.log(`   Currency: ${bank1100.currency.code}\n`);
  } catch (error) {
    console.error('❌ Error finding bank:', error.response?.data || error.message);
    return;
  }

  // Step 3: Find GL Account 4000 (Management Fees Revenue)
  console.log('📋 Step 3: Finding GL Account 4000 (Management Fees Revenue)...');
  try {
    const glAccountsRes = await axios.get(`${BASE_URL}/api/accounting/chart-of-accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    
    const glAccounts = glAccountsRes.data.data || [];
    account4000 = glAccounts.find(a => a.accountNo === '4000');
    
    if (!account4000) {
      console.log('⚠️ GL Account 4000 not found. Available revenue accounts:');
      glAccounts.filter(a => a.accountType?.includes('Revenue') || a.accountType?.includes('Income')).forEach(a => {
        console.log(`   - ${a.accountNo}: ${a.accountName}`);
      });
      console.log('\n❌ Test cannot proceed without GL account 4000');
      return;
    }
    
    console.log(`✅ Found GL Account: ${account4000.accountNo} - ${account4000.accountName}`);
    console.log(`   Account ID: ${account4000.id}`);
    console.log(`   Account Type: ${account4000.accountType}\n`);
  } catch (error) {
    console.error('❌ Error finding GL account:', error.response?.data || error.message);
    return;
  }

  // Step 4: Create Direct Deposit Cashbook Entry
  console.log('💰 Step 4: Creating Direct Deposit Cashbook Entry...');
  console.log('   Type: RECEIPT');
  console.log('   Amount: 20,000');
  console.log('   Bank: 1100');
  console.log('   GL Account: 4000 (Management Fees Revenue)');
  console.log('   Counterparty Type: GL\n');
  
  try {
    const receiptRes = await axios.post(
      `${BASE_URL}/api/cashbook/receipts`,
      {
        bankId: bank1100.id,
        transactionDate: new Date().toISOString(),
        description: 'Direct Deposit - Management Fees Revenue',
        amount: 20000,
        reference: 'DD-TEST-001',
        counterpartyType: 'GL',
        glAccountId: account4000.id,
        vatCode: '0%' // No VAT for this test
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    console.log('✅ Cashbook entry created successfully!');
    const cashbookEntry = receiptRes.data.data.transaction || receiptRes.data.data;
    console.log(`   Entry ID: ${cashbookEntry.id}`);
    console.log(`   Status: ${cashbookEntry.status}`);
    console.log(`   Journal Entry ID: ${cashbookEntry.journalEntryId || 'N/A'}\n`);

    // Step 5: Verify Journal Entry
    if (cashbookEntry.journalEntryId) {
      console.log('📖 Step 5: Verifying Journal Entry (Debit = Credit)...');
      const journalEntryRes = await axios.get(
        `${BASE_URL}/api/accounting/journal-entries/${cashbookEntry.journalEntryId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // The response structure is { journalEntry: {...}, journalEntryLines: [...] }
      const journalEntryData = journalEntryRes.data.data;
      const journalEntry = journalEntryData.journalEntry || journalEntryData;
      const journalEntryLines = journalEntryData.journalEntryLines || journalEntry.journalEntryLines || [];
      
      console.log(`   Journal Entry ID: ${journalEntry.id}`);
      console.log(`   Reference Number: ${journalEntry.referenceNumber || 'N/A'}`);
      console.log(`   Description: ${journalEntry.description || 'N/A'}`);
      console.log(`   Transaction Date: ${journalEntry.transactionDate || 'N/A'}`);
      console.log(`   Total Amount: ${parseFloat(journalEntry.totalAmount || 0).toFixed(2)}`);
      console.log(`   Status: ${journalEntry.status || 'N/A'}`);
      console.log(`   Currency: ${journalEntry.currency?.code || 'N/A'}\n`);
      console.log('   Journal Entry Lines:');
      
      let totalDebits = 0;
      let totalCredits = 0;
      
      journalEntryLines.forEach((line, index) => {
        const debit = parseFloat(line.debitAmount || 0);
        const credit = parseFloat(line.creditAmount || 0);
        totalDebits += debit;
        totalCredits += credit;
        
        console.log(`   ${index + 1}. ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}`);
        console.log(`      Debit: ${debit.toFixed(2)}`);
        console.log(`      Credit: ${credit.toFixed(2)}`);
        
        // Verify account numbers
        if (line.chartOfAccount.accountNo === '1100') {
          console.log(`      ✅ Bank Account (1100) found`);
        }
        if (line.chartOfAccount.accountNo === '4000') {
          console.log(`      ✅ Management Fees Revenue (4000) found`);
        }
      });
      
      console.log('');
      console.log(`   Total Debits: ${totalDebits.toFixed(2)}`);
      console.log(`   Total Credits: ${totalCredits.toFixed(2)}`);
      console.log(`   Difference: ${Math.abs(totalDebits - totalCredits).toFixed(2)}`);
      
      // Step 6: Validate Debit = Credit
      console.log('\n✅ Step 6: Validating Debit = Credit Rule...');
      const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;
      
      if (isBalanced) {
        console.log('   ✅ PASS: Debits equal Credits');
        console.log('   ✅ System validated the Debit = Credit rule');
        console.log('   ✅ Posting was allowed');
      } else {
        console.log('   ❌ FAIL: Debits do not equal Credits');
        console.log('   ❌ System should have prevented posting');
      }
      
      // Step 7: Verify specific amounts
      console.log('\n📊 Step 7: Verifying Specific Amounts...');
      const bankLine = journalEntryLines.find(l => l.chartOfAccount.accountNo === '1100');
      const revenueLine = journalEntryLines.find(l => l.chartOfAccount.accountNo === '4000');
      
      if (bankLine) {
        const bankDebit = parseFloat(bankLine.debitAmount || 0);
        console.log(`   Bank (1100) Debit: ${bankDebit.toFixed(2)}`);
        if (Math.abs(bankDebit - 20000) < 0.01) {
          console.log('   ✅ Bank debit amount is correct (20,000)');
        } else {
          console.log(`   ❌ Bank debit amount is incorrect (expected 20,000, got ${bankDebit.toFixed(2)})`);
        }
      } else {
        console.log('   ❌ Bank account (1100) line not found in journal entry');
      }
      
      if (revenueLine) {
        const revenueCredit = parseFloat(revenueLine.creditAmount || 0);
        console.log(`   Management Fees Revenue (4000) Credit: ${revenueCredit.toFixed(2)}`);
        if (Math.abs(revenueCredit - 20000) < 0.01) {
          console.log('   ✅ Revenue credit amount is correct (20,000)');
        } else {
          console.log(`   ❌ Revenue credit amount is incorrect (expected 20,000, got ${revenueCredit.toFixed(2)})`);
        }
      } else {
        console.log('   ❌ Management Fees Revenue (4000) line not found in journal entry');
      }
      
      // Final Test Result
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('📋 TEST RESULT SUMMARY');
      console.log('═══════════════════════════════════════════════════════════');
      
      const testPassed = isBalanced && 
                        bankLine && Math.abs(parseFloat(bankLine.debitAmount || 0) - 20000) < 0.01 &&
                        revenueLine && Math.abs(parseFloat(revenueLine.creditAmount || 0) - 20000) < 0.01;
      
      if (testPassed) {
        console.log('✅ TEST PASSED');
        console.log('   ✅ Cashbook entry created');
        console.log('   ✅ Journal entry created');
        console.log('   ✅ Debit = Credit validation passed');
        console.log('   ✅ Bank (1100) debited 20,000');
        console.log('   ✅ Management Fees Revenue (4000) credited 20,000');
        console.log('   ✅ Posting was allowed');
      } else {
        console.log('❌ TEST FAILED');
        if (!isBalanced) {
          console.log('   ❌ Debit ≠ Credit');
        }
        if (!bankLine || Math.abs(parseFloat(bankLine.debitAmount || 0) - 20000) >= 0.01) {
          console.log('   ❌ Bank debit amount incorrect');
        }
        if (!revenueLine || Math.abs(parseFloat(revenueLine.creditAmount || 0) - 20000) >= 0.01) {
          console.log('   ❌ Revenue credit amount incorrect');
        }
      }
      console.log('═══════════════════════════════════════════════════════════\n');
      
    } else {
      console.log('⚠️ No journal entry found - entry may not be posted yet');
    }

  } catch (error) {
    console.error('❌ Error creating cashbook entry:', error.response?.data || error.message);
    if (error.response?.data) {
      console.error('   Details:', JSON.stringify(error.response.data, null, 2));
    }
  }
}

testDirectDepositUAT().catch(console.error);

