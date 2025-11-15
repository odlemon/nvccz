const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function completeAccountingCleanup() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧹 COMPLETE ACCOUNTING SYSTEM CLEANUP');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Step 1: Fix all invoices - set status to DRAFT and clear payments
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📄 Step 1: Fixing all invoices...');
    console.log('═══════════════════════════════════════════════════════════\n');

    const allInvoices = await prisma.invoice.findMany({
      where: {
        OR: [
          { status: 'PAID' },
          { status: 'PARTIALLY_PAID' },
          { paidAmount: { gt: 0 } },
          { journalEntryId: { not: null } }
        ]
      },
      select: {
        id: true,
        invoiceNumber: true,
        status: true,
        paidAmount: true,
        totalAmount: true
      }
    });

    console.log(`Found ${allInvoices.length} invoice(s) to fix\n`);

    for (const invoice of allInvoices) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: {
          status: 'DRAFT',
          paidAmount: 0,
          outstandingAmount: invoice.totalAmount,
          journalEntryId: null,
          paymentDate: null,
          paymentMethod: null,
          amountInPaymentCurrency: null,
          exchangeRateAtCreation: null,
          paymentCurrencyId: null
        }
      });
      console.log(`✅ Fixed invoice ${invoice.invoiceNumber || invoice.id} - set to DRAFT, cleared payment`);
    }

    // Step 2: Delete ALL cashbook entries
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📝 Step 2: Deleting ALL cashbook entries...');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Get all cashbook entries
    const allCashbookEntries = await prisma.cashbookEntry.findMany({
      select: { 
        id: true,
        originalTransactionId: true
      }
    });

    console.log(`Found ${allCashbookEntries.length} total cashbook entry(ies) to delete\n`);

    // Separate reversals from originals
    const reversals = allCashbookEntries.filter(e => e.originalTransactionId !== null);
    const originals = allCashbookEntries.filter(e => e.originalTransactionId === null);

    console.log(`   - ${reversals.length} reversal entry(ies)`);
    console.log(`   - ${originals.length} original entry(ies)\n`);

    // Delete reversals first (one by one)
    let deletedReversals = 0;
    for (const reversal of reversals) {
      try {
        await prisma.cashbookEntry.delete({
          where: { id: reversal.id }
        });
        deletedReversals++;
      } catch (error) {
        console.error(`   ⚠️  Error deleting reversal ${reversal.id}: ${error.message}`);
      }
    }

    if (reversals.length > 0) {
      console.log(`✅ Deleted ${deletedReversals} reversal entry(ies)\n`);
    }

    // Now delete originals (one by one)
    let deletedOriginals = 0;
    for (const original of originals) {
      try {
        // First, check if this entry has any reversals left and delete them
        const remainingReversals = await prisma.cashbookEntry.findMany({
          where: { originalTransactionId: original.id }
        });

        for (const rev of remainingReversals) {
          try {
            await prisma.cashbookEntry.delete({
              where: { id: rev.id }
            });
          } catch (error) {
            // Ignore errors for reversals
          }
        }

        // Check for contra entries linked to this cashbook entry
        // ContraEntry has cashbookEntryId field
        const contraEntries = await prisma.contraEntry.findMany({
          where: {
            cashbookEntryId: original.id
          },
          select: { id: true }
        });

        // Delete contra entries first
        if (contraEntries.length > 0) {
          await prisma.contraEntry.deleteMany({
            where: {
              cashbookEntryId: original.id
            }
          });
        }

        // Now delete the original
        await prisma.cashbookEntry.delete({
          where: { id: original.id }
        });
        deletedOriginals++;
        
        if (deletedOriginals % 50 === 0) {
          console.log(`   Deleted ${deletedOriginals}/${originals.length} original entries...`);
        }
      } catch (error) {
        console.error(`   ⚠️  Error deleting original ${original.id}: ${error.message}`);
      }
    }

    console.log(`\n✅ Deleted ${deletedReversals} reversal entry(ies) and ${deletedOriginals} original entry(ies)`);
    console.log(`✅ Total deleted: ${deletedReversals + deletedOriginals} cashbook entry(ies)`);

    // Step 3: Handle Assets with monetary values
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🏢 Step 3: Handling assets with monetary values...');
    console.log('═══════════════════════════════════════════════════════════\n');

    try {
      const allAssets = await prisma.asset.findMany({
        select: {
          id: true,
          assetName: true,
          cost: true,
          currentBookValue: true
        }
      });

      console.log(`Found ${allAssets.length} asset(s) total\n`);

      for (const asset of allAssets) {
        try {
          await prisma.asset.update({
            where: { id: asset.id },
            data: {
              cost: 0,
              currentBookValue: 0,
              salvageValue: 0,
              disposalValue: null,
              disposalGainLoss: null
            }
          });
          console.log(`✅ Reset financial values for asset: ${asset.assetName || asset.id}`);
        } catch (error) {
          console.error(`   ⚠️  Error processing asset ${asset.id}: ${error.message}`);
        }
      }

      // Also delete depreciation records
      const depRecords = await prisma.depreciationRecord.deleteMany({});
      console.log(`✅ Deleted ${depRecords.count} depreciation record(s)`);

      // Delete disposal records
      const disposalRecords = await prisma.assetDisposalRecord.deleteMany({});
      console.log(`✅ Deleted ${disposalRecords.count} disposal record(s)`);

      console.log(`✅ Processed ${allAssets.length} asset(s)`);
    } catch (error) {
      console.log(`   ⚠️  Could not process assets: ${error.message}`);
      console.log(`   ℹ️  Skipping asset cleanup`);
    }

    // Step 4: Delete Fund Disbursements
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('💰 Step 4: Deleting fund disbursements...');
    console.log('═══════════════════════════════════════════════════════════\n');

    const allDisbursements = await prisma.fundDisbursement.findMany({
      select: {
        id: true,
        amount: true,
        status: true
      }
    });

    console.log(`Found ${allDisbursements.length} fund disbursement(s) to delete\n`);

    const deletedDisbursements = await prisma.fundDisbursement.deleteMany({});
    console.log(`✅ Deleted ${deletedDisbursements.count} fund disbursement(s)`);

    // Step 5: Reset Fund disbursed amounts
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('💵 Step 5: Resetting fund disbursed amounts...');
    console.log('═══════════════════════════════════════════════════════════\n');

    const funds = await prisma.fund.findMany({
      select: {
        id: true,
        name: true,
        totalAmount: true,
        remainingAmount: true
      }
    });

    console.log(`Found ${funds.length} fund(s) to reset\n`);

    for (const fund of funds) {
      // Reset remaining amount to equal total amount (no disbursements)
      await prisma.fund.update({
        where: { id: fund.id },
        data: {
          remainingAmount: fund.totalAmount
        }
      });
      console.log(`✅ Reset fund ${fund.name || fund.id} - remaining amount set to total amount`);
    }

    // Step 6: Reset Investment Implementation disbursement flags
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 Step 6: Resetting investment implementation flags...');
    console.log('═══════════════════════════════════════════════════════════\n');

    const implementations = await prisma.investmentImplementation.findMany({
      where: {
        fundsDisbursed: true
      },
      select: {
        id: true,
        portfolioCompanyId: true
      }
    });

    console.log(`Found ${implementations.length} investment implementation(s) with disbursements\n`);

    await prisma.investmentImplementation.updateMany({
      where: { fundsDisbursed: true },
      data: {
        fundsDisbursed: false
      }
    });

    console.log(`✅ Reset ${implementations.length} investment implementation(s)`);

    // Step 7: Reset Application statuses (Application model doesn't have status field)
    // Instead, we'll check investment implementations and reset those
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📋 Step 7: Checking applications linked to disbursements...');
    console.log('═══════════════════════════════════════════════════════════\n');

    // Applications don't have a status field, but investment implementations track disbursements
    // We already reset fundsDisbursed in Step 6, so applications should be fine
    console.log(`✅ Applications are handled through investment implementations (already reset in Step 6)`);

    // Step 8: Clear procurement invoices
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🛒 Step 8: Clearing procurement invoices...');
    console.log('═══════════════════════════════════════════════════════════\n');

    const procurementInvoices = await prisma.procurementInvoice.findMany({
      where: {
        OR: [
          { paymentStatus: 'PAID' },
          { paymentStatus: 'PARTIALLY_PAID' },
          { journalEntryId: { not: null } }
        ]
      },
      select: {
        id: true,
        invoiceNumber: true,
        paymentStatus: true
      }
    });

    console.log(`Found ${procurementInvoices.length} procurement invoice(s) to fix\n`);

    await prisma.procurementInvoice.updateMany({
      where: {
        OR: [
          { paymentStatus: 'PAID' },
          { paymentStatus: 'PARTIALLY_PAID' },
          { journalEntryId: { not: null } }
        ]
      },
      data: {
        paymentStatus: 'PENDING',
        journalEntryId: null,
        paymentDate: null,
        paymentReference: null
      }
    });

    console.log(`✅ Reset ${procurementInvoices.length} procurement invoice(s)`);

    // Step 9: Clear expenses
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('💼 Step 9: Clearing expenses...');
    console.log('═══════════════════════════════════════════════════════════\n');

    const expenses = await prisma.expense.findMany({
      where: {
        OR: [
          { journalEntryId: { not: null } },
          { status: 'POSTED' }
        ]
      },
      select: {
        id: true,
        status: true
      }
    });

    console.log(`Found ${expenses.length} expense(s) to fix\n`);

    await prisma.expense.updateMany({
      where: {
        OR: [
          { journalEntryId: { not: null } },
          { status: 'POSTED' }
        ]
      },
      data: {
        journalEntryId: null,
        status: 'DRAFT'
      }
    });

    console.log(`✅ Reset ${expenses.length} expense(s)`);

    // Step 10: Clear revenues
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('💵 Step 10: Clearing revenues...');
    console.log('═══════════════════════════════════════════════════════════\n');

    const revenues = await prisma.revenue.findMany({
      where: {
        journalEntryId: { not: null }
      },
      select: {
        id: true
      }
    });

    console.log(`Found ${revenues.length} revenue(s) to fix\n`);

    await prisma.revenue.updateMany({
      where: { journalEntryId: { not: null } },
      data: { journalEntryId: null }
    });

    console.log(`✅ Cleared ${revenues.length} revenue(s)`);

    // Step 11: Clear credit notes
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📋 Step 11: Clearing credit notes...');
    console.log('═══════════════════════════════════════════════════════════\n');

    const creditNotes = await prisma.creditNote.findMany({
      where: {
        journalEntryId: { not: null }
      },
      select: {
        id: true
      }
    });

    console.log(`Found ${creditNotes.length} credit note(s) to fix\n`);

    await prisma.creditNote.updateMany({
      where: { journalEntryId: { not: null } },
      data: { journalEntryId: null }
    });

    console.log(`✅ Cleared ${creditNotes.length} credit note(s)`);

    // Step 12: Clear forex gain/loss
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('💱 Step 12: Clearing forex gain/loss records...');
    console.log('═══════════════════════════════════════════════════════════\n');

    const forexRecords = await prisma.forexGainLoss.findMany({
      where: {
        journalEntryId: { not: null }
      },
      select: {
        id: true
      }
    });

    console.log(`Found ${forexRecords.length} forex record(s) to fix\n`);

    await prisma.forexGainLoss.updateMany({
      where: { journalEntryId: { not: null } },
      data: { journalEntryId: null }
    });

    console.log(`✅ Cleared ${forexRecords.length} forex record(s)`);

    // Step 13: Clear bank transaction matches
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🏦 Step 13: Clearing bank transaction matches...');
    console.log('═══════════════════════════════════════════════════════════\n');

    const bankTransactions = await prisma.bankTransaction.findMany({
      where: {
        matchedJournalEntryId: { not: null }
      },
      select: {
        id: true
      }
    });

    console.log(`Found ${bankTransactions.length} bank transaction(s) with matches\n`);

    await prisma.bankTransaction.updateMany({
      where: { matchedJournalEntryId: { not: null } },
      data: {
        matchedJournalEntryId: null,
        isMatched: false
      }
    });

    console.log(`✅ Cleared ${bankTransactions.length} bank transaction match(es)`);

    // Step 14: Delete reconciliation results
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🔄 Step 14: Deleting reconciliation results...');
    console.log('═══════════════════════════════════════════════════════════\n');

    const reconciliationResults = await prisma.reconciliationResult.deleteMany({});
    console.log(`✅ Deleted ${reconciliationResults.count} reconciliation result(s)`);

    // Summary
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📊 CLEANUP SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('✅ All accounting traces removed:');
    console.log(`   - Fixed ${allInvoices.length} invoice(s)`);
    console.log(`   - Deleted ${deletedReversals + deletedOriginals} cashbook entry(ies)`);
    console.log(`   - Reset assets (cost, book value, depreciation)`);
    console.log(`   - Deleted ${deletedDisbursements.count} fund disbursement(s)`);
    console.log(`   - Reset ${funds.length} fund(s) - remaining amounts restored`);
    console.log(`   - Reset investment implementation disbursement flags`);
    console.log(`   - Reset procurement invoices`);
    console.log(`   - Reset expenses`);
    console.log(`   - Cleared revenues`);
    console.log(`   - Cleared credit notes`);
    console.log(`   - Cleared forex records`);
    console.log(`   - Cleared bank transaction matches`);
    console.log(`   - Deleted ${reconciliationResults.count} reconciliation result(s)`);

    console.log('\n✅ Complete accounting cleanup finished!');
    console.log('⚠️  Note: Firebase files need to be deleted manually from Firebase Console');

  } catch (error) {
    console.error('❌ Fatal error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

completeAccountingCleanup()
  .then(() => {
    console.log('\n✅ Script completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Script failed:', error);
    process.exit(1);
  });

