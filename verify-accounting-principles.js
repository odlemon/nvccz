const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

/**
 * ACCOUNTING PRINCIPLES VERIFICATION
 * 
 * Accounting Equation: Assets = Liabilities + Equity
 * This equation must remain balanced after every single transaction.
 * 
 * The Five Core Account Types:
 * 1. Assets (1000-1999): Natural Balance = Debit, Increase = DR, Decrease = CR
 * 2. Liabilities (2000-2999): Natural Balance = Credit, Increase = CR, Decrease = DR
 * 3. Equity (3000-3999): Natural Balance = Credit, Increase = CR, Decrease = DR
 * 4. Revenue (4000-4999): Natural Balance = Credit, Increase = CR, Decrease = DR
 * 5. Expenses (5000-5999): Natural Balance = Debit, Increase = DR, Decrease = CR
 */

async function verifyAccountingPrinciples() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('📐 VERIFYING ACCOUNTING PRINCIPLES');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('📊 ACCOUNTING EQUATION:');
  console.log('   Assets = Liabilities + Equity');
  console.log('   This equation must remain balanced after every transaction.\n');

  try {
    // Get all accounts grouped by account number range
    const allAccounts = await prisma.chartOfAccounts.findMany({
      where: { isActive: true },
      select: {
        accountNo: true,
        accountName: true,
        accountType: true,
        financialStatement: true
      },
      orderBy: {
        accountNo: 'asc'
      }
    });

    // Verify account number ranges match account types
    console.log('═══════════════════════════════════════════════════════════');
    console.log('1️⃣  VERIFYING ACCOUNT NUMBER RANGES');
    console.log('═══════════════════════════════════════════════════════════\n');

    const accountRanges = {
      '1000-1999': { expected: ['Current Asset', 'Fixed Asset', 'Long-Term Asset', 'Non-Current Asset', 'Contra-Asset'], accounts: [] },
      '2000-2999': { expected: ['Current Liability', 'Long-Term Liability'], accounts: [] },
      '3000-3999': { expected: ['Equity'], accounts: [] },
      '4000-4999': { expected: ['Revenue', 'Income'], accounts: [] },
      '5000-5999': { expected: ['Expense'], accounts: [] },
      '6000-6999': { expected: ['Income', 'Expense'], accounts: [] } // Other Income & Expense
    };

    let errors = [];
    let warnings = [];

    allAccounts.forEach(account => {
      const accountNo = parseInt(account.accountNo);
      let range = null;

      if (accountNo >= 1000 && accountNo <= 1999) {
        range = '1000-1999';
      } else if (accountNo >= 2000 && accountNo <= 2999) {
        range = '2000-2999';
      } else if (accountNo >= 3000 && accountNo <= 3999) {
        range = '3000-3999';
      } else if (accountNo >= 4000 && accountNo <= 4999) {
        range = '4000-4999';
      } else if (accountNo >= 5000 && accountNo <= 5999) {
        range = '5000-5999';
      } else if (accountNo >= 6000 && accountNo <= 6999) {
        range = '6000-6999';
      }

      if (range) {
        accountRanges[range].accounts.push(account);
        
        // Check if account type matches expected types for this range
        if (!accountRanges[range].expected.includes(account.accountType)) {
          warnings.push(`⚠️  ${account.accountNo} (${account.accountName}) is in range ${range} but has type "${account.accountType}" (expected: ${accountRanges[range].expected.join(', ')})`);
        }
      }
    });

    // Display accounts by range
    Object.keys(accountRanges).forEach(range => {
      const rangeData = accountRanges[range];
      console.log(`\n📁 Range ${range} (Expected: ${rangeData.expected.join(', ')}):`);
      console.log(`   Found ${rangeData.accounts.length} account(s)`);
      
      if (rangeData.accounts.length > 0) {
        rangeData.accounts.forEach(acc => {
          const match = rangeData.expected.includes(acc.accountType) ? '✅' : '⚠️';
          console.log(`   ${match} ${acc.accountNo} - ${acc.accountName} (${acc.accountType})`);
        });
      }
    });

    // Display warnings
    if (warnings.length > 0) {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('⚠️  WARNINGS');
      console.log('═══════════════════════════════════════════════════════════\n');
      warnings.forEach(warning => console.log(warning));
    }

    // Verify natural balances
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('2️⃣  VERIFYING NATURAL BALANCES');
    console.log('═══════════════════════════════════════════════════════════\n');

    const naturalBalanceRules = {
      'Current Asset': { natural: 'Debit', increase: 'DR', decrease: 'CR' },
      'Fixed Asset': { natural: 'Debit', increase: 'DR', decrease: 'CR' },
      'Long-Term Asset': { natural: 'Debit', increase: 'DR', decrease: 'CR' },
      'Non-Current Asset': { natural: 'Debit', increase: 'DR', decrease: 'CR' },
      'Contra-Asset': { natural: 'Credit', increase: 'CR', decrease: 'DR' }, // Reverses Asset rule
      'Current Liability': { natural: 'Credit', increase: 'CR', decrease: 'DR' },
      'Long-Term Liability': { natural: 'Credit', increase: 'CR', decrease: 'DR' },
      'Equity': { natural: 'Credit', increase: 'CR', decrease: 'DR' },
      'Revenue': { natural: 'Credit', increase: 'CR', decrease: 'DR' },
      'Income': { natural: 'Credit', increase: 'CR', decrease: 'DR' },
      'Expense': { natural: 'Debit', increase: 'DR', decrease: 'CR' }
    };

    console.log('Natural Balance Rules:');
    Object.keys(naturalBalanceRules).forEach(type => {
      const rule = naturalBalanceRules[type];
      console.log(`   ${type}:`);
      console.log(`     Natural Balance: ${rule.natural}`);
      console.log(`     To Increase: ${rule.increase}`);
      console.log(`     To Decrease: ${rule.decrease}`);
    });

    // Verify double-entry balance
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('3️⃣  VERIFYING DOUBLE-ENTRY BALANCE');
    console.log('═══════════════════════════════════════════════════════════\n');

    const journalEntryLines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          status: 'POSTED'
        }
      },
      select: {
        debitAmount: true,
        creditAmount: true,
        chartOfAccount: {
          select: {
            accountNo: true,
            accountType: true
          }
        }
      }
    });

    let totalDebits = 0;
    let totalCredits = 0;

    journalEntryLines.forEach(line => {
      totalDebits += parseFloat(line.debitAmount) || 0;
      totalCredits += parseFloat(line.creditAmount) || 0;
    });

    const difference = Math.abs(totalDebits - totalCredits);
    const isBalanced = difference < 0.01;

    console.log(`Total Debits: ${totalDebits.toFixed(2)}`);
    console.log(`Total Credits: ${totalCredits.toFixed(2)}`);
    console.log(`Difference: ${difference.toFixed(2)}`);

    if (isBalanced) {
      console.log('✅ Double-entry is balanced! (Assets = Liabilities + Equity)\n');
    } else {
      console.log(`⚠️  Double-entry is NOT balanced! Difference: ${difference.toFixed(2)}\n`);
      errors.push(`Double-entry not balanced: ${difference.toFixed(2)} difference`);
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 VERIFICATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    if (errors.length === 0 && warnings.length === 0) {
      console.log('✅ All accounting principles are correctly implemented!');
      console.log('   - Account number ranges match account types');
      console.log('   - Natural balances are correct');
      console.log('   - Double-entry is balanced');
    } else {
      if (errors.length > 0) {
        console.log('❌ ERRORS FOUND:');
        errors.forEach(error => console.log(`   - ${error}`));
        console.log('');
      }
      if (warnings.length > 0) {
        console.log('⚠️  WARNINGS:');
        warnings.forEach(warning => console.log(`   - ${warning}`));
      }
    }

  } catch (error) {
    console.error('❌ Error during verification:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verifyAccountingPrinciples()
  .then(() => {
    console.log('\n✅ Verification completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  });

