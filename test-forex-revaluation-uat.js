const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
const ADMIN_EMAIL = 'admin@nvccz.co.zw';
const ADMIN_PASSWORD = 'admin123';

async function testForexRevaluationUAT() {
  let token = '';
  let testPassed = true;

  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 UAT TEST: Foreign Currency Revaluation');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('Test Scenario:');
  console.log('  1. Create a multi-currency Bank Account (USD)');
  console.log('  2. Record a Receipt of $1,000 USD at Rate 50 (Base: ZIG 50,000)');
  console.log('  3. Run the Foreign Currency Revaluation routine when the rate is 55');
  console.log('  Expected: System calculates unrealized gain (5,000 ZIG)');
  console.log('  Expected Journal Entry: DR USD Bank, CR Unrealized FX Gain\n');

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
    testPassed = false;
    return;
  }

  // Step 2: Get currencies (USD and ZWL/ZIG)
  console.log('💱 Step 2: Getting currencies...');
  let usdCurrency, zwlCurrency;
  try {
    const currencyRes = await axios.get(`${BASE_URL}/api/accounting/currencies`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    usdCurrency = currencyRes.data.data.find(c => c.code === 'USD');
    zwlCurrency = currencyRes.data.data.find(c => c.code === 'ZWL' || c.code === 'ZIG');

    if (!usdCurrency || !zwlCurrency) {
      console.error('❌ USD or ZWL/ZIG currency not found. Please ensure both exist.');
      testPassed = false;
      return;
    }
    console.log(`✅ Found USD: ${usdCurrency.code} - ID: ${usdCurrency.id}`);
    console.log(`✅ Found Base Currency: ${zwlCurrency.code} - ID: ${zwlCurrency.id}\n`);
  } catch (error) {
    console.error('❌ Failed to get currencies:', error.response?.data || error.message);
    testPassed = false;
    return;
  }

  // Step 3 & 4: Create a fresh USD Bank Account for testing
  console.log('🏦 Step 3: Creating fresh USD Bank Account for testing...');
  let usdBank;
  let usdBankGLAccount;
  try {
    // Always create a fresh bank account for this test to avoid existing transactions
    console.log('   Creating new USD Bank Account for clean test...');
      // Need to create USD bank - first get/create a GL account
      console.log('   No USD bank found, creating one...');
      
      // Try to find an available GL account number using timestamp
      let accountNo = null;
      const timestamp = Date.now();
      // Try account numbers based on timestamp to ensure uniqueness
      for (let i = 0; i < 10; i++) {
        const testAccountNo = `11${(timestamp % 10000 + i).toString().padStart(4, '0')}`;
        try {
          const glRes = await axios.get(`${BASE_URL}/api/accounting/chart-of-accounts?accountNo=${testAccountNo}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const accounts = glRes.data.data.chartOfAccounts || [];
          if (accounts.length === 0) {
            accountNo = testAccountNo;
            break;
          }
        } catch (e) {
          // Account doesn't exist, we can use it
          accountNo = testAccountNo;
          break;
        }
      }
      
      if (!accountNo) {
        // Fallback: use timestamp directly
        accountNo = `11${(timestamp % 100000).toString().padStart(5, '0')}`;
      }
      
      // Create GL account
      try {
        const createGLRes = await axios.post(`${BASE_URL}/api/accounting/chart-of-accounts`, {
          accountNo: accountNo,
          accountName: `USD Bank Test Account ${accountNo}`,
          accountType: 'Current Asset',
          financialStatement: 'Balance Sheet',
          isActive: true
        }, { headers: { Authorization: `Bearer ${token}` } });
        usdBankGLAccount = createGLRes.data.data;
        console.log(`   ✅ GL Account created: ${accountNo}`);
      } catch (createError) {
        // If creation fails because it exists, try to fetch it
        if (createError.response?.data?.message?.includes('already exists') || 
            createError.response?.data?.message?.includes('Account number')) {
          const glRes = await axios.get(`${BASE_URL}/api/accounting/chart-of-accounts?accountNo=${accountNo}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const accounts = glRes.data.data.chartOfAccounts || [];
          usdBankGLAccount = accounts.find(a => a.accountNo === accountNo);
          if (usdBankGLAccount) {
            console.log(`   ✅ GL Account found (already exists): ${accountNo}`);
          } else {
            // Try a different account number
            accountNo = `11${(timestamp % 1000000).toString().padStart(6, '0')}`;
            const createGLRes2 = await axios.post(`${BASE_URL}/api/accounting/chart-of-accounts`, {
              accountNo: accountNo,
              accountName: `USD Bank Test Account ${accountNo}`,
              accountType: 'Current Asset',
              financialStatement: 'Balance Sheet',
              isActive: true
            }, { headers: { Authorization: `Bearer ${token}` } });
            usdBankGLAccount = createGLRes2.data.data;
            console.log(`   ✅ GL Account created with alternative number: ${accountNo}`);
          }
        } else {
          throw createError;
        }
      }
      
    // Create USD bank with unique name for this test
    const bankTimestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 15);
    const accountNumber = `USD-REVAL-${bankTimestamp}-${randomSuffix}`;
    const testBankName = `USD Bank - Revaluation Test ${bankTimestamp}`;
    const createBankRes = await axios.post(`${BASE_URL}/api/cashbook/banks`, {
      name: testBankName,
      accountNumber: accountNumber,
      currencyId: usdCurrency.id,
      glAccountId: usdBankGLAccount.id,
      isActive: true
    }, { headers: { Authorization: `Bearer ${token}` } });
    usdBank = createBankRes.data.data;
    console.log('   ✅ Fresh USD Bank Account created for testing');
    console.log(`   Bank: ${usdBank.name} (ID: ${usdBank.id})`);
    console.log(`   GL Account: ${usdBankGLAccount.accountNo} - ${usdBankGLAccount.accountName}`);
    console.log('   Note: This is a fresh account with zero balance\n');
  } catch (error) {
    console.error('❌ Failed to find/create USD bank:', error.response?.data || error.message);
    testPassed = false;
    return;
  }

  // Step 5: Create exchange rate for Day 1 (Rate 50)
  console.log('📊 Step 5: Creating exchange rate for Day 1 (Rate 50)...');
  const day1 = new Date('2025-10-15T00:00:00.000Z');
  const rateDay1 = 50;
  try {
    // Check if rate exists
    const existingRatesRes = await axios.get(`${BASE_URL}/api/accounting/multi-currency/exchange-rates`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        fromCurrencyId: usdCurrency.id,
        toCurrencyId: zwlCurrency.id,
        dateFrom: day1.toISOString().split('T')[0],
        dateTo: day1.toISOString().split('T')[0],
      }
    });
    const existingRates = existingRatesRes.data.data.exchangeRates || [];
    const day1RateExists = existingRates.some(r => new Date(r.date).getTime() === day1.getTime() && Number(r.rate) === rateDay1);

    // Check if the existing rate is the correct one (50)
    const existingRateOnDay1 = existingRates.find(r => {
      const rateDateStr = new Date(r.date).toISOString().split('T')[0];
      const day1Str = day1.toISOString().split('T')[0];
      return rateDateStr === day1Str;
    });

    if (existingRateOnDay1 && Number(existingRateOnDay1.rate) !== rateDay1) {
      console.log(`   ⚠️  Exchange rate exists on ${day1.toISOString().split('T')[0]} but with different rate: ${existingRateOnDay1.rate}`);
      console.log(`   🔄 Updating existing rate to ${rateDay1}...`);
      try {
        await axios.put(`${BASE_URL}/api/accounting/multi-currency/exchange-rates/${existingRateOnDay1.id}`, {
          rate: rateDay1,
        }, { headers: { Authorization: `Bearer ${token}` } });
        console.log(`   ✅ Exchange rate updated to ${rateDay1} (${usdCurrency.code}:${zwlCurrency.code})`);
      } catch (updateError) {
        console.error(`   ❌ Failed to update exchange rate:`, updateError.response?.data || updateError.message);
        console.log(`   ⚠️  Test may fail because existing rate (${existingRateOnDay1.rate}) will be used instead of ${rateDay1}`);
      }
    } else if (!day1RateExists) {
      try {
        await axios.post(`${BASE_URL}/api/accounting/multi-currency/exchange-rates`, {
          effectiveDate: day1.toISOString().split('T')[0],
          fromCurrencyId: usdCurrency.id,
          toCurrencyId: zwlCurrency.id,
          rate: rateDay1,
        }, { headers: { Authorization: `Bearer ${token}` } });
        console.log(`   ✅ Exchange rate created: ${rateDay1} (${usdCurrency.code}:${zwlCurrency.code})`);
      } catch (createError) {
        if (createError.response?.data?.details?.includes('already exists') || 
            createError.response?.data?.message?.includes('already exists')) {
          console.log(`   ⚠️  Exchange rate already exists on this date with a different rate`);
          console.log(`   ⚠️  Test may fail because existing rate will be used instead of ${rateDay1}`);
        } else {
          throw createError;
        }
      }
    } else {
      console.log(`   ✅ Exchange rate already exists: ${rateDay1} (${usdCurrency.code}:${zwlCurrency.code})`);
    }
    console.log(`   Date: ${day1.toISOString().split('T')[0]}\n`);
  } catch (error) {
    console.error('❌ Failed to create exchange rate:', error.response?.data || error.message);
    testPassed = false;
    return;
  }

  // Step 6: Record a Receipt of $1,000 USD at Rate 50
  console.log('💰 Step 6: Recording Receipt of $1,000 USD at Rate 50...');
  console.log('   Amount: 1,000 USD');
  console.log('   Exchange Rate: 50');
  console.log('   Base Currency Value: 50,000 ZIG\n');
  
  // Get a revenue account for the contra account (can't use the same GL account as bank)
  let revenueAccount;
  try {
    // Try to get account 4000 directly
    try {
      const revenueRes = await axios.get(`${BASE_URL}/api/accounting/chart-of-accounts?accountNo=4000`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const accounts = revenueRes.data.data?.chartOfAccounts || revenueRes.data.data || [];
      revenueAccount = Array.isArray(accounts) ? accounts.find(a => a.accountNo === '4000') : accounts;
    } catch (e) {
      // Account not found, try to create it
      try {
        const createRes = await axios.post(`${BASE_URL}/api/accounting/chart-of-accounts`, {
          accountNo: '4000',
          accountName: 'Management Fees Revenue',
          accountType: 'Revenue',
          financialStatement: 'Income Statement',
          isActive: true
        }, { headers: { Authorization: `Bearer ${token}` } });
        revenueAccount = createRes.data.data;
        console.log(`   ✅ Created revenue account: ${revenueAccount.accountNo}`);
      } catch (createError) {
        // If creation fails, try to get any revenue account from all accounts
        const allAccountsRes = await axios.get(`${BASE_URL}/api/accounting/chart-of-accounts`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const allAccounts = allAccountsRes.data.data?.chartOfAccounts || allAccountsRes.data.data || [];
        const accountsArray = Array.isArray(allAccounts) ? allAccounts : [];
        revenueAccount = accountsArray.find(a => 
          a && (a.accountType === 'Revenue' || a.accountType === 'Income') && a.isActive !== false
        );
        if (!revenueAccount && createError.response?.data?.message?.includes('already exists')) {
          // Try to fetch 4000 again
          const fetchRes = await axios.get(`${BASE_URL}/api/accounting/chart-of-accounts?accountNo=4000`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          const accounts = fetchRes.data.data?.chartOfAccounts || fetchRes.data.data || [];
          revenueAccount = Array.isArray(accounts) ? accounts.find(a => a && a.accountNo === '4000') : accounts;
        }
      }
    }
    
    if (!revenueAccount) {
      throw new Error('No revenue account found for contra account');
    }
    console.log(`   Using contra account: ${revenueAccount.accountNo} - ${revenueAccount.accountName}\n`);
  } catch (error) {
    console.error('❌ Failed to get revenue account:', error.response?.data || error.message);
    testPassed = false;
    return;
  }
  
  try {
    const receiptRes = await axios.post(`${BASE_URL}/api/cashbook/receipts`, {
      bankId: usdBank.id,
      transactionDate: day1.toISOString(),
      description: 'USD Receipt - Test for Revaluation',
      amount: 1000, // USD 1,000
      reference: 'RCP-USD-001',
      counterpartyType: 'GL',
      glAccountId: revenueAccount.id, // Use revenue account as contra, not the bank GL account
      vatCode: '0%'
    }, { headers: { Authorization: `Bearer ${token}` } });

    const cashbookEntry = receiptRes.data.data.transaction || receiptRes.data.data;
    console.log('   ✅ Receipt recorded successfully');
    console.log(`   Entry ID: ${cashbookEntry.id}`);
    console.log(`   Amount: ${cashbookEntry.amount} ${usdCurrency.code}`);
    console.log(`   Status: ${cashbookEntry.status}\n`);

    // Verify journal entry was created
    if (cashbookEntry.journalEntryId) {
      const journalEntryRes = await axios.get(`${BASE_URL}/api/accounting/journal-entries/${cashbookEntry.journalEntryId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const journalEntry = journalEntryRes.data.data.journalEntry || journalEntryRes.data.data;
      console.log('   Journal Entry Created:');
      console.log(`   Reference: ${journalEntry.referenceNumber}`);
      console.log(`   Status: ${journalEntry.status}`);
      console.log(`   Lines: ${journalEntry.journalEntryLines?.length || 0}\n`);
    }
  } catch (error) {
    console.error('❌ Failed to record receipt:', error.response?.data || error.message);
    testPassed = false;
    return;
  }

  // Step 7: Create exchange rate for Day 30 (Rate 55)
  console.log('📊 Step 7: Creating exchange rate for Day 30 (Rate 55)...');
  const day30 = new Date('2025-11-14T00:00:00.000Z');
  const rateDay30 = 55;
  try {
    const existingRatesRes = await axios.get(`${BASE_URL}/api/accounting/multi-currency/exchange-rates`, {
      headers: { Authorization: `Bearer ${token}` },
      params: {
        fromCurrencyId: usdCurrency.id,
        toCurrencyId: zwlCurrency.id,
        dateFrom: day30.toISOString().split('T')[0],
        dateTo: day30.toISOString().split('T')[0],
      }
    });
    const existingRates = existingRatesRes.data.data.exchangeRates || [];
    const day30RateExists = existingRates.some(r => new Date(r.date).getTime() === day30.getTime() && Number(r.rate) === rateDay30);

    if (!day30RateExists) {
      try {
        await axios.post(`${BASE_URL}/api/accounting/multi-currency/exchange-rates`, {
          effectiveDate: day30.toISOString().split('T')[0],
          fromCurrencyId: usdCurrency.id,
          toCurrencyId: zwlCurrency.id,
          rate: rateDay30,
        }, { headers: { Authorization: `Bearer ${token}` } });
        console.log(`   ✅ Exchange rate created: ${rateDay30} (${usdCurrency.code}:${zwlCurrency.code})`);
      } catch (createError) {
        if (createError.response?.data?.details?.includes('already exists')) {
          console.log(`   ✅ Exchange rate already exists: ${rateDay30} (${usdCurrency.code}:${zwlCurrency.code})`);
        } else {
          throw createError;
        }
      }
    } else {
      console.log(`   ✅ Exchange rate already exists: ${rateDay30} (${usdCurrency.code}:${zwlCurrency.code})`);
    }
    console.log(`   Date: ${day30.toISOString().split('T')[0]}\n`);
  } catch (error) {
    console.error('❌ Failed to create exchange rate:', error.response?.data || error.message);
    testPassed = false;
    return;
  }

  // Step 8: Run Foreign Currency Revaluation routine
  console.log('🔄 Step 8: Running Foreign Currency Revaluation routine...');
  console.log('   Bank: USD Bank Account');
  console.log('   Old Rate: 50 (from Day 1)');
  console.log('   New Rate: 55 (Day 30)');
    console.log('   Expected Unrealized Gain: 5,000 ZIG');
    console.log('   Note: If bank has existing balance, gain/loss will be calculated on total balance\n');
  try {
      const revalueRes = await axios.post(
      `${BASE_URL}/api/accounting/multi-currency/banks/${usdBank.id}/revalue`,
      {
        newExchangeRate: rateDay30,
        revaluationDate: day30.toISOString().split('T')[0], // Use date only (YYYY-MM-DD)
        baseCurrencyId: zwlCurrency.id,
        oldExchangeRateDate: day1.toISOString().split('T')[0] // Use Day 1 rate as old rate (YYYY-MM-DD)
      },
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const revaluation = revalueRes.data.data;
    console.log('   ✅ Revaluation completed successfully!\n');
    console.log('   Revaluation Results:');
    console.log(`   Foreign Currency Balance: ${revaluation.foreignCurrencyBalance.toFixed(2)} ${usdCurrency.code}`);
    console.log(`   Old Base Currency Value: ${revaluation.oldBaseCurrencyValue.toFixed(2)} ${zwlCurrency.code}`);
    console.log(`   New Base Currency Value: ${revaluation.newBaseCurrencyValue.toFixed(2)} ${zwlCurrency.code}`);
    console.log(`   Unrealized Gain/Loss: ${revaluation.unrealizedGainLoss.toFixed(2)} ${zwlCurrency.code}`);
    console.log(`   Gain/Loss Type: ${revaluation.gainLossType}`);
    console.log(`   Journal Entry ID: ${revaluation.journalEntryId}\n`);

    // Step 9: Verify Journal Entry
    console.log('📖 Step 9: Verifying Journal Entry...\n');
    const journalEntryRes = await axios.get(`${BASE_URL}/api/accounting/journal-entries/${revaluation.journalEntryId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const journalEntryData = journalEntryRes.data.data;
    const journalEntry = journalEntryData.journalEntry || journalEntryData;
    const journalEntryLines = journalEntryData.journalEntryLines || journalEntry.journalEntryLines || [];

    console.log(`   Journal Entry: ${journalEntry.referenceNumber}`);
    console.log(`   Description: ${journalEntry.description}`);
    console.log(`   Status: ${journalEntry.status}\n`);
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
      console.log(`      Description: ${line.description}\n`);
    });

    console.log(`   Total Debits: ${totalDebits.toFixed(2)}`);
    console.log(`   Total Credits: ${totalCredits.toFixed(2)}`);
    console.log(`   Difference: ${Math.abs(totalDebits - totalCredits).toFixed(2)}\n`);

    // Step 10: Verify UAT Requirements
    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ Step 10: Verifying UAT Requirements...');
    console.log('═══════════════════════════════════════════════════════════\n');

    const expectedGain = 5000; // 1,000 USD * (55 - 50) = 5,000 ZIG
    const actualGain = revaluation.unrealizedGainLoss;
    const gainDifference = Math.abs(actualGain - expectedGain);

    console.log('1. Unrealized Gain Calculation:');
    console.log(`   Expected: ${expectedGain.toFixed(2)} ZIG`);
    console.log(`   Actual: ${actualGain.toFixed(2)} ZIG`);
    if (gainDifference < 0.01) {
      console.log('   ✅ PASS: Unrealized gain calculated correctly\n');
    } else {
      console.log('   ❌ FAIL: Unrealized gain does not match expected value\n');
      testPassed = false;
    }

    console.log('2. Journal Entry Balance:');
    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;
    if (isBalanced) {
      console.log('   ✅ PASS: Journal entry is balanced (Debits = Credits)\n');
    } else {
      console.log('   ❌ FAIL: Journal entry is not balanced\n');
      testPassed = false;
    }

    console.log('3. Journal Entry Structure:');
    // Use the actual bank GL account number (not hardcoded '1101')
    const bankLine = journalEntryLines.find(l => l.chartOfAccount.id === usdBankGLAccount.id || l.chartOfAccount.accountNo === usdBankGLAccount.accountNo);
    const unrealizedGainLine = journalEntryLines.find(l => 
      l.chartOfAccount.accountNo === '4050' || 
      l.chartOfAccount.accountName.toLowerCase().includes('unrealized')
    );

    if (bankLine && unrealizedGainLine) {
      console.log('   ✅ PASS: Journal entry has USD Bank and Unrealized FX Gain accounts\n');
      
      if (revaluation.gainLossType === 'GAIN') {
        const bankDebit = parseFloat(bankLine.debitAmount || 0);
        const gainCredit = parseFloat(unrealizedGainLine.creditAmount || 0);
        console.log(`   USD Bank Debit: ${bankDebit.toFixed(2)}`);
        console.log(`   Unrealized FX Gain Credit: ${gainCredit.toFixed(2)}`);
        if (Math.abs(bankDebit - gainCredit) < 0.01 && Math.abs(bankDebit - expectedGain) < 0.01) {
          console.log('   ✅ PASS: Journal entry structure is correct (DR USD Bank, CR Unrealized FX Gain)\n');
        } else {
          console.log('   ❌ FAIL: Journal entry amounts do not match\n');
          testPassed = false;
        }
      }
    } else {
      console.log('   ❌ FAIL: Journal entry missing required accounts\n');
      testPassed = false;
    }

    console.log('4. Base Currency Value Update:');
    console.log(`   Old Value: ${revaluation.oldBaseCurrencyValue.toFixed(2)} ZIG`);
    console.log(`   New Value: ${revaluation.newBaseCurrencyValue.toFixed(2)} ZIG`);
    console.log(`   Expected New Value: 55,000 ZIG (1,000 USD * 55)`);
    const expectedNewValue = 55000;
    if (Math.abs(revaluation.newBaseCurrencyValue - expectedNewValue) < 0.01) {
      console.log('   ✅ PASS: Base currency value updated correctly\n');
    } else {
      console.log('   ❌ FAIL: Base currency value does not match expected\n');
      testPassed = false;
    }

  } catch (error) {
    console.error('❌ Failed to run revaluation:', error.response?.data || error.message);
    testPassed = false;
  }

  // Final Test Result
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📋 TEST RESULT SUMMARY');
  console.log('═══════════════════════════════════════════════════════════\n');

  if (testPassed) {
    console.log('✅ TEST PASSED');
    console.log('   ✅ USD Bank Account created');
    console.log('   ✅ Receipt of $1,000 USD recorded at Rate 50');
    console.log('   ✅ Foreign Currency Revaluation routine executed');
    console.log('   ✅ Unrealized gain calculated correctly (5,000 ZIG)');
    console.log('   ✅ Journal entry posted (DR USD Bank, CR Unrealized FX Gain)');
    console.log('   ✅ Base currency value updated to 55,000 ZIG');
  } else {
    console.log('❌ TEST FAILED');
    console.log('   Some requirements were not met. Please review the errors above.');
  }
  console.log('═══════════════════════════════════════════════════════════');
}

testForexRevaluationUAT();

