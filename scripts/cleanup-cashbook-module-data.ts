// @ts-nocheck
/**
 * Cashbook module cleanup (DESTRUCTIVE).
 *
 * Deletes:
 * - All cashbook entries
 * - All cashbook transfers
 * - All cashbook entry types
 * - All period lockouts
 * - All contra entries and contra configs
 * - All bank statements, statement items, reconciliation mismatches
 * - All bank reconciliations, bank transactions, reconciliation results
 * - Journal entries related to cashbook (via cashbookEntry, bankTransaction, reconciliationResult)
 *
 * Then verifies:
 * - All of the above are empty
 * - Accounting equation still balances (Assets - Liabilities - Equity ≈ 0)
 *
 * Run:
 *   npx ts-node scripts/cleanup-cashbook-module-data.ts
 */

import { prisma } from '../src/utils/database';
import { BalanceSheetService } from '../src/services/BalanceSheetService';

async function deleteJournalEntry(journalEntryId: string | null | undefined) {
  if (!journalEntryId) return;
  try {
    await prisma.journalEntryLine.deleteMany({ where: { journalEntryId } }).catch(() => null);
    await prisma.journalEntry.delete({ where: { id: journalEntryId } }).catch(() => null);
  } catch (e) {
    console.warn('  Warning: failed to delete journal entry', journalEntryId, e?.message ?? e);
  }
}

async function report() {
  const [
    cashbookEntries,
    transfers,
    entryTypes,
    periodLocks,
    contraEntries,
    contraConfigs,
    bankStatements,
    bankStatementItems,
    mismatches,
    bankRecons,
    bankTransactions,
    reconResults
  ] = await Promise.all([
    prisma.cashbookEntry.count(),
    prisma.cashbookTransfer.count(),
    prisma.cashbookEntryTypeConfig.count(),
    prisma.periodLockout.count(),
    prisma.contraEntry.count(),
    prisma.contraEntryConfig.count(),
    prisma.bankStatement.count(),
    prisma.bankStatementItem.count(),
    prisma.reconciliationMismatch.count(),
    prisma.bankReconciliation.count(),
    prisma.bankTransaction.count(),
    prisma.reconciliationResult.count()
  ]);

  console.log('--- Cashbook module (current counts) ---');
  console.log('  Cashbook entries:             ', cashbookEntries);
  console.log('  Cashbook transfers:           ', transfers);
  console.log('  Cashbook entry types:         ', entryTypes);
  console.log('  Period lockouts:              ', periodLocks);
  console.log('  Contra entries:               ', contraEntries);
  console.log('  Contra configs:               ', contraConfigs);
  console.log('  Bank statements:              ', bankStatements);
  console.log('  Bank statement items:         ', bankStatementItems);
  console.log('  Reconciliation mismatches:    ', mismatches);
  console.log('  Bank reconciliations:         ', bankRecons);
  console.log('  Bank transactions:            ', bankTransactions);
  console.log('  Reconciliation results:       ', reconResults);
  console.log('');
}

async function cleanup() {
  console.log('--- Starting cashbook cleanup ---');

  // Collect journal entries related to cashbook before we break FKs
  const journalEntryIds = new Set<string>();

  // 1) Cashbook entries
  console.log('\n--- Cashbook entries ---');
  const cbEntries = await prisma.cashbookEntry.findMany({
    select: { id: true, journalEntryId: true }
  });
  console.log('  Cashbook entries found:', cbEntries.length);
  for (const e of cbEntries) {
    if (e.journalEntryId) journalEntryIds.add(e.journalEntryId);
  }

  // 2) Bank reconciliation-related journal entries
  console.log('\n--- Bank reconciliations / transactions / results ---');
  const [bankTxs, results] = await Promise.all([
    prisma.bankTransaction.findMany({ select: { id: true, matchedJournalEntryId: true } }),
    prisma.reconciliationResult.findMany({ select: { id: true, journalEntryId: true } })
  ]);
  console.log('  Bank transactions:', bankTxs.length);
  console.log('  Reconciliation results:', results.length);
  for (const t of bankTxs) {
    if (t.matchedJournalEntryId) journalEntryIds.add(t.matchedJournalEntryId);
  }
  for (const r of results) {
    if (r.journalEntryId) journalEntryIds.add(r.journalEntryId);
  }

  // 3) Break FKs then delete dependent records

  // Bank reconciliation domain
  console.log('\n--- Deleting bank reconciliation artifacts ---');
  await prisma.reconciliationResult.deleteMany({}).catch(() => null);
  await prisma.bankTransaction.updateMany({
    where: { matchedJournalEntryId: { not: null } },
    data: { matchedJournalEntryId: null }
  }).catch(() => null);
  await prisma.bankTransaction.deleteMany({}).catch(() => null);
  await prisma.reconciliationAuditTrail?.deleteMany?.({}).catch(() => null as any);
  await prisma.bankReconciliation.deleteMany({}).catch(() => null);

  // Bank statements / mismatches
  console.log('\n--- Deleting bank statements / mismatches ---');
  await prisma.reconciliationMismatch.deleteMany({}).catch(() => null);
  await prisma.bankStatementItem.deleteMany({}).catch(() => null);
  await prisma.bankStatement.deleteMany({}).catch(() => null);

  // Contra entries + configs
  console.log('\n--- Deleting contra entries / configs ---');
  await prisma.contraEntry.deleteMany({}).catch(() => null);
  await prisma.contraEntryConfig.deleteMany({}).catch(() => null);

  // Cashbook entry types, templates, batches, imports, exports, period locks, transfers
  console.log('\n--- Deleting cashbook configs (entry types, templates, batches, periods, transfers) ---');
  await prisma.cashbookTemplate.deleteMany({}).catch(() => null);
  await prisma.cashbookExport?.deleteMany?.({}).catch(() => null as any);
  await prisma.cashbookBatch.deleteMany({}).catch(() => null);
  await prisma.cashbookImportBatch.deleteMany({}).catch(() => null);
  await prisma.periodLockout.deleteMany({}).catch(() => null);
  await prisma.cashbookEntryTypeConfig.deleteMany({}).catch(() => null);
  await prisma.cashbookTransfer.deleteMany({}).catch(() => null);

  // Finally, cashbook entries themselves (after detaching JE)
  console.log('\n--- Deleting cashbook entries ---');
  await prisma.cashbookEntry.updateMany({
    where: { journalEntryId: { not: null } },
    data: { journalEntryId: null }
  }).catch(() => null);
  await prisma.cashbookEntry.deleteMany({}).catch(() => null);

  // Delete collected journal entries
  console.log('\n--- Deleting related journal entries ---');
  console.log('  Unique journal entries to delete:', journalEntryIds.size);
  for (const id of journalEntryIds) {
    await deleteJournalEntry(id);
  }
}

async function verify() {
  console.log('\n========== Verification: cashbook domain after cleanup ==========');

  const [
    cashbookEntries,
    transfers,
    entryTypes,
    periodLocks,
    contraEntries,
    contraConfigs,
    bankStatements,
    bankStatementItems,
    mismatches,
    bankRecons,
    bankTransactions,
    reconResults
  ] = await Promise.all([
    prisma.cashbookEntry.count(),
    prisma.cashbookTransfer.count(),
    prisma.cashbookEntryTypeConfig.count(),
    prisma.periodLockout.count(),
    prisma.contraEntry.count(),
    prisma.contraEntryConfig.count(),
    prisma.bankStatement.count(),
    prisma.bankStatementItem.count(),
    prisma.reconciliationMismatch.count(),
    prisma.bankReconciliation.count(),
    prisma.bankTransaction.count(),
    prisma.reconciliationResult.count()
  ]);

  console.log('  Cashbook entries:             ', cashbookEntries);
  console.log('  Cashbook transfers:           ', transfers);
  console.log('  Cashbook entry types:         ', entryTypes);
  console.log('  Period lockouts:              ', periodLocks);
  console.log('  Contra entries:               ', contraEntries);
  console.log('  Contra configs:               ', contraConfigs);
  console.log('  Bank statements:              ', bankStatements);
  console.log('  Bank statement items:         ', bankStatementItems);
  console.log('  Reconciliation mismatches:    ', mismatches);
  console.log('  Bank reconciliations:         ', bankRecons);
  console.log('  Bank transactions:            ', bankTransactions);
  console.log('  Reconciliation results:       ', reconResults);

  const nonZero = [
    ['Cashbook entries', cashbookEntries],
    ['Cashbook transfers', transfers],
    ['Cashbook entry types', entryTypes],
    ['Period lockouts', periodLocks],
    ['Contra entries', contraEntries],
    ['Contra configs', contraConfigs],
    ['Bank statements', bankStatements],
    ['Bank statement items', bankStatementItems],
    ['Reconciliation mismatches', mismatches],
    ['Bank reconciliations', bankRecons],
    ['Bank transactions', bankTransactions],
    ['Reconciliation results', reconResults]
  ].filter(([, c]) => c > 0);

  if (nonZero.length === 0) {
    console.log('\n  All requested cashbook-related entities have been deleted.');
  } else {
    console.log('\n  WARNING: Some cashbook-related entities remain:');
    for (const [name, count] of nonZero) {
      console.log(`   - ${name}: ${count}`);
    }
  }
}

async function verifyAccounting() {
  console.log('\n========== Accounting equation check ==========');
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

  if (!balanced) {
    console.log('\n  WARNING: Accounting equation is NOT balanced after cashbook cleanup.');
    process.exitCode = 1;
  } else {
    console.log('\n  Accounting equation maintained.');
  }
}

async function main() {
  console.log('========== CASHBOOK MODULE CLEANUP (DESTRUCTIVE) ==========\n');

  await report();
  await cleanup();
  await verify();
  await verifyAccounting();

  console.log('\n========== CASHBOOK CLEANUP COMPLETED ==========');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});

