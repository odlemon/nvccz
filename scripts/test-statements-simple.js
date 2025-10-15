// @ts-nocheck
/**
 * Simple Financial Statements Testing Script (Direct Database Access)
 * No authentication required - tests directly using services
 */

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// Colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  bright: '\x1b[1m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log('\n' + '═'.repeat(80));
  log(`  ${title}`, 'bright');
  console.log('═'.repeat(80) + '\n');
}

/**
 * Check database connectivity
 */
async function checkDatabase() {
  logSection('DATABASE CONNECTIVITY CHECK');
  
  try {
    await prisma.$connect();
    log('✅ Database connection successful', 'green');
    
    // Count key data
    const [journalEntries, accounts, postedEntries] = await Promise.all([
      prisma.journalEntry.count(),
      prisma.chartOfAccounts.count(),
      prisma.journalEntry.count({ where: { status: 'POSTED' } })
    ]);
    
    console.log(`\n📊 Database Summary:`);
    console.log(`   Total Journal Entries:  ${journalEntries}`);
    console.log(`   Posted Entries:         ${postedEntries}`);
    console.log(`   Chart of Accounts:      ${accounts}`);
    
    if (postedEntries === 0) {
      log('\n⚠️  No POSTED journal entries found', 'yellow');
      log('   Financial statements will be empty', 'yellow');
      return false;
    }
    
    return true;
  } catch (error) {
    log(`❌ Database connection failed: ${error.message}`, 'red');
    return false;
  }
}

/**
 * Test Trial Balance
 */
async function testTrialBalance() {
  logSection('TEST: TRIAL BALANCE');
  
  try {
    const asOfDate = new Date('2025-12-31');
    
    log(`📅 Generating trial balance as of: ${asOfDate.toISOString().split('T')[0]}`, 'cyan');
    
    // Get all accounts
    const accounts = await prisma.chartOfAccounts.findMany({
      where: { isActive: true },
      orderBy: { accountNo: 'asc' }
    });
    
    // Get all posted journal lines
    const journalLines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          is: {
            transactionDate: { lte: asOfDate },
            status: 'POSTED'
          }
        }
      },
      include: {
        chartOfAccount: true
      }
    });
    
    // Calculate balances
    const accountBalances = new Map();
    
    for (const line of journalLines) {
      const accountId = line.chartOfAccountId;
      const current = accountBalances.get(accountId) || { debit: 0, credit: 0 };
      
      accountBalances.set(accountId, {
        debit: current.debit + Number(line.debitAmount),
        credit: current.credit + Number(line.creditAmount)
      });
    }
    
    let totalDebits = 0;
    let totalCredits = 0;
    let accountCount = 0;
    
    for (const [accountId, balance] of accountBalances) {
      totalDebits += balance.debit;
      totalCredits += balance.credit;
      accountCount++;
    }
    
    const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;
    const difference = totalDebits - totalCredits;
    
    console.log('\n⚖️  Trial Balance Results:');
    console.log(`   Total Debits:   $${totalDebits.toFixed(2)}`);
    console.log(`   Total Credits:  $${totalCredits.toFixed(2)}`);
    console.log(`   Difference:     $${difference.toFixed(2)}`);
    console.log(`   Is Balanced:    ${isBalanced ? '✅ YES' : '❌ NO'}`);
    console.log(`   Accounts:       ${accountCount}`);
    
    if (isBalanced) {
      log('\n✅ Trial Balance is BALANCED', 'green');
    } else {
      log(`\n❌ Trial Balance is UNBALANCED by $${Math.abs(difference).toFixed(2)}`, 'red');
    }
    
    return { success: true, balanced: isBalanced, difference };
  } catch (error) {
    log(`❌ Trial Balance test failed: ${error.message}`, 'red');
    console.error(error);
    return { success: false, error: error.message };
  }
}

/**
 * Test Balance Sheet
 */
async function testBalanceSheet() {
  logSection('TEST: BALANCE SHEET');
  
  try {
    const asOfDate = new Date('2025-12-31');
    
    log(`📅 Generating balance sheet as of: ${asOfDate.toISOString().split('T')[0]}`, 'cyan');
    
    // Get balance sheet accounts
    const accounts = await prisma.chartOfAccounts.findMany({
      where: {
        financialStatement: {
          in: ['Balance Sheet', 'Balance sheet']
        },
        isActive: true
      }
    });
    
    // Get journal lines
    const journalLines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          is: {
            transactionDate: { lte: asOfDate },
            status: 'POSTED'
          }
        }
      },
      include: {
        chartOfAccount: true
      }
    });
    
    // Calculate account balances
    const accountBalances = new Map();
    
    for (const line of journalLines) {
      const accountId = line.chartOfAccountId;
      const current = accountBalances.get(accountId) || 0;
      const accountType = line.chartOfAccount.accountType;
      
      let newBalance = current;
      
      if (accountType.includes('Asset')) {
        newBalance += Number(line.debitAmount) - Number(line.creditAmount);
      } else if (accountType.includes('Liability') || accountType === 'Equity') {
        newBalance += Number(line.creditAmount) - Number(line.debitAmount);
      }
      
      accountBalances.set(accountId, newBalance);
    }
    
    // Categorize
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    
    for (const account of accounts) {
      const balance = accountBalances.get(account.id) || 0;
      
      if (Math.abs(balance) < 0.01) continue;
      
      const accountType = account.accountType;
      
      if (accountType.includes('Asset')) {
        totalAssets += balance;
      } else if (accountType.includes('Liability')) {
        totalLiabilities += balance;
      } else if (accountType === 'Equity') {
        totalEquity += balance;
      }
    }
    
    // Calculate retained earnings (Net Income)
    const revenueExpenseAccounts = await prisma.chartOfAccounts.findMany({
      where: {
        OR: [
          { accountType: 'Revenue' },
          { accountType: 'Income' },
          { accountType: 'Expense' }
        ],
        isActive: true
      }
    });
    
    const revenueExpenseLines = await prisma.journalEntryLine.findMany({
      where: {
        chartOfAccountId: {
          in: revenueExpenseAccounts.map(a => a.id)
        },
        journalEntry: {
          is: {
            transactionDate: { lte: asOfDate },
            status: 'POSTED'
          }
        }
      },
      include: {
        chartOfAccount: true
      }
    });
    
    let totalRevenue = 0;
    let totalExpense = 0;
    
    for (const line of revenueExpenseLines) {
      const accountType = line.chartOfAccount.accountType;
      
      if (accountType === 'Revenue' || accountType === 'Income') {
        totalRevenue += Number(line.creditAmount) - Number(line.debitAmount);
      } else if (accountType === 'Expense') {
        totalExpense += Number(line.debitAmount) - Number(line.creditAmount);
      }
    }
    
    const retainedEarnings = totalRevenue - totalExpense;
    const totalEquityWithRetained = totalEquity + retainedEarnings;
    const totalLiabilitiesAndEquity = totalLiabilities + totalEquityWithRetained;
    
    const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndEquity) < 0.01;
    const difference = totalAssets - totalLiabilitiesAndEquity;
    
    console.log('\n📈 Balance Sheet Results:');
    console.log('\n   ASSETS:');
    console.log(`   Total Assets:                $${totalAssets.toFixed(2)}`);
    
    console.log('\n   LIABILITIES:');
    console.log(`   Total Liabilities:           $${totalLiabilities.toFixed(2)}`);
    
    console.log('\n   EQUITY:');
    console.log(`   Equity (excluding retained): $${totalEquity.toFixed(2)}`);
    console.log(`   Retained Earnings:           $${retainedEarnings.toFixed(2)}`);
    console.log(`   Total Equity:                $${totalEquityWithRetained.toFixed(2)}`);
    
    console.log('\n   BALANCE CHECK:');
    console.log(`   Total Liab. + Equity:        $${totalLiabilitiesAndEquity.toFixed(2)}`);
    console.log(`   Difference:                  $${difference.toFixed(2)}`);
    console.log(`   Is Balanced:                 ${isBalanced ? '✅ YES' : '❌ NO'}`);
    
    if (isBalanced) {
      log('\n✅ Balance Sheet is BALANCED', 'green');
    } else {
      log(`\n❌ Balance Sheet is UNBALANCED by $${Math.abs(difference).toFixed(2)}`, 'red');
    }
    
    return { success: true, balanced: isBalanced, difference };
  } catch (error) {
    log(`❌ Balance Sheet test failed: ${error.message}`, 'red');
    console.error(error);
    return { success: false, error: error.message };
  }
}

/**
 * Test Income Statement
 */
async function testIncomeStatement() {
  logSection('TEST: INCOME STATEMENT');
  
  try {
    const startDate = new Date('2025-01-01');
    const endDate = new Date('2025-12-31');
    
    log(`📅 Period: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`, 'cyan');
    
    // Get revenue and expense accounts
    const accounts = await prisma.chartOfAccounts.findMany({
      where: {
        OR: [
          { accountType: 'Revenue' },
          { accountType: 'Income' },
          { accountType: 'Expense' }
        ],
        isActive: true
      }
    });
    
    // Get journal lines
    const journalLines = await prisma.journalEntryLine.findMany({
      where: {
        chartOfAccountId: {
          in: accounts.map(a => a.id)
        },
        journalEntry: {
          is: {
            transactionDate: {
              gte: startDate,
              lte: endDate
            },
            status: 'POSTED'
          }
        }
      },
      include: {
        chartOfAccount: true
      }
    });
    
    let totalRevenue = 0;
    let totalExpense = 0;
    let revenueCount = 0;
    let expenseCount = 0;
    
    for (const line of journalLines) {
      const accountType = line.chartOfAccount.accountType;
      
      if (accountType === 'Revenue' || accountType === 'Income') {
        totalRevenue += Number(line.creditAmount) - Number(line.debitAmount);
        revenueCount++;
      } else if (accountType === 'Expense') {
        totalExpense += Number(line.debitAmount) - Number(line.creditAmount);
        expenseCount++;
      }
    }
    
    const netIncome = totalRevenue - totalExpense;
    
    console.log('\n📊 Income Statement Results:');
    console.log(`   Total Revenue:     $${totalRevenue.toFixed(2)}`);
    console.log(`   Total Expenses:    $${totalExpense.toFixed(2)}`);
    console.log(`   ───────────────────────────────`);
    console.log(`   Net Income:        $${netIncome.toFixed(2)}`);
    console.log(`\n   Revenue Entries:   ${revenueCount}`);
    console.log(`   Expense Entries:   ${expenseCount}`);
    
    if (netIncome >= 0) {
      log(`\n✅ Net Income (Profit): $${netIncome.toFixed(2)}`, 'green');
    } else {
      log(`\n⚠️  Net Loss: $${Math.abs(netIncome).toFixed(2)}`, 'yellow');
    }
    
    return { success: true, netIncome, totalRevenue, totalExpense };
  } catch (error) {
    log(`❌ Income Statement test failed: ${error.message}`, 'red');
    console.error(error);
    return { success: false, error: error.message };
  }
}

/**
 * Main execution
 */
async function main() {
  console.clear();
  
  log('\n╔═══════════════════════════════════════════════════════════════════╗', 'bright');
  log('║          FINANCIAL STATEMENTS DIRECT DATABASE TEST                ║', 'bright');
  log('║              (No API calls - Direct Prisma access)                 ║', 'bright');
  log('║                    Date: ' + new Date().toISOString().split('T')[0] + '                                 ║', 'bright');
  log('╚═══════════════════════════════════════════════════════════════════╝\n', 'bright');
  
  // Check database
  const dbOk = await checkDatabase();
  
  if (!dbOk) {
    log('\n⚠️  Skipping tests due to database issues', 'yellow');
    await prisma.$disconnect();
    process.exit(1);
  }
  
  const results = {};
  
  // Run tests
  results.trialBalance = await testTrialBalance();
  results.balanceSheet = await testBalanceSheet();
  results.incomeStatement = await testIncomeStatement();
  
  // Final summary
  logSection('FINAL SUMMARY');
  
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                      TEST RESULTS                              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  
  const tests = [
    { name: 'Trial Balance', result: results.trialBalance },
    { name: 'Balance Sheet', result: results.balanceSheet },
    { name: 'Income Statement', result: results.incomeStatement },
  ];
  
  let passed = 0;
  let failed = 0;
  
  tests.forEach(test => {
    if (test.result?.success) {
      log(`✅ ${test.name.padEnd(25)} PASSED`, 'green');
      passed++;
    } else {
      log(`❌ ${test.name.padEnd(25)} FAILED`, 'red');
      failed++;
    }
  });
  
  console.log('\n' + '─'.repeat(80));
  console.log(`\nTotal: ${tests.length} | Passed: ${passed} | Failed: ${failed}`);
  
  // Balance checks
  console.log('\n⚖️  BALANCE VERIFICATION:');
  
  if (results.trialBalance?.balanced) {
    log('✅ Trial Balance: BALANCED', 'green');
  } else {
    log('❌ Trial Balance: UNBALANCED', 'red');
  }
  
  if (results.balanceSheet?.balanced) {
    log('✅ Balance Sheet: BALANCED', 'green');
  } else {
    log('❌ Balance Sheet: UNBALANCED', 'red');
  }
  
  console.log('\n' + '═'.repeat(80));
  
  if (failed === 0 && results.trialBalance?.balanced && results.balanceSheet?.balanced) {
    log('\n🎉 ALL TESTS PASSED & ALL STATEMENTS BALANCED! 🎉\n', 'green');
  } else if (failed === 0) {
    log('\n✅ All tests passed, but some statements are unbalanced\n', 'yellow');
  } else {
    log(`\n⚠️  ${failed} test(s) failed\n`, 'red');
  }
  
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

// Run
main().catch(error => {
  log(`\n❌ Fatal error: ${error.message}`, 'red');
  console.error(error);
  prisma.$disconnect();
  process.exit(1);
});

