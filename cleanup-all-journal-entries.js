const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanupAllJournalEntries() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧹 CLEANING UP ALL JOURNAL ENTRIES AND RELATED DATA');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Step 1: Get all journal entries
    console.log('📋 Step 1: Getting all journal entries...');
    const allJournalEntries = await prisma.journalEntry.findMany({
      select: {
        id: true,
        referenceNumber: true,
        description: true,
        status: true,
        transactionDate: true
      },
      orderBy: {
        transactionDate: 'asc'
      }
    });

    console.log(`✅ Found ${allJournalEntries.length} journal entries\n`);

    if (allJournalEntries.length === 0) {
      console.log('✅ No journal entries to clean up');
      await prisma.$disconnect();
      return;
    }

    // Step 2: Process each journal entry and clean up related data
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🔍 Step 2: Processing journal entries and cleaning up related data...');
    console.log('═══════════════════════════════════════════════════════════\n');

    let processed = 0;
    let errors = [];

    for (const entry of allJournalEntries) {
      try {
        processed++;
        console.log(`\n[${processed}/${allJournalEntries.length}] Processing: ${entry.referenceNumber}`);
        console.log(`   Description: ${entry.description}`);
        console.log(`   Date: ${entry.transactionDate.toISOString().split('T')[0]}`);

        // 2a. Check and handle Cashbook Entries
        const cashbookEntries = await prisma.cashbookEntry.findMany({
          where: { journalEntryId: entry.id },
          select: { id: true, status: true, type: true }
        });

        if (cashbookEntries.length > 0) {
          console.log(`   📝 Found ${cashbookEntries.length} cashbook entry(ies) - deleting...`);
          // Handle reversals first - delete reversal entries before original entries
          for (const cbEntry of cashbookEntries) {
            try {
              // First, check if this entry has reversals and delete them
              const reversals = await prisma.cashbookEntry.findMany({
                where: { originalTransactionId: cbEntry.id }
              });
              
              if (reversals.length > 0) {
                console.log(`   🔄 Found ${reversals.length} reversal(s) for cashbook entry ${cbEntry.id} - deleting reversals first...`);
                await prisma.cashbookEntry.deleteMany({
                  where: { originalTransactionId: cbEntry.id }
                });
              }
              
              // Now delete the original entry
              await prisma.cashbookEntry.delete({
                where: { id: cbEntry.id }
              });
            } catch (error) {
              // If deletion fails, try to just clear the journal entry link
              console.log(`   ⚠️  Could not delete cashbook entry ${cbEntry.id}, clearing journal entry link instead...`);
              await prisma.cashbookEntry.update({
                where: { id: cbEntry.id },
                data: { journalEntryId: null }
              });
            }
          }
          console.log(`   ✅ Processed ${cashbookEntries.length} cashbook entry(ies)`);
        }

        // 2b. Check and handle Expenses
        const expenses = await prisma.expense.findMany({
          where: { journalEntryId: entry.id },
          select: { id: true, status: true, receiptNumber: true }
        });

        if (expenses.length > 0) {
          console.log(`   💰 Found ${expenses.length} expense(s) - removing journal entry link...`);
          await prisma.expense.updateMany({
            where: { journalEntryId: entry.id },
            data: { journalEntryId: null, status: 'DRAFT' }
          });
          console.log(`   ✅ Updated ${expenses.length} expense(s) - set status to DRAFT`);
        }

        // 2c. Check and handle Invoices (don't delete, just update status)
        const invoices = await prisma.invoice.findMany({
          where: { journalEntryId: entry.id },
          select: { id: true, invoiceNumber: true, status: true, paidAmount: true }
        });

        if (invoices.length > 0) {
          console.log(`   📄 Found ${invoices.length} invoice(s) - updating status...`);
          for (const invoice of invoices) {
            await prisma.invoice.update({
              where: { id: invoice.id },
              data: {
                journalEntryId: null,
                status: 'DRAFT',
                paidAmount: 0,
                outstandingAmount: invoice.paidAmount || 0 // Reset outstanding amount
              }
            });
          }
          console.log(`   ✅ Updated ${invoices.length} invoice(s) - set status to DRAFT, cleared payment`);
        }

        // 2d. Check and handle Procurement Invoices
        const procurementInvoices = await prisma.procurementInvoice.findMany({
          where: { journalEntryId: entry.id },
          select: { id: true, invoiceNumber: true, paymentStatus: true }
        });

        if (procurementInvoices.length > 0) {
          console.log(`   🛒 Found ${procurementInvoices.length} procurement invoice(s) - updating status...`);
          await prisma.procurementInvoice.updateMany({
            where: { journalEntryId: entry.id },
            data: {
              journalEntryId: null,
              paymentStatus: 'PENDING',
              paymentDate: null,
              paymentReference: null
            }
          });
          console.log(`   ✅ Updated ${procurementInvoices.length} procurement invoice(s)`);
        }

        // 2e. Check and handle Revenues
        const revenues = await prisma.revenue.findMany({
          where: { journalEntryId: entry.id },
          select: { id: true, description: true }
        });

        if (revenues.length > 0) {
          console.log(`   💵 Found ${revenues.length} revenue(s) - removing journal entry link...`);
          await prisma.revenue.updateMany({
            where: { journalEntryId: entry.id },
            data: { journalEntryId: null }
          });
          console.log(`   ✅ Updated ${revenues.length} revenue(s)`);
        }

        // 2f. Check and handle Credit Notes
        const creditNotes = await prisma.creditNote.findMany({
          where: { journalEntryId: entry.id },
          select: { id: true, creditNoteNumber: true }
        });

        if (creditNotes.length > 0) {
          console.log(`   📋 Found ${creditNotes.length} credit note(s) - removing journal entry link...`);
          await prisma.creditNote.updateMany({
            where: { journalEntryId: entry.id },
            data: { journalEntryId: null }
          });
          console.log(`   ✅ Updated ${creditNotes.length} credit note(s)`);
        }

        // 2g. Check and handle Forex Gain/Loss
        const forexGainLoss = await prisma.forexGainLoss.findMany({
          where: { journalEntryId: entry.id },
          select: { id: true }
        });

        if (forexGainLoss.length > 0) {
          console.log(`   💱 Found ${forexGainLoss.length} forex gain/loss record(s) - removing journal entry link...`);
          await prisma.forexGainLoss.updateMany({
            where: { journalEntryId: entry.id },
            data: { journalEntryId: null }
          });
          console.log(`   ✅ Updated ${forexGainLoss.length} forex gain/loss record(s)`);
        }

        // 2h. Check and handle Bank Transactions (reconciliation)
        const bankTransactions = await prisma.bankTransaction.findMany({
          where: { matchedJournalEntryId: entry.id },
          select: { id: true }
        });

        if (bankTransactions.length > 0) {
          console.log(`   🏦 Found ${bankTransactions.length} bank transaction(s) - removing match...`);
          await prisma.bankTransaction.updateMany({
            where: { matchedJournalEntryId: entry.id },
            data: {
              matchedJournalEntryId: null,
              isMatched: false
            }
          });
          console.log(`   ✅ Updated ${bankTransactions.length} bank transaction(s)`);
        }

        // 2i. Check and handle Reconciliation Results
        const reconciliationResults = await prisma.reconciliationResult.findMany({
          where: { journalEntryId: entry.id },
          select: { id: true }
        });

        if (reconciliationResults.length > 0) {
          console.log(`   🔄 Found ${reconciliationResults.length} reconciliation result(s) - deleting...`);
          await prisma.reconciliationResult.deleteMany({
            where: { journalEntryId: entry.id }
          });
          console.log(`   ✅ Deleted ${reconciliationResults.length} reconciliation result(s)`);
        }

        // 2j. Check for Portfolio/Investment related entries
        // Check if journal entry description suggests it's a disbursement
        const isDisbursementRelated = entry.description.toLowerCase().includes('disbursement') || 
                                      entry.description.toLowerCase().includes('disburse') ||
                                      entry.referenceNumber.includes('DISB');

        if (isDisbursementRelated) {
          console.log(`   📊 This appears to be a disbursement-related entry - checking for related records...`);
          
          // Find FundDisbursements that might match by transaction reference or date
          const relatedDisbursements = await prisma.fundDisbursement.findMany({
            where: {
              OR: [
                { transactionReference: entry.referenceNumber },
                { disbursementDate: entry.transactionDate }
              ],
              status: { in: ['DISBURSED', 'COMPLETED'] }
            },
            include: {
              investmentImplementation: {
                select: {
                  id: true,
                  applicationId: true,
                  portfolioCompanyId: true,
                  fundsDisbursed: true
                }
              }
            }
          });

          if (relatedDisbursements.length > 0) {
            console.log(`   📊 Found ${relatedDisbursements.length} related disbursement(s) - updating...`);
            for (const disbursement of relatedDisbursements) {
              // Update disbursement status
              await prisma.fundDisbursement.update({
                where: { id: disbursement.id },
                data: {
                  status: 'PENDING',
                  transactionReference: null,
                  disbursedAt: null,
                  disbursedById: null
                }
              });

              // Update investment implementation
              if (disbursement.investmentImplementation) {
                await prisma.investmentImplementation.update({
                  where: { id: disbursement.investmentImplementation.id },
                  data: {
                    fundsDisbursed: false
                  }
                });

                // Update application status if it was disbursed
                if (disbursement.investmentImplementation.applicationId) {
                  const application = await prisma.application.findUnique({
                    where: { id: disbursement.investmentImplementation.applicationId },
                    select: { id: true, status: true }
                  });

                  if (application && application.status === 'DISBURSED') {
                    // Move back to APPROVED status
                    await prisma.application.update({
                      where: { id: application.id },
                      data: { status: 'APPROVED' }
                    });
                    console.log(`   📝 Updated application ${application.id} status from DISBURSED to APPROVED`);
                  }
                }
              }
            }
            console.log(`   ✅ Updated ${relatedDisbursements.length} disbursement(s) and related records`);
          }
        }

        console.log(`   ✅ Completed processing entry ${entry.referenceNumber}`);

      } catch (error) {
        console.error(`   ❌ Error processing entry ${entry.referenceNumber}:`, error.message);
        errors.push({ entry: entry.referenceNumber, error: error.message });
      }
    }

    // Step 3: Delete all journal entry lines (cascade should handle this, but let's be explicit)
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('🗑️  Step 3: Deleting journal entry lines...');
    console.log('═══════════════════════════════════════════════════════════\n');

    const deletedLines = await prisma.journalEntryLine.deleteMany({});
    console.log(`✅ Deleted ${deletedLines.count} journal entry line(s)\n`);

    // Step 4: Delete all journal entries
    console.log('═══════════════════════════════════════════════════════════');
    console.log('🗑️  Step 4: Deleting journal entries...');
    console.log('═══════════════════════════════════════════════════════════\n');

    const deletedEntries = await prisma.journalEntry.deleteMany({});
    console.log(`✅ Deleted ${deletedEntries.count} journal entry(ies)\n`);

    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📊 CLEANUP SUMMARY');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log(`✅ Processed ${processed} journal entries`);
    console.log(`✅ Deleted ${deletedLines.count} journal entry lines`);
    console.log(`✅ Deleted ${deletedEntries.count} journal entries`);

    if (errors.length > 0) {
      console.log(`\n⚠️  ${errors.length} error(s) occurred:`);
      errors.forEach(err => {
        console.log(`   - ${err.entry}: ${err.error}`);
      });
    } else {
      console.log('\n✅ All journal entries and related data cleaned up successfully!');
    }

  } catch (error) {
    console.error('❌ Fatal error during cleanup:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the cleanup
cleanupAllJournalEntries()
  .then(() => {
    console.log('\n✅ Cleanup completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  });

