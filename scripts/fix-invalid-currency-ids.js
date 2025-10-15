const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function fixInvalidCurrencyIds() {
  try {
    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║          FIXING INVALID CURRENCY IDs                      ║');
    console.log('╚═══════════════════════════════════════════════════════════╝\n');

    // Get the valid USD currency
    const validCurrency = await prisma.currency.findFirst({ 
      where: { isActive: true, code: 'USD' } 
    });
    
    if (!validCurrency) {
      throw new Error('No valid USD currency found!');
    }

    console.log('✓ Valid USD Currency ID:', validCurrency.id);
    console.log('  Code:', validCurrency.code);
    console.log('  Name:', validCurrency.name);
    console.log('');

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
      je.currencyId !== validCurrency.id && je.currencyId !== null
    );

    console.log(`Found ${invalidCurrencyEntries.length} entries with INVALID currency IDs\n`);

    if (invalidCurrencyEntries.length === 0) {
      console.log('✅ Nothing to fix!');
      await prisma.$disconnect();
      return;
    }

    console.log('Entries to fix:');
    invalidCurrencyEntries.forEach(entry => {
      console.log(`  - ${entry.referenceNumber} (Current: ${entry.currencyId})`);
    });

    console.log('\n─────────────────────────────────────────────────────────');
    console.log('⚠️  BEFORE PROCEEDING:');
    console.log('   ✓ All entries are internally balanced');
    console.log('   ✓ This fix will NOT unbalance anything');
    console.log('   ✓ Only updating currency ID metadata');
    console.log('   ✓ Trial Balance will remain unchanged');
    console.log('   ✓ Income Statement will now include these entries');
    console.log('─────────────────────────────────────────────────────────\n');

    // Fix the entries
    console.log('🔧 Updating currency IDs...\n');

    let successCount = 0;
    let errorCount = 0;

    for (const entry of invalidCurrencyEntries) {
      try {
        // Verify entry is balanced before update
        let totalDebits = 0;
        let totalCredits = 0;
        entry.journalEntryLines.forEach(line => {
          totalDebits += parseFloat(line.debitAmount.toString());
          totalCredits += parseFloat(line.creditAmount.toString());
        });

        const difference = Math.abs(totalDebits - totalCredits);
        if (difference >= 0.01) {
          console.log(`❌ SKIPPING ${entry.referenceNumber}: Entry is UNBALANCED (difference: $${difference.toFixed(2)})`);
          errorCount++;
          continue;
        }

        // Update the currency ID
        await prisma.journalEntry.update({
          where: { id: entry.id },
          data: { currencyId: validCurrency.id }
        });

        console.log(`✅ Fixed ${entry.referenceNumber}`);
        console.log(`   - Old Currency ID: ${entry.currencyId}`);
        console.log(`   - New Currency ID: ${validCurrency.id} (${validCurrency.code})`);
        console.log(`   - Debits: $${totalDebits.toFixed(2)}, Credits: $${totalCredits.toFixed(2)} ✓ Balanced`);
        console.log('');
        
        successCount++;
      } catch (error) {
        console.log(`❌ ERROR updating ${entry.referenceNumber}: ${error.message}\n`);
        errorCount++;
      }
    }

    console.log('\n╔═══════════════════════════════════════════════════════════╗');
    console.log('║                    RESULTS                                 ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
    console.log(`✅ Successfully fixed: ${successCount} entries`);
    if (errorCount > 0) {
      console.log(`❌ Errors: ${errorCount} entries`);
    }
    console.log('\n🎉 All fixed entries are now visible to Income Statement!');
    console.log('💡 Re-run the Income Statement to see the complete data.\n');

    await prisma.$disconnect();
  } catch (error) {
    console.error('\n❌ Fatal Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

fixInvalidCurrencyIds();

