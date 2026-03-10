// @ts-nocheck
/**
 * Delete ALL journal entries and journal entry lines (DESTRUCTIVE).
 *
 * Steps:
 * - Null out / detach all foreign keys that reference JournalEntry
 * - Delete all JournalEntryLine records
 * - Delete all JournalEntry records
 * - Verify that journal_entries and journal_entry_lines are empty
 * - Run accounting equation check (will be 0 - 0 - 0 if everything is gone)
 *
 * Run:
 *   npx ts-node scripts/delete-all-journal-entries.ts
 */

import { prisma } from '../src/utils/database';
import { BalanceSheetService } from '../src/services/BalanceSheetService';

async function detachJournalEntryReferences() {
  console.log('--- Detaching foreign keys that reference journal entries ---');

  await Promise.all([
    prisma.expense.updateMany({
      where: { journalEntryId: { not: null } },
      data: { journalEntryId: null }
    }).catch(() => null),
    prisma.revenue.updateMany({
      where: { journalEntryId: { not: null } },
      data: { journalEntryId: null }
    }).catch(() => null),
    prisma.invoice.updateMany({
      where: { journalEntryId: { not: null } },
      data: { journalEntryId: null }
    }).catch(() => null),
    prisma.procurementInvoice.updateMany({
      where: { journalEntryId: { not: null } },
      data: { journalEntryId: null }
    }).catch(() => null),
    prisma.purchaseInvoice.updateMany({
      where: {
        OR: [
          { journalEntryId: { not: null } },
          { paymentJournalEntryId: { not: null } }
        ]
      },
      data: {
        journalEntryId: null,
        paymentJournalEntryId: null
      }
    }).catch(() => null),
    prisma.creditNote.updateMany({
      where: { journalEntryId: { not: null } },
      data: { journalEntryId: null }
    }).catch(() => null),
    prisma.forexGainLoss.updateMany({
      where: { journalEntryId: { not: null } },
      data: { journalEntryId: null }
    }).catch(() => null),
    prisma.cashbookEntry.updateMany({
      where: { journalEntryId: { not: null } },
      data: { journalEntryId: null }
    }).catch(() => null),
    prisma.bankTransaction.updateMany({
      where: { matchedJournalEntryId: { not: null } },
      data: { matchedJournalEntryId: null }
    }).catch(() => null),
    // Reconciliation results link directly to journalEntry with onDelete: Cascade,
    // but we delete them explicitly to be extra safe.
    prisma.reconciliationResult.deleteMany({}).catch(() => null)
  ]);
}

async function deleteAllJournalEntries() {
  console.log('\n--- Deleting journal entry lines and journal entries ---');

  const [lineCount, jeCount] = await Promise.all([
    prisma.journalEntryLine.count(),
    prisma.journalEntry.count()
  ]);
  console.log('  Journal entry lines before:', lineCount);
  console.log('  Journal entries before:    ', jeCount);

  await prisma.journalEntryLine.deleteMany({});
  await prisma.journalEntry.deleteMany({});

  const [lineAfter, jeAfter] = await Promise.all([
    prisma.journalEntryLine.count(),
    prisma.journalEntry.count()
  ]);
  console.log('  Journal entry lines after:', lineAfter);
  console.log('  Journal entries after:    ', jeAfter);
}

async function verifyNoReferencesRemain() {
  console.log('\n--- Verifying no journal entry references remain ---');

  const [
    expensesWithJe,
    revenuesWithJe,
    invoicesWithJe,
    procInvWithJe,
    purchInvWithJe,
    creditNotesWithJe,
    forexWithJe,
    cashbookWithJe,
    bankTxWithJe,
    reconResults
  ] = await Promise.all([
    prisma.expense.count({ where: { journalEntryId: { not: null } } }),
    prisma.revenue.count({ where: { journalEntryId: { not: null } } }),
    prisma.invoice.count({ where: { journalEntryId: { not: null } } }),
    prisma.procurementInvoice.count({ where: { journalEntryId: { not: null } } }),
    prisma.purchaseInvoice.count({
      where: {
        OR: [
          { journalEntryId: { not: null } },
          { paymentJournalEntryId: { not: null } }
        ]
      }
    }),
    prisma.creditNote.count({ where: { journalEntryId: { not: null } } }),
    prisma.forexGainLoss.count({ where: { journalEntryId: { not: null } } }),
    prisma.cashbookEntry.count({ where: { journalEntryId: { not: null } } }),
    prisma.bankTransaction.count({ where: { matchedJournalEntryId: { not: null } } }),
    prisma.reconciliationResult.count()
  ]);

  console.log('  Expenses with journalEntryId:           ', expensesWithJe);
  console.log('  Revenues with journalEntryId:           ', revenuesWithJe);
  console.log('  Invoices with journalEntryId:           ', invoicesWithJe);
  console.log('  Procurement invoices with journalEntryId:', procInvWithJe);
  console.log('  Purchase invoices with JE refs:         ', purchInvWithJe);
  console.log('  Credit notes with journalEntryId:       ', creditNotesWithJe);
  console.log('  Forex gain/loss with journalEntryId:    ', forexWithJe);
  console.log('  Cashbook entries with journalEntryId:   ', cashbookWithJe);
  console.log('  Bank transactions with matched JE:      ', bankTxWithJe);
  console.log('  Reconciliation results remaining:       ', reconResults);
}

async function verifyAccountingEquation() {
  console.log('\n========== Accounting equation check after JE deletion ==========');

  const asOfDate = new Date();
  asOfDate.setHours(23, 59, 59, 999);

  const data = await BalanceSheetService.generateBalanceSheet({
    asOfDate,
    startDate: new Date(0),
    endDate: asOfDate
  });

  const totalAssets = data.assets.totalAssets;
  const totalLiabilities = data.liabilities.totalLiabilities;
  const totalEquity = data.equity.total;
  const diff = totalAssets - totalLiabilities - totalEquity;
  const balanced = Math.abs(diff) < 0.02;

  console.log('  sum(Assets)      =', totalAssets.toFixed(2));
  console.log('  sum(Liabilities) =', totalLiabilities.toFixed(2));
  console.log('  sum(Equity)      =', totalEquity.toFixed(2));
  console.log('  Assets - L - E   =', diff.toFixed(2), balanced ? '(OK)' : '(IMBALANCE)');
  if (balanced) {
    console.log('\n  Accounting equation maintained (likely all zeros).');
  } else {
    console.log('\n  WARNING: Accounting equation not balanced after deleting all JEs.');
  }
}

async function main() {
  console.log('========== DELETE ALL JOURNAL ENTRIES (DESTRUCTIVE) ==========\n');

  await detachJournalEntryReferences();
  await deleteAllJournalEntries();
  await verifyNoReferencesRemain();
  await verifyAccountingEquation();

  console.log('\n========== DONE: ALL JOURNAL ENTRIES REMOVED ==========');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});

