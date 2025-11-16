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

function analyzeIncomeStatementFormula(incomeStatement) {
  console.log('='.repeat(80));
  console.log('📊 INCOME STATEMENT FORMULA VERIFICATION');
  console.log('='.repeat(80));
  
  const sections = incomeStatement.data.sections;
  const totals = incomeStatement.data.totals;
  
  console.log('\n📈 SECTIONS:');
  console.log(`   Revenue Total:                    $${sections.revenue.total.toFixed(2)}`);
  console.log(`   Operating Expenses Total:        $${sections.operatingExpenses.total.toFixed(2)}`);
  console.log(`   Income Tax Total:                $${sections.incomeTax.total.toFixed(2)}`);
  console.log(`   Below-the-Line Total:            $${sections.belowTheLine.total.toFixed(2)}`);
  
  console.log('\n🧮 CALCULATIONS:');
  
  // Step 1: Net Income Before Taxes
  const calculatedNetIncomeBeforeTaxes = sections.revenue.total - sections.operatingExpenses.total;
  console.log(`\n   1. Net Income Before Taxes:`);
  console.log(`      Formula: Revenue - Operating Expenses`);
  console.log(`      Calculation: $${sections.revenue.total.toFixed(2)} - $${sections.operatingExpenses.total.toFixed(2)}`);
  console.log(`      Result: $${calculatedNetIncomeBeforeTaxes.toFixed(2)}`);
  console.log(`      Expected: $${totals.netIncomeBeforeTaxes.toFixed(2)}`);
  console.log(`      ${Math.abs(calculatedNetIncomeBeforeTaxes - totals.netIncomeBeforeTaxes) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  // Step 2: Income From Continuing Operations
  const calculatedIncomeFromContinuingOperations = calculatedNetIncomeBeforeTaxes - sections.incomeTax.total;
  console.log(`\n   2. Income From Continuing Operations:`);
  console.log(`      Formula: Net Income Before Taxes - Income Tax`);
  console.log(`      Calculation: $${calculatedNetIncomeBeforeTaxes.toFixed(2)} - $${sections.incomeTax.total.toFixed(2)}`);
  console.log(`      Result: $${calculatedIncomeFromContinuingOperations.toFixed(2)}`);
  console.log(`      Expected: $${totals.incomeFromContinuingOperations.toFixed(2)}`);
  console.log(`      ${Math.abs(calculatedIncomeFromContinuingOperations - totals.incomeFromContinuingOperations) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  // Step 3: Net Income
  const calculatedNetIncome = calculatedIncomeFromContinuingOperations + sections.belowTheLine.total;
  console.log(`\n   3. Net Income:`);
  console.log(`      Formula: Income From Continuing Operations + Below-the-Line`);
  console.log(`      Calculation: $${calculatedIncomeFromContinuingOperations.toFixed(2)} + $${sections.belowTheLine.total.toFixed(2)}`);
  console.log(`      Result: $${calculatedNetIncome.toFixed(2)}`);
  console.log(`      Expected: $${totals.netIncome.toFixed(2)}`);
  console.log(`      ${Math.abs(calculatedNetIncome - totals.netIncome) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
  
  console.log('\n📋 FINAL TOTALS:');
  console.log(`   Net Income Before Taxes:         $${totals.netIncomeBeforeTaxes.toFixed(2)}`);
  console.log(`   Income Tax Expense:             $${totals.incomeTaxExpense.toFixed(2)}`);
  console.log(`   Income From Continuing Operations: $${totals.incomeFromContinuingOperations.toFixed(2)}`);
  console.log(`   Below-the-Line:                  $${totals.belowTheLine.toFixed(2)}`);
  console.log(`   Net Income:                      $${totals.netIncome.toFixed(2)}`);
  
  // Verify account balance calculations
  console.log('\n\n🔍 ACCOUNT BALANCE CALCULATION VERIFICATION:');
  console.log('='.repeat(80));
  
  // Check Revenue accounts
  console.log('\n📊 REVENUE ACCOUNTS:');
  for (const account of sections.revenue.accounts) {
    const totalDebits = account.transactions.reduce((sum, t) => sum + t.debitAmount, 0);
    const totalCredits = account.transactions.reduce((sum, t) => sum + t.creditAmount, 0);
    const calculatedNet = totalCredits - totalDebits; // Revenue: Credits - Debits
    
    console.log(`\n   Account: ${account.accountNo} - ${account.accountName}`);
    console.log(`      Total Debits:  $${totalDebits.toFixed(2)}`);
    console.log(`      Total Credits: $${totalCredits.toFixed(2)}`);
    console.log(`      Net (Credits - Debits): $${calculatedNet.toFixed(2)}`);
    console.log(`      Account Balance: $${account.netAmount.toFixed(2)}`);
    console.log(`      ${Math.abs(calculatedNet - account.netAmount) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
  }
  
  // Check Expense accounts
  console.log('\n📊 OPERATING EXPENSE ACCOUNTS:');
  for (const account of sections.operatingExpenses.accounts) {
    const totalDebits = account.transactions.reduce((sum, t) => sum + t.debitAmount, 0);
    const totalCredits = account.transactions.reduce((sum, t) => sum + t.creditAmount, 0);
    const calculatedNet = totalDebits - totalCredits; // Expense: Debits - Credits
    
    console.log(`\n   Account: ${account.accountNo} - ${account.accountName}`);
    console.log(`      Total Debits:  $${totalDebits.toFixed(2)}`);
    console.log(`      Total Credits: $${totalCredits.toFixed(2)}`);
    console.log(`      Net (Debits - Credits): $${calculatedNet.toFixed(2)}`);
    console.log(`      Account Balance: $${account.netAmount.toFixed(2)}`);
    console.log(`      ${Math.abs(calculatedNet - account.netAmount) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
  }
  
  // Check Income Tax accounts
  if (sections.incomeTax.accounts.length > 0) {
    console.log('\n📊 INCOME TAX ACCOUNTS:');
    for (const account of sections.incomeTax.accounts) {
      const totalDebits = account.transactions.reduce((sum, t) => sum + t.debitAmount, 0);
      const totalCredits = account.transactions.reduce((sum, t) => sum + t.creditAmount, 0);
      const calculatedNet = totalDebits - totalCredits; // Expense: Debits - Credits
      
      console.log(`\n   Account: ${account.accountNo} - ${account.accountName}`);
      console.log(`      Total Debits:  $${totalDebits.toFixed(2)}`);
      console.log(`      Total Credits: $${totalCredits.toFixed(2)}`);
      console.log(`      Net (Debits - Credits): $${calculatedNet.toFixed(2)}`);
      console.log(`      Account Balance: $${account.netAmount.toFixed(2)}`);
      console.log(`      ${Math.abs(calculatedNet - account.netAmount) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
    }
  }
  
  // Check Below-the-Line accounts
  if (sections.belowTheLine.accounts.length > 0) {
    console.log('\n📊 BELOW-THE-LINE ACCOUNTS:');
    for (const account of sections.belowTheLine.accounts) {
      const totalDebits = account.transactions.reduce((sum, t) => sum + t.debitAmount, 0);
      const totalCredits = account.transactions.reduce((sum, t) => sum + t.creditAmount, 0);
      
      // Below-the-line can be income (Revenue type) or expense (Expense type)
      let calculatedNet;
      if (account.accountType === "Revenue") {
        calculatedNet = totalCredits - totalDebits; // Revenue: Credits - Debits
      } else if (account.accountType === "Expense") {
        calculatedNet = totalDebits - totalCredits; // Expense: Debits - Credits
      } else {
        calculatedNet = totalCredits - totalDebits; // Default to revenue calculation
      }
      
      console.log(`\n   Account: ${account.accountNo} - ${account.accountName} (Type: ${account.accountType})`);
      console.log(`      Total Debits:  $${totalDebits.toFixed(2)}`);
      console.log(`      Total Credits: $${totalCredits.toFixed(2)}`);
      console.log(`      Net Calculation: $${calculatedNet.toFixed(2)}`);
      console.log(`      Account Balance: $${account.netAmount.toFixed(2)}`);
      console.log(`      Amount Used: $${account.amount.toFixed(2)}`);
      console.log(`      ${Math.abs(calculatedNet - account.netAmount) < 0.01 ? '✅ MATCH' : '❌ MISMATCH'}`);
    }
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('✅ FORMULA VERIFICATION COMPLETE');
  console.log('='.repeat(80));
}

async function main() {
  try {
    await login();
    
    console.log('📊 Fetching Income Statement...\n');
    const response = await axios.get(`${BASE_URL}/api/accounting/income-statement`, {
      params: {
        startDate: '2025-01-01',
        endDate: '2025-11-21'
      },
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (response.data.success) {
      analyzeIncomeStatementFormula(response.data);
    } else {
      console.error('❌ Failed to fetch income statement:', response.data.message);
    }
  } catch (error) {
    console.error('\n❌ Error:', error.response?.data || error.message);
    console.error(error.stack);
  }
}

main();


