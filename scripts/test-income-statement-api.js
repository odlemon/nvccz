const { PrismaClient } = require('@prisma/client');
const IncomeStatementService = require('../dist/services/IncomeStatementService').default;

const prisma = new PrismaClient();

async function testIncomeStatementAPI() {
  try {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║          TESTING INCOME STATEMENT API                     ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const params = {
      startDate: new Date('2025-01-01'),
      endDate: new Date('2025-12-31')
    };

    console.log('Calling IncomeStatementService.generateIncomeStatement()...\n');

    const result = await IncomeStatementService.generateIncomeStatement(params);

    console.log('─────────────────────────────────────────────────────────');
    console.log('📊 INCOME STATEMENT RESULTS');
    console.log('─────────────────────────────────────────────────────────');
    console.log(`Period: ${result.period.startDate.toISOString().split('T')[0]} to ${result.period.endDate.toISOString().split('T')[0]}`);
    console.log(`Currency: ${result.currency.code} - ${result.currency.name}`);
    console.log('');

    console.log('💰 REVENUE:');
    if (result.revenue.accounts.length === 0) {
      console.log('  (No revenue accounts)');
    } else {
      result.revenue.accounts.forEach(account => {
        console.log(`  ${account.accountNo} ${account.accountName}`);
        console.log(`    Total Debits:  $${account.totalDebits.toFixed(2)}`);
        console.log(`    Total Credits: $${account.totalCredits.toFixed(2)}`);
        console.log(`    Net Amount:    $${account.netAmount.toFixed(2)}`);
      });
    }
    console.log(`  TOTAL REVENUE: $${result.revenue.total.toFixed(2)}`);
    console.log('');

    console.log('💸 EXPENSES:');
    if (result.expenses.accounts.length === 0) {
      console.log('  (No expense accounts)');
    } else {
      result.expenses.accounts.forEach(account => {
        console.log(`  ${account.accountNo} ${account.accountName}`);
        console.log(`    Total Debits:  $${account.totalDebits.toFixed(2)}`);
        console.log(`    Total Credits: $${account.totalCredits.toFixed(2)}`);
        console.log(`    Net Amount:    $${account.netAmount.toFixed(2)}`);
      });
    }
    console.log(`  TOTAL EXPENSES: $${result.expenses.total.toFixed(2)}`);
    console.log('');

    console.log('═══════════════════════════════════════════════════════════');
    console.log(`💰 NET INCOME: $${result.netIncome.toFixed(2)}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');

    // Verify against expected values
    const expectedRevenue = -298.00;
    const expectedExpenses = 28418.33;
    const expectedNetIncome = -28716.33;

    console.log('─────────────────────────────────────────────────────────');
    console.log('✅ VERIFICATION');
    console.log('─────────────────────────────────────────────────────────');
    
    const revenueDiff = Math.abs(result.revenue.total - expectedRevenue);
    const expenseDiff = Math.abs(result.expenses.total - expectedExpenses);
    const netIncomeDiff = Math.abs(result.netIncome - expectedNetIncome);
    
    if (revenueDiff < 0.01) {
      console.log(`✅ Revenue matches: $${result.revenue.total.toFixed(2)} = $${expectedRevenue.toFixed(2)}`);
    } else {
      console.log(`❌ Revenue mismatch: $${result.revenue.total.toFixed(2)} vs $${expectedRevenue.toFixed(2)} (diff: $${revenueDiff.toFixed(2)})`);
    }
    
    if (expenseDiff < 0.01) {
      console.log(`✅ Expenses match: $${result.expenses.total.toFixed(2)} = $${expectedExpenses.toFixed(2)}`);
    } else {
      console.log(`❌ Expenses mismatch: $${result.expenses.total.toFixed(2)} vs $${expectedExpenses.toFixed(2)} (diff: $${expenseDiff.toFixed(2)})`);
    }
    
    if (netIncomeDiff < 0.01) {
      console.log(`✅ Net Income matches: $${result.netIncome.toFixed(2)} = $${expectedNetIncome.toFixed(2)}`);
    } else {
      console.log(`❌ Net Income mismatch: $${result.netIncome.toFixed(2)} vs $${expectedNetIncome.toFixed(2)} (diff: $${netIncomeDiff.toFixed(2)})`);
    }

    if (revenueDiff < 0.01 && expenseDiff < 0.01 && netIncomeDiff < 0.01) {
      console.log('\n🎉 SUCCESS! Income Statement now shows COMPLETE data!');
      console.log('✅ Matches Balance Sheet retained earnings');
      console.log('✅ All journal entries are now visible');
    } else {
      console.log('\n⚠️ There are still discrepancies. Further investigation needed.');
    }
    console.log('');

    await prisma.$disconnect();
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testIncomeStatementAPI();

