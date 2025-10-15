const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkRevenueDebitEntries() {
  try {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║     CHECKING REVENUE ENTRIES WITH DEBITS                  ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

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

    // Find entries that have revenue account debits
    const entriesWithRevenueDebits = allEntries.filter(entry =>
      entry.journalEntryLines.some(line => 
        line.chartOfAccount.accountType === 'Revenue' && 
        parseFloat(line.debitAmount.toString()) > 0
      )
    );

    console.log('Found', entriesWithRevenueDebits.length, 'entries with DEBITED revenue:\n');

    for (const entry of entriesWithRevenueDebits) {
      console.log('─────────────────────────────────────────────────────────');
      console.log(`📄 ${entry.referenceNumber} (${entry.transactionDate.toISOString().split('T')[0]})`);
      console.log(`   Description: ${entry.description}`);
      console.log(`   Currency ID: ${entry.currencyId || 'NULL'}`);
      
      let totalDebits = 0;
      let totalCredits = 0;
      
      console.log('\n   Lines:');
      entry.journalEntryLines.forEach(line => {
        const debit = parseFloat(line.debitAmount.toString());
        const credit = parseFloat(line.creditAmount.toString());
        totalDebits += debit;
        totalCredits += credit;
        
        const marker = line.chartOfAccount.accountType === 'Revenue' && debit > 0 ? '❌' : '  ';
        console.log(`   ${marker} ${line.chartOfAccount.accountNo} ${line.chartOfAccount.accountName} (${line.chartOfAccount.accountType})`);
        console.log(`       Debit: $${debit.toFixed(2)}, Credit: $${credit.toFixed(2)}`);
      });
      
      console.log(`\n   Total Debits:  $${totalDebits.toFixed(2)}`);
      console.log(`   Total Credits: $${totalCredits.toFixed(2)}`);
      const difference = Math.abs(totalDebits - totalCredits);
      
      if (difference < 0.01) {
        console.log('   ✅ Entry is BALANCED (Debits = Credits)');
      } else {
        console.log(`   ❌ Entry is UNBALANCED (Difference: $${difference.toFixed(2)})`);
      }
      
      // Check if this is a meaningless AR-to-AR entry
      const accountTypes = entry.journalEntryLines.map(l => l.chartOfAccount.accountType);
      const hasOnlyARandRevenue = accountTypes.every(t => t === 'Current Asset' || t === 'Revenue');
      
      if (hasOnlyARandRevenue) {
        console.log('   ⚠️  This appears to be a MEANINGLESS AR-to-Revenue entry');
        console.log('   💡 Recommendation: VOID this entire entry (it should not exist)');
      } else {
        console.log('   💡 Recommendation: This might be a legitimate sales return/refund');
        console.log('      Review manually before making changes');
      }
      console.log('');
    }

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                    CONCLUSION                              ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log('These entries have DEBITED revenue (backwards):');
    console.log('  - If they are meaningless AR-to-AR entries: VOID them');
    console.log('  - If they are legitimate refunds: Keep them (debiting revenue is correct)');
    console.log('\nIMPORTANT: Do NOT just "flip" individual lines!');
    console.log('  - Flipping would UNBALANCE the journal entry');
    console.log('  - Either VOID the entire entry, or leave it as-is\n');

    await prisma.$disconnect();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkRevenueDebitEntries();

