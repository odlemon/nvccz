const { PrismaClient } = require('@prisma/client');
const { Decimal } = require('@prisma/client/runtime/library');

const prisma = new PrismaClient();

async function verifyJournalEntries() {
  try {
    const invoiceId = process.argv[2] || 'cmijylwbs0001js049cgmeoy5';

    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('📊 VERIFYING JOURNAL ENTRIES FOR INVOICE PAYMENT');
    console.log('════════════════════════════════════════════════════════════════\n');

    console.log(`📋 Invoice ID: ${invoiceId}\n`);

    // Get invoice with all details
    const invoice = await prisma.procurementInvoice.findUnique({
      where: { id: invoiceId },
      include: {
        vendor: true,
        currency: true,
        journalEntry: {
          include: {
            journalEntryLines: {
              include: {
                chartOfAccount: {
                  select: {
                    id: true,
                    accountNo: true,
                    accountName: true,
                    accountType: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!invoice) {
      console.error(`❌ Invoice not found: ${invoiceId}`);
      process.exit(1);
    }

    console.log(`✅ Invoice Found: ${invoice.invoiceNumber}`);
    console.log(`   Vendor: ${invoice.vendor.name}`);
    console.log(`   Subtotal: ${invoice.currency?.symbol || '$'}${Number(invoice.subtotal).toFixed(2)}`);
    console.log(`   Tax Amount: ${invoice.currency?.symbol || '$'}${Number(invoice.taxAmount).toFixed(2)}`);
    console.log(`   Total Amount: ${invoice.currency?.symbol || '$'}${Number(invoice.totalAmount).toFixed(2)}`);
    console.log(`   Status: ${invoice.status}`);
    console.log(`   Payment Status: ${invoice.paymentStatus}`);
    console.log(`   Payment Date: ${invoice.paymentDate ? new Date(invoice.paymentDate).toLocaleString() : 'N/A'}`);
    console.log(`   Payment Reference: ${invoice.paymentReference || 'N/A'}`);
    
    const isTaxable = Number(invoice.taxAmount) > 0;
    console.log(`   Taxable: ${isTaxable ? 'YES' : 'NO'}`);
    if (isTaxable) {
      const vatRate = (Number(invoice.taxAmount) / Number(invoice.subtotal)) * 100;
      console.log(`   VAT Rate: ${vatRate.toFixed(2)}%`);
    }

    // Find all journal entries related to this invoice
    console.log('\n🔍 Searching for related journal entries...\n');
    
    const allEntries = await prisma.journalEntry.findMany({
      where: {
        OR: [
          { id: invoice.journalEntryId || 'none' },
          { description: { contains: invoice.invoiceNumber } },
          { referenceNumber: { contains: invoice.invoiceNumber } }
        ]
      },
      include: {
        journalEntryLines: {
          include: {
            chartOfAccount: {
              select: {
                id: true,
                accountNo: true,
                accountName: true,
                accountType: true
              }
            }
          },
          orderBy: [
            { debitAmount: 'desc' },
            { creditAmount: 'desc' }
          ]
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    console.log(`✅ Found ${allEntries.length} journal entry/entries\n`);

    if (allEntries.length === 0) {
      console.log('⚠️  WARNING: No journal entries found for this invoice!');
      console.log('   Payment may not have created accounting entries.\n');
      return;
    }

    // Verify each entry
    let entryNumber = 1;
    let totalExpenseDebit = 0;
    let totalVATDebit = 0;
    let totalAPCredit = 0;
    let totalAPDebit = 0;
    let totalBankCredit = 0;

    for (const entry of allEntries) {
      console.log(`${'═'.repeat(80)}`);
      console.log(`📝 ENTRY #${entryNumber}: ${entry.referenceNumber}`);
      console.log(`${'═'.repeat(80)}`);
      console.log(`Description: ${entry.description}`);
      console.log(`Transaction Date: ${new Date(entry.transactionDate).toLocaleString()}`);
      console.log(`Status: ${entry.status}`);
      console.log(`Total Amount: ${invoice.currency?.symbol || '$'}${Number(entry.totalAmount).toFixed(2)}`);
      console.log(`\nJournal Entry Lines (${entry.journalEntryLines.length}):\n`);

      let entryDebits = 0;
      let entryCredits = 0;

      entry.journalEntryLines.forEach((line, index) => {
        const debit = Number(line.debitAmount);
        const credit = Number(line.creditAmount);
        entryDebits += debit;
        entryCredits += credit;

        console.log(`  ${index + 1}. ${line.chartOfAccount.accountNo} - ${line.chartOfAccount.accountName}`);
        console.log(`     Type: ${line.chartOfAccount.accountType}`);
        if (debit > 0) {
          console.log(`     DEBIT:  ${invoice.currency?.symbol || '$'}${debit.toFixed(2)}`);
          
          // Track expense and VAT debits
          if (line.chartOfAccount.accountType === 'Expense') {
            totalExpenseDebit += debit;
          }
          if (line.chartOfAccount.accountName.toLowerCase().includes('vat input') || 
              line.chartOfAccount.accountName.toLowerCase().includes('vat')) {
            totalVATDebit += debit;
          }
          if (line.chartOfAccount.accountName.toLowerCase().includes('accounts payable') ||
              line.chartOfAccount.accountName.toLowerCase().includes('creditor')) {
            totalAPDebit += debit;
          }
        }
        if (credit > 0) {
          console.log(`     CREDIT: ${invoice.currency?.symbol || '$'}${credit.toFixed(2)}`);
          
          // Track AP and Bank credits
          if (line.chartOfAccount.accountName.toLowerCase().includes('accounts payable') ||
              line.chartOfAccount.accountName.toLowerCase().includes('creditor')) {
            totalAPCredit += credit;
          }
          if (line.chartOfAccount.accountName.toLowerCase().includes('bank') ||
              line.chartOfAccount.accountName.toLowerCase().includes('cash')) {
            totalBankCredit += credit;
          }
        }
        if (Number(line.vatAmount) > 0) {
          console.log(`     VAT Amount: ${invoice.currency?.symbol || '$'}${Number(line.vatAmount).toFixed(2)}`);
        }
        console.log(`     Description: ${line.description || 'N/A'}`);
        console.log('');
      });

      // Verify entry balance
      const difference = Math.abs(entryDebits - entryCredits);
      console.log(`  Entry Balance Check:`);
      console.log(`    Total Debits:  ${invoice.currency?.symbol || '$'}${entryDebits.toFixed(2)}`);
      console.log(`    Total Credits: ${invoice.currency?.symbol || '$'}${entryCredits.toFixed(2)}`);
      console.log(`    Difference:    ${invoice.currency?.symbol || '$'}${difference.toFixed(2)}`);
      
      if (difference > 0.01) {
        console.log(`    ❌ ENTRY IS UNBALANCED!`);
      } else {
        console.log(`    ✅ Entry is balanced`);
      }
      console.log('');

      entryNumber++;
    }

    // Overall verification
    console.log(`${'═'.repeat(80)}`);
    console.log('📊 OVERALL VERIFICATION');
    console.log(`${'═'.repeat(80)}\n`);

    console.log(`Expected Values:`);
    console.log(`  Invoice Subtotal: ${invoice.currency?.symbol || '$'}${Number(invoice.subtotal).toFixed(2)}`);
    console.log(`  Invoice Tax:      ${invoice.currency?.symbol || '$'}${Number(invoice.taxAmount).toFixed(2)}`);
    console.log(`  Invoice Total:    ${invoice.currency?.symbol || '$'}${Number(invoice.totalAmount).toFixed(2)}`);
    console.log(`\nActual Journal Entry Totals:`);
    console.log(`  Expense Debits:   ${invoice.currency?.symbol || '$'}${totalExpenseDebit.toFixed(2)}`);
    console.log(`  VAT Debits:       ${invoice.currency?.symbol || '$'}${totalVATDebit.toFixed(2)}`);
    console.log(`  AP Credits:       ${invoice.currency?.symbol || '$'}${totalAPCredit.toFixed(2)}`);
    console.log(`  AP Debits:        ${invoice.currency?.symbol || '$'}${totalAPDebit.toFixed(2)}`);
    console.log(`  Bank/Cash Credits: ${invoice.currency?.symbol || '$'}${totalBankCredit.toFixed(2)}`);

    // Verify correctness
    let allCorrect = true;
    console.log(`\n✅ Verification Results:\n`);

    // Check expense entry
    const expectedExpense = Number(invoice.subtotal);
    if (Math.abs(totalExpenseDebit - expectedExpense) > 0.01) {
      console.log(`  ❌ Expense Debit: Expected ${expectedExpense.toFixed(2)}, got ${totalExpenseDebit.toFixed(2)}`);
      allCorrect = false;
    } else {
      console.log(`  ✅ Expense Debit matches invoice subtotal`);
    }

    // Check VAT entry (if taxable)
    if (isTaxable) {
      const expectedVAT = Number(invoice.taxAmount);
      if (Math.abs(totalVATDebit - expectedVAT) > 0.01) {
        console.log(`  ❌ VAT Debit: Expected ${expectedVAT.toFixed(2)}, got ${totalVATDebit.toFixed(2)}`);
        allCorrect = false;
      } else {
        console.log(`  ✅ VAT Debit matches invoice tax amount`);
      }
    } else {
      if (totalVATDebit > 0.01) {
        console.log(`  ❌ VAT Debit: Should be 0 for non-taxable invoice, but got ${totalVATDebit.toFixed(2)}`);
        allCorrect = false;
      } else {
        console.log(`  ✅ VAT Debit is 0 (correct for non-taxable invoice)`);
      }
    }

    // Check AP credit (should equal total amount for expense recognition)
    const expectedAPCredit = Number(invoice.totalAmount);
    if (Math.abs(totalAPCredit - expectedAPCredit) > 0.01) {
      console.log(`  ❌ AP Credit: Expected ${expectedAPCredit.toFixed(2)}, got ${totalAPCredit.toFixed(2)}`);
      allCorrect = false;
    } else {
      console.log(`  ✅ AP Credit matches invoice total (expense recognition)`);
    }

    // Check AP debit (should equal payment amount)
    if (invoice.paymentStatus === 'PAID' || invoice.paymentStatus === 'PARTIALLY_PAID') {
      const paymentAmount = totalBankCredit; // Payment amount equals bank credit
      if (Math.abs(totalAPDebit - paymentAmount) > 0.01) {
        console.log(`  ❌ AP Debit: Expected ${paymentAmount.toFixed(2)}, got ${totalAPDebit.toFixed(2)}`);
        allCorrect = false;
      } else {
        console.log(`  ✅ AP Debit matches payment amount`);
      }
    }

    // Check Bank/Cash credit
    if (totalBankCredit === 0) {
      console.log(`  ⚠️  Bank/Cash Credit: 0 (payment may not be recorded yet)`);
    } else {
      console.log(`  ✅ Bank/Cash Credit: ${totalBankCredit.toFixed(2)} (payment recorded)`);
    }

    // Final verdict
    console.log(`\n${'═'.repeat(80)}`);
    if (allCorrect && totalBankCredit > 0) {
      console.log('✅ ALL JOURNAL ENTRIES ARE CORRECT!');
      console.log('\nSummary:');
      console.log(`  ✅ Expense recognition entry created correctly`);
      console.log(`  ✅ Tax handling is ${isTaxable ? 'correct (taxable)' : 'correct (non-taxable)'}`);
      console.log(`  ✅ Payment entry created correctly`);
      console.log(`  ✅ Double-entry bookkeeping is balanced`);
    } else if (allCorrect && totalBankCredit === 0) {
      console.log('⚠️  JOURNAL ENTRIES ARE CORRECT BUT PAYMENT NOT YET RECORDED');
      console.log('   The expense recognition entry exists, but payment entry may be missing.');
    } else {
      console.log('❌ JOURNAL ENTRIES HAVE ISSUES!');
      console.log('   Please review the verification results above.');
    }
    console.log(`${'═'.repeat(80)}\n`);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

verifyJournalEntries()
  .then(() => {
    console.log('Verification completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Verification failed:', error);
    process.exit(1);
  });

