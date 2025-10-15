const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkInvalidCurrencyEntries() {
  try {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║     CHECKING ENTRIES WITH INVALID CURRENCY IDs            ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    const defaultCurrency = await prisma.currency.findFirst({ 
      where: { isActive: true } 
    });
    console.log('✓ Valid Currency ID:', defaultCurrency.id, `(${defaultCurrency.code})\n`);

    // Get all posted journal entries in 2025
    const allEntries = await prisma.journalEntry.findMany({
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

    // Find entries with invalid currency IDs
    const invalidCurrencyEntries = allEntries.filter(je => 
      je.currencyId !== defaultCurrency.id && je.currencyId !== null
    );

    console.log('Found', invalidCurrencyEntries.length, 'entries with INVALID currency IDs:\n');

    for (const entry of invalidCurrencyEntries) {
      console.log('─────────────────────────────────────────────────────────');
      console.log(`📄 ${entry.referenceNumber} (${entry.transactionDate.toISOString().split('T')[0]})`);
      console.log(`   Description: ${entry.description}`);
      console.log(`   Currency ID: ${entry.currencyId} (INVALID - doesn't exist in DB)`);
      
      let totalDebits = 0;
      let totalCredits = 0;
      
      console.log('\n   Lines:');
      entry.journalEntryLines.forEach(line => {
        const debit = parseFloat(line.debitAmount.toString());
        const credit = parseFloat(line.creditAmount.toString());
        totalDebits += debit;
        totalCredits += credit;
        
        console.log(`     ${line.chartOfAccount.accountNo} ${line.chartOfAccount.accountName}`);
        console.log(`       Debit: $${debit.toFixed(2)}, Credit: $${credit.toFixed(2)}`);
      });
      
      console.log(`\n   Total Debits:  $${totalDebits.toFixed(2)}`);
      console.log(`   Total Credits: $${totalCredits.toFixed(2)}`);
      const difference = Math.abs(totalDebits - totalCredits);
      
      if (difference < 0.01) {
        console.log('   ✅ BALANCED (Debits = Credits)');
      } else {
        console.log(`   ❌ UNBALANCED (Difference: $${difference.toFixed(2)})`);
      }
      console.log('');
    }

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                    CONCLUSION                              ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('If we fix the currency IDs to the valid USD currency:');
    console.log('  - These entries will become VISIBLE to Income Statement');
    console.log('  - Trial Balance will NOT be affected (already included)');
    console.log('  - AS LONG AS each entry is internally balanced\n');

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkInvalidCurrencyEntries();

