const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function diagnoseIncomeStatement() {
  try {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║          INCOME STATEMENT DATA AUDIT                      ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    // Get default currency
    const defaultCurrency = await prisma.currency.findFirst({ 
      where: { isActive: true } 
    });
    console.log('✓ Default Currency:', defaultCurrency?.code, '-', defaultCurrency?.name);
    console.log('  Currency ID:', defaultCurrency?.id);

    // Get all posted journal entries in 2025
    const allJournalEntries = await prisma.journalEntry.findMany({
      where: {
        transactionDate: {
          gte: new Date('2025-01-01'),
          lte: new Date('2025-12-31')
        },
        status: 'POSTED'
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: true
          }
        }
      }
    });

    console.log('\n─────────────────────────────────────────────────────────');
    console.log('📊 JOURNAL ENTRY COUNT');
    console.log('─────────────────────────────────────────────────────────');
    console.log('Total POSTED Journal Entries in 2025:', allJournalEntries.length);
    
    const entriesWithDefaultCurrency = allJournalEntries.filter(je => je.currencyId === defaultCurrency?.id);
    const entriesWithOtherCurrency = allJournalEntries.filter(je => je.currencyId !== defaultCurrency?.id && je.currencyId !== null);
    const entriesWithNullCurrency = allJournalEntries.filter(je => je.currencyId === null);
    
    console.log('  ├─ With Default Currency (USD):', entriesWithDefaultCurrency.length);
    console.log('  ├─ With Other Currency:', entriesWithOtherCurrency.length);
    console.log('  └─ With NULL Currency:', entriesWithNullCurrency.length);

    // Show entries with other/null currencies
    if (entriesWithOtherCurrency.length > 0) {
      console.log('\n⚠️  Entries with OTHER currencies:');
      for (const je of entriesWithOtherCurrency) {
        const currency = await prisma.currency.findUnique({ where: { id: je.currencyId } });
        console.log(`     ${je.referenceNumber}: ${currency?.code || 'UNKNOWN'} (${je.transactionDate.toISOString().split('T')[0]})`);
      }
    }

    if (entriesWithNullCurrency.length > 0) {
      console.log('\n⚠️  Entries with NULL currency:');
      entriesWithNullCurrency.forEach(je => {
        console.log(`     ${je.referenceNumber} (${je.transactionDate.toISOString().split('T')[0]})`);
      });
    }

    console.log('\n─────────────────────────────────────────────────────────');
    console.log('💰 REVENUE ACCOUNTS');
    console.log('─────────────────────────────────────────────────────────');
    
    const revenueLines = allJournalEntries.flatMap(je => 
      je.journalEntryLines.filter(line => line.chartOfAccount.accountType === 'Revenue')
    );
    
    console.log('Total Revenue Lines:', revenueLines.length);
    
    if (revenueLines.length > 0) {
      revenueLines.forEach(line => {
        const debit = parseFloat(line.debitAmount.toString());
        const credit = parseFloat(line.creditAmount.toString());
        const marker = debit > 0 ? '❌' : '✓';
        console.log(`  ${marker} ${line.chartOfAccount.accountName}:`);
        console.log(`     Debit=$${debit.toFixed(2)}, Credit=$${credit.toFixed(2)}`);
        if (debit > 0) {
          console.log(`     ⚠️  WARNING: Revenue account has DEBIT (should be CREDIT)`);
        }
      });
    } else {
      console.log('  (No revenue lines found)');
    }

    console.log('\n─────────────────────────────────────────────────────────');
    console.log('💸 EXPENSE ACCOUNTS');
    console.log('─────────────────────────────────────────────────────────');
    
    const expenseAccounts = new Map();
    allJournalEntries.forEach(je => {
      je.journalEntryLines.forEach(line => {
        if (line.chartOfAccount.accountType === 'Expense') {
          const key = line.chartOfAccount.accountName;
          if (!expenseAccounts.has(key)) {
            expenseAccounts.set(key, { debits: 0, credits: 0 });
          }
          expenseAccounts.get(key).debits += parseFloat(line.debitAmount.toString());
          expenseAccounts.get(key).credits += parseFloat(line.creditAmount.toString());
        }
      });
    });
    
    console.log('Total Unique Expense Accounts:', expenseAccounts.size);
    
    if (expenseAccounts.size > 0) {
      expenseAccounts.forEach((value, key) => {
        const net = value.debits - value.credits;
        console.log(`  ✓ ${key}:`);
        console.log(`     Net=$${net.toFixed(2)} (Debits=$${value.debits.toFixed(2)}, Credits=$${value.credits.toFixed(2)})`);
      });
    } else {
      console.log('  (No expense accounts found)');
    }

    const totalExpenses = Array.from(expenseAccounts.values()).reduce((sum, acc) => sum + (acc.debits - acc.credits), 0);
    const totalRevenue = revenueLines.reduce((sum, line) => 
      sum + (parseFloat(line.creditAmount.toString()) - parseFloat(line.debitAmount.toString())), 0
    );

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                    SUMMARY                                 ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`Total Revenue:    $${totalRevenue.toFixed(2)}`);
    console.log(`Total Expenses:   $${totalExpenses.toFixed(2)}`);
    console.log(`Net Income:       $${(totalRevenue - totalExpenses).toFixed(2)}`);
    console.log('\n');

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

diagnoseIncomeStatement();

