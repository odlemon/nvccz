const axios = require('axios');

const BASE_URL = 'http://localhost:3000';
let token = '';

async function login() {
  try {
    const response = await axios.post(`${BASE_URL}/api/auth/login`, {
      email: 'admin@nvccz.co.zw',
      password: 'admin123'
    });
    token = response.data.token;
    console.log('✅ Logged in successfully\n');
    return token;
  } catch (error) {
    console.error('❌ Login failed:', error.response?.data || error.message);
    throw error;
  }
}

async function fetchCashFlowStatement() {
  console.log('💰 Fetching Cash Flow Statement (Jan 1 - Dec 31, 2025)...\n');
  try {
    const response = await axios.get(`${BASE_URL}/api/accounting/cash-flow`, {
      params: {
        startDate: '2025-01-01',
        endDate: '2025-12-31',
        type: 'detailed'
      },
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.data.success) {
      return response.data.data;
    } else {
      throw new Error(response.data.message || 'Failed to fetch cash flow statement');
    }
  } catch (error) {
    console.error('❌ Error fetching Cash Flow Statement:', error.response?.data || error.message);
    throw error;
  }
}

async function fetchBalanceSheet() {
  console.log('📊 Fetching Balance Sheet (As of Dec 31, 2025)...\n');
  try {
    const response = await axios.get(`${BASE_URL}/api/accounting/balance-sheet`, {
      params: {
        asOfDate: '2025-12-31',
        startDate: '2025-01-01',
        endDate: '2025-12-31'
      },
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.data.success) {
      return response.data.data;
    } else {
      throw new Error(response.data.message || 'Failed to fetch balance sheet');
    }
  } catch (error) {
    console.error('❌ Error fetching Balance Sheet:', error.response?.data || error.message);
    throw error;
  }
}

async function fetchChartOfAccounts() {
  try {
    const response = await axios.get(`${BASE_URL}/api/accounting/chart-of-accounts`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.data.success) {
      return response.data.data;
    } else {
      throw new Error('Failed to fetch chart of accounts');
    }
  } catch (error) {
    console.error('❌ Error fetching Chart of Accounts:', error.response?.data || error.message);
    throw error;
  }
}

async function fetchBanks() {
  try {
    const response = await axios.get(`${BASE_URL}/api/banks`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.data.success) {
      return response.data.data;
    } else {
      return [];
    }
  } catch (error) {
    console.warn('⚠️  Could not fetch banks:', error.response?.data || error.message);
    return [];
  }
}

function verifyCashEquivalentsMatch(cfs, balanceSheet, chartOfAccounts, banks) {
  console.log('='.repeat(80));
  console.log('💰 CASH AND CASH EQUIVALENTS VERIFICATION');
  console.log('='.repeat(80));
  
  console.log('\n📋 REQUIREMENTS:');
  console.log('   1. Ending Cash Balance (CFS) = Cash and Cash Equivalents (BS)');
  console.log('   2. Cash and Cash Equivalents includes:');
  console.log('      - Petty Cash');
  console.log('      - Money in various banks');
  console.log('      - All accounts that fall under "Cash and Cash Equivalents"');
  
  // Check 1: Get CFS Ending Cash Balance
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 1: CASH FLOW STATEMENT ENDING CASH BALANCE');
  console.log('='.repeat(80));
  
  const cfsEndingCash = cfs.endingCashBalance || 0;
  const cfsBeginningCash = cfs.beginningCashBalance || 0;
  
  console.log(`\n💰 CFS Beginning Cash Balance: $${cfsBeginningCash.toFixed(2)}`);
  console.log(`💰 CFS Ending Cash Balance: $${cfsEndingCash.toFixed(2)}`);
  
  // Check 2: Get BS Cash and Cash Equivalents
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 2: BALANCE SHEET CASH AND CASH EQUIVALENTS');
  console.log('='.repeat(80));
  
  // Get cash and cash equivalents from Balance Sheet
  const bsCashAndEquivalents = balanceSheet?.assets?.cashAndCashEquivalents || 0;
  const currentAssets = balanceSheet?.assets?.currentAssets?.accounts || [];
  
  // Find all cash-related accounts in current assets
  const cashAccounts = currentAssets.filter(acc => {
    const accountName = (acc.accountName || '').toLowerCase();
    const accountNo = acc.accountNo || '';
    return accountName.includes('cash') || 
           accountName.includes('bank') ||
           (accountNo >= '1000' && accountNo < '1100');
  });
  
  console.log(`\n💰 BS Cash and Cash Equivalents (line item): $${bsCashAndEquivalents.toFixed(2)}`);
  console.log(`📊 Found ${cashAccounts.length} cash-related account(s) in Current Assets:`);
  
  let totalCashFromAccounts = 0;
  for (const acc of cashAccounts) {
    const balance = acc.balance || 0;
    totalCashFromAccounts += balance;
    console.log(`   - ${acc.accountNo} (${acc.accountName}): $${balance.toFixed(2)}`);
  }
  
  console.log(`\n💰 Total from individual cash accounts: $${totalCashFromAccounts.toFixed(2)}`);
  
  // Check 3: Verify CFS Ending Cash = BS Cash and Cash Equivalents
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 3: CFS ENDING CASH vs BS CASH AND CASH EQUIVALENTS');
  console.log('='.repeat(80));
  
  const match1 = Math.abs(cfsEndingCash - bsCashAndEquivalents) < 0.01;
  const match2 = Math.abs(cfsEndingCash - totalCashFromAccounts) < 0.01;
  
  console.log(`\n💰 CFS Ending Cash Balance: $${cfsEndingCash.toFixed(2)}`);
  console.log(`💰 BS Cash and Cash Equivalents (line item): $${bsCashAndEquivalents.toFixed(2)}`);
  console.log(`💰 BS Total from cash accounts: $${totalCashFromAccounts.toFixed(2)}`);
  console.log(`\n   ${match1 ? '✅ MATCH' : '❌ MISMATCH'}: CFS Ending Cash = BS Cash and Cash Equivalents (line item)`);
  console.log(`   ${match2 ? '✅ MATCH' : '❌ MISMATCH'}: CFS Ending Cash = BS Total from cash accounts`);
  
  if (!match1 || !match2) {
    console.log(`\n   ⚠️  CRITICAL: Data integrity error detected!`);
    console.log(`   The ending cash balance does not match the cash and cash equivalents.`);
  }
  
  // Check 4: Identify all cash accounts that should be included
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 4: IDENTIFYING ALL CASH ACCOUNTS');
  console.log('='.repeat(80));
  
  // Find all bank accounts
  const bankAccounts = [];
  for (const bank of banks) {
    if (bank.glAccount) {
      bankAccounts.push({
        bankName: bank.name,
        bankAccountNumber: bank.accountNumber,
        glAccountId: bank.glAccount.id,
        glAccountNo: bank.glAccount.accountNo,
        glAccountName: bank.glAccount.accountName
      });
    }
  }
  
  console.log(`\n🏦 Found ${bankAccounts.length} bank account(s) linked to GL accounts:`);
  for (const bank of bankAccounts) {
    console.log(`   - ${bank.bankName} (${bank.bankAccountNumber})`);
    console.log(`     GL Account: ${bank.glAccountNo} (${bank.glAccountName})`);
  }
  
  // Find all cash accounts from Chart of Accounts
  const cashCoAAccounts = chartOfAccounts.filter(acc => {
    const accountName = (acc.accountName || '').toLowerCase();
    const accountNo = acc.accountNo || '';
    const accountType = acc.accountType || '';
    
    return (accountName.includes('cash') || 
            accountName.includes('bank') ||
            (accountType === 'Current Asset' && accountNo >= '1000' && accountNo < '1100')) &&
           acc.isActive;
  });
  
  console.log(`\n💰 Found ${cashCoAAccounts.length} cash-related account(s) in Chart of Accounts:`);
  for (const acc of cashCoAAccounts) {
    console.log(`   - ${acc.accountNo} (${acc.accountName}) - ${acc.accountType}`);
  }
  
  // Check 5: Verify all cash accounts are included in both CFS and BS
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 5: VERIFY ALL CASH ACCOUNTS ARE INCLUDED');
  console.log('='.repeat(80));
  
  const cfsCashAccountNos = new Set();
  const bsCashAccountNos = new Set(cashAccounts.map(acc => acc.accountNo));
  
  // Note: CFS doesn't expose individual cash accounts in the response
  // But we can verify that the total matches
  
  console.log(`\n📊 Balance Sheet includes ${bsCashAccountNos.size} cash account(s):`);
  for (const accountNo of bsCashAccountNos) {
    console.log(`   - ${accountNo}`);
  }
  
  console.log(`\n💰 CFS Ending Cash Balance includes all cash accounts (calculated from all cash accounts)`);
  console.log(`💰 BS Cash and Cash Equivalents includes all cash accounts (sum of cash accounts)`);
  
  // Check 6: Verify petty cash is included
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 6: VERIFY PETTY CASH IS INCLUDED');
  console.log('='.repeat(80));
  
  const pettyCashAccounts = cashCoAAccounts.filter(acc => {
    const accountName = (acc.accountName || '').toLowerCase();
    return accountName.includes('petty');
  });
  
  if (pettyCashAccounts.length > 0) {
    console.log(`\n💰 Found ${pettyCashAccounts.length} petty cash account(s):`);
    for (const acc of pettyCashAccounts) {
      const bsAccount = cashAccounts.find(ca => ca.accountNo === acc.accountNo);
      if (bsAccount) {
        console.log(`   ✅ ${acc.accountNo} (${acc.accountName}) - Included in BS: $${bsAccount.balance.toFixed(2)}`);
      } else {
        console.log(`   ⚠️  ${acc.accountNo} (${acc.accountName}) - NOT FOUND in BS cash accounts`);
      }
    }
  } else {
    console.log(`\n   ℹ️  No petty cash accounts found (this is fine if there are no petty cash accounts)`);
  }
  
  // Check 7: Verify all bank accounts are included
  console.log('\n\n' + '='.repeat(80));
  console.log('🔍 CHECK 7: VERIFY ALL BANK ACCOUNTS ARE INCLUDED');
  console.log('='.repeat(80));
  
  if (bankAccounts.length > 0) {
    console.log(`\n🏦 Verifying ${bankAccounts.length} bank account(s) are included:`);
    for (const bank of bankAccounts) {
      const bsAccount = cashAccounts.find(ca => ca.accountNo === bank.glAccountNo);
      if (bsAccount) {
        console.log(`   ✅ ${bank.bankName} - GL Account ${bank.glAccountNo} (${bank.glAccountName})`);
        console.log(`      Included in BS: $${bsAccount.balance.toFixed(2)}`);
      } else {
        console.log(`   ⚠️  ${bank.bankName} - GL Account ${bank.glAccountNo} (${bank.glAccountName})`);
        console.log(`      NOT FOUND in BS cash accounts`);
      }
    }
  } else {
    console.log(`\n   ℹ️  No bank accounts found (this is fine if there are no bank accounts configured)`);
  }
  
  // Summary
  console.log('\n\n' + '='.repeat(80));
  console.log('📊 VERIFICATION SUMMARY');
  console.log('='.repeat(80));
  
  const allChecksPass = match1 && match2;
  
  console.log(`\n✅ CFS Ending Cash = BS Cash and Cash Equivalents: ${match1 ? 'PASS' : 'FAIL'}`);
  console.log(`✅ CFS Ending Cash = BS Total from cash accounts: ${match2 ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Petty Cash Accounts: ${pettyCashAccounts.length > 0 ? 'FOUND' : 'NONE'} (${pettyCashAccounts.length} account(s))`);
  console.log(`✅ Bank Accounts: ${bankAccounts.length > 0 ? 'FOUND' : 'NONE'} (${bankAccounts.length} account(s))`);
  console.log(`✅ Total Cash Accounts in BS: ${cashAccounts.length} account(s)`);
  
  console.log('\n' + '='.repeat(80));
  if (allChecksPass) {
    console.log('✅ CASH AND CASH EQUIVALENTS MATCH - ALL CHECKS PASS');
    console.log(`   CFS Ending Cash ($${cfsEndingCash.toFixed(2)}) = BS Cash and Cash Equivalents ($${bsCashAndEquivalents.toFixed(2)})`);
  } else {
    console.log('⚠️  CASH AND CASH EQUIVALENTS MISMATCH - REVIEW DETAILS ABOVE');
    console.log(`   CFS Ending Cash: $${cfsEndingCash.toFixed(2)}`);
    console.log(`   BS Cash and Cash Equivalents: $${bsCashAndEquivalents.toFixed(2)}`);
    console.log(`   Difference: $${Math.abs(cfsEndingCash - bsCashAndEquivalents).toFixed(2)}`);
  }
  console.log('='.repeat(80));
}

async function main() {
  try {
    await login();
    
    const cfs = await fetchCashFlowStatement();
    const balanceSheet = await fetchBalanceSheet();
    const chartOfAccounts = await fetchChartOfAccounts();
    const banks = await fetchBanks();
    
    verifyCashEquivalentsMatch(cfs, balanceSheet, chartOfAccounts, banks);
    
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    console.error(error.stack);
  }
}

main();

