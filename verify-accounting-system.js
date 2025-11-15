const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyAccountingSystem() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('✅ VERIFYING ACCOUNTING SYSTEM');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // 1. Check Chart of Accounts
    console.log('1️⃣  Checking Chart of Accounts...\n');
    
    const allAccounts = await prisma.chartOfAccounts.findMany({
      select: {
        accountNo: true,
        accountName: true,
        accountType: true,
        financialStatement: true,
        isActive: true
      },
      orderBy: {
        accountNo: 'asc'
      }
    });

    console.log(`   Found ${allAccounts.length} total account(s)\n`);

    // Required accounts from the document
    const requiredAccountNos = [
      '1100', '1110', '1120', '1200', '1300', '1350', '1400',
      '1500', '1520', '1550',
      '2000', '2050', '2110', '2150', '2160', '2200',
      '3000', '3100', '3200',
      '4001', '4002', '4050',
      '5010', '5020', '5100', '5130', '5160',
      '6000', '6050', '6100', '6150', '6200'
    ];

    const existingAccountNos = allAccounts.map(a => a.accountNo);
    const missingAccounts = requiredAccountNos.filter(no => !existingAccountNos.includes(no));

    if (missingAccounts.length > 0) {
      console.log(`   ⚠️  Missing ${missingAccounts.length} required account(s): ${missingAccounts.join(', ')}\n`);
    } else {
      console.log(`   ✅ All required accounts are present\n`);
    }

    // Group by account type
    const accountsByType = {};
    allAccounts.forEach(acc => {
      if (!accountsByType[acc.accountType]) {
        accountsByType[acc.accountType] = [];
      }
      accountsByType[acc.accountType].push(acc);
    });

    console.log('   Accounts by type:');
    Object.keys(accountsByType).forEach(type => {
      console.log(`     - ${type}: ${accountsByType[type].length} account(s)`);
    });
    console.log('');

    // 2. Check for journal entries
    console.log('2️⃣  Checking Journal Entries...\n');
    
    const journalEntries = await prisma.journalEntry.findMany({
      select: {
        id: true,
        status: true
      }
    });

    const postedEntries = journalEntries.filter(je => je.status === 'POSTED').length;
    const pendingEntries = journalEntries.filter(je => je.status === 'PENDING').length;
    const voidedEntries = journalEntries.filter(je => je.status === 'VOID').length;

    console.log(`   Total Journal Entries: ${journalEntries.length}`);
    console.log(`     - POSTED: ${postedEntries}`);
    console.log(`     - PENDING: ${pendingEntries}`);
    console.log(`     - VOID: ${voidedEntries}\n`);

    // 3. Check for cashbook entries
    console.log('3️⃣  Checking Cashbook Entries...\n');
    
    const cashbookEntries = await prisma.cashbookEntry.findMany({
      select: {
        id: true,
        status: true
      }
    });

    console.log(`   Total Cashbook Entries: ${cashbookEntries.length}\n`);

    // 4. Check for invoices
    console.log('4️⃣  Checking Invoices...\n');
    
    const invoices = await prisma.invoice.findMany({
      select: {
        id: true,
        status: true,
        paidAmount: true
      }
    });

    const paidInvoices = invoices.filter(inv => inv.status === 'PAID' || inv.paidAmount > 0).length;
    console.log(`   Total Invoices: ${invoices.length}`);
    console.log(`     - Paid/Partially Paid: ${paidInvoices}\n`);

    // 5. Check for expenses
    console.log('5️⃣  Checking Expenses...\n');
    
    const expenses = await prisma.expense.findMany({
      select: {
        id: true,
        status: true
      }
    });

    const postedExpenses = expenses.filter(exp => exp.status === 'POSTED').length;
    console.log(`   Total Expenses: ${expenses.length}`);
    console.log(`     - POSTED: ${postedExpenses}\n`);

    // 6. Verify double-entry balance
    console.log('6️⃣  Verifying Double-Entry Balance...\n');
    
    const journalEntryLines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          status: 'POSTED'
        }
      },
      select: {
        debitAmount: true,
        creditAmount: true
      }
    });

    let totalDebits = 0;
    let totalCredits = 0;

    journalEntryLines.forEach(line => {
      totalDebits += parseFloat(line.debitAmount) || 0;
      totalCredits += parseFloat(line.creditAmount) || 0;
    });

    const difference = Math.abs(totalDebits - totalCredits);
    const isBalanced = difference < 0.01; // Allow for rounding

    console.log(`   Total Debits: ${totalDebits.toFixed(2)}`);
    console.log(`   Total Credits: ${totalCredits.toFixed(2)}`);
    console.log(`   Difference: ${difference.toFixed(2)}`);

    if (isBalanced) {
      console.log(`   ✅ Double-entry is balanced!\n`);
    } else {
      console.log(`   ⚠️  Double-entry is NOT balanced! Difference: ${difference.toFixed(2)}\n`);
    }

    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 VERIFICATION SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    const issues = [];
    if (missingAccounts.length > 0) {
      issues.push(`Missing ${missingAccounts.length} required chart of accounts`);
    }
    if (!isBalanced) {
      issues.push(`Double-entry not balanced (difference: ${difference.toFixed(2)})`);
    }
    if (paidInvoices > 0) {
      issues.push(`${paidInvoices} invoice(s) with paid status (should be reset)`);
    }
    if (postedExpenses > 0) {
      issues.push(`${postedExpenses} expense(s) with POSTED status (should be reset)`);
    }

    if (issues.length === 0) {
      console.log('✅ All checks passed! Accounting system is ready.\n');
    } else {
      console.log('⚠️  Issues found:\n');
      issues.forEach((issue, index) => {
        console.log(`   ${index + 1}. ${issue}`);
      });
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error during verification:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verifyAccountingSystem()
  .then(() => {
    console.log('✅ Verification completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  });

