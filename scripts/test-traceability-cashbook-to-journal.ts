// @ts-nocheck
/**
 * Traceability Links – Cashbook entry → Journal entry
 *
 * Locate a specific Cashbook entry. Its journalEntryId must be a valid string
 * that maps directly to a document in the JOURNAL_ENTRIES collection (journal_entries table).
 *
 * Run: npx ts-node scripts/test-traceability-cashbook-to-journal.ts
 */
import { prisma } from '../src/utils/database';

const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

async function main() {
  console.log('========== Traceability: Cashbook entry → JOURNAL_ENTRIES ==========\n');

  // Find a cashbook entry that has journalEntryId set (POSTED receipt/payment)
  let entry = await prisma.cashbookEntry.findFirst({
    where: { journalEntryId: { not: null } },
    include: { bank: true }
  });

  if (!entry) {
    console.log('No cashbook entry with journalEntryId found. Creating one via receipt...');
    const admin = await prisma.user.findFirst({
      where: { email: { in: ['admin@nts.com', 'admin@nvccz.co.zw'] } }
    });
    const bank = await prisma.bank.findFirst({
      where: { isActive: true },
      include: { glAccount: true }
    });
    const incomeAccount = await prisma.chartOfAccounts.findFirst({
      where: { accountType: { in: ['Revenue', 'Income'] }, isActive: true }
    });
    if (!admin || !bank?.glAccountId || !incomeAccount) throw new Error('Missing admin, bank, or income account');
    const { CashbookService } = await import('../src/services/CashbookService');
    const result = await CashbookService.createCashReceipt({
      bankId: bank.id,
      transactionDate: new Date(),
      description: 'Traceability test entry',
      amount: 1,
      counterpartyType: 'GL',
      glAccountId: incomeAccount.id,
      vatCode: '0%',
      createdById: admin.id
    });
    if (!result.success || !result.transaction?.journalEntryId) throw new Error('Failed to create receipt with JE');
    const created = await prisma.cashbookEntry.findUnique({
      where: { id: result.transaction.id },
      include: { bank: true }
    });
    if (!created) throw new Error('Created entry not found');
    entry = created as typeof entry;
  }

  const journalEntryId = entry.journalEntryId;
  assert(typeof journalEntryId === 'string' && journalEntryId.length > 0, 'journalEntryId must be a non-empty string');

  console.log('--- Cashbook entry ---');
  console.log('  id:', entry.id);
  console.log('  bank:', entry.bank?.name);
  console.log('  description:', entry.description);
  console.log('  journalEntryId:', journalEntryId);
  console.log('');

  // Map to JOURNAL_ENTRIES (journal_entries table)
  const journalEntry = await prisma.journalEntry.findUnique({
    where: { id: journalEntryId },
    include: { journalEntryLines: { include: { chartOfAccount: true } } }
  });

  assert(!!journalEntry, `journalEntryId "${journalEntryId}" must map to a document in journal_entries (JOURNAL_ENTRIES)`);

  console.log('--- Journal entry (journal_entries) ---');
  console.log('  id:', journalEntry.id);
  console.log('  referenceNumber:', journalEntry.referenceNumber);
  console.log('  description:', journalEntry.description);
  console.log('  totalAmount:', journalEntry.totalAmount);
  console.log('  status:', journalEntry.status);
  console.log('  lines:', journalEntry.journalEntryLines?.length ?? 0);
  console.log('');

  console.log('========== Summary ==========');
  if (failures.length > 0) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log('  -', f));
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('Traceability test passed:');
  console.log('  - Cashbook entry', entry.id, 'has journalEntryId =', journalEntryId);
  console.log('  - That id maps to a valid document in journal_entries (JOURNAL_ENTRIES).');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
