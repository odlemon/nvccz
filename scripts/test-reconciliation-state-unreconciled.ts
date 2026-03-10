// @ts-nocheck
/**
 * Reconciliation State – Unreconciled tab
 *
 * Create five new cashbook entries. They have isReconciled = false (reconciliation state "N").
 * They appear in the "Unreconciled" tab of the Bank Recon module.
 *
 * Run: npx ts-node scripts/test-reconciliation-state-unreconciled.ts
 */
import { prisma } from '../src/utils/database';
import { CashbookService } from '../src/services/CashbookService';
import { CashbookServiceEnhanced } from '../src/services/CashbookService-Enhanced';

const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

async function main() {
  console.log('========== Reconciliation State: 5 new entries → Unreconciled tab ==========\n');

  const admin = await prisma.user.findFirst({
    where: { email: { in: ['admin@nts.com', 'admin@nvccz.co.zw'] } }
  });
  if (!admin) throw new Error('Admin user not found');

  const bank = await prisma.bank.findFirst({
    where: { isActive: true },
    include: { glAccount: true }
  });
  if (!bank || !bank.glAccountId) throw new Error('No bank with GL found');

  const incomeAccount = await prisma.chartOfAccounts.findFirst({
    where: { accountType: { in: ['Revenue', 'Income'] }, isActive: true }
  });
  if (!incomeAccount) throw new Error('No Revenue/Income account found');

  const descriptions = [
    'Recon test entry 1',
    'Recon test entry 2',
    'Recon test entry 3',
    'Recon test entry 4',
    'Recon test entry 5'
  ];

  const createdIds: string[] = [];

  console.log('--- Creating 5 cashbook entries (receipts, POSTED) ---\n');
  for (let i = 0; i < 5; i++) {
    const result = await CashbookService.createCashReceipt({
      bankId: bank.id,
      transactionDate: new Date(),
      description: descriptions[i],
      amount: 10 + i,
      counterpartyType: 'GL',
      glAccountId: incomeAccount.id,
      vatCode: '0%',
      createdById: admin.id
    });
    assert(result.success, `Entry ${i + 1} must succeed: ${result.message}`);
    assert(!!result.transaction, `Entry ${i + 1} must have transaction`);
    if (result.transaction) createdIds.push(result.transaction.id);
  }

  console.log('Created 5 entries:', createdIds.length);

  // All five must have isReconciled = false (reconciliationStatus 'N')
  console.log('\n--- Checking reconciliationStatus / isReconciled = false (N) ---\n');
  const entries = await prisma.cashbookEntry.findMany({
    where: { id: { in: createdIds } }
  });
  for (const e of entries) {
    assert(e.status === 'POSTED', `Entry ${e.id} must be POSTED; got ${e.status}`);
    assert(e.isReconciled === false, `Entry ${e.id} must have isReconciled false (N); got ${e.isReconciled}`);
  }
  entries.forEach((e, i) => console.log(`  ${i + 1}. ${e.description} | isReconciled: ${e.isReconciled} (N) | status: ${e.status}`));

  // They must appear in Unreconciled tab (getUnreconciledEntries for this bank)
  console.log('\n--- Unreconciled tab (Bank Recon module) ---\n');
  const unreconciled = await CashbookServiceEnhanced.getUnreconciledEntries(bank.id);
  const unreconciledIds = new Set(unreconciled.map((u) => u.id));
  for (const id of createdIds) {
    assert(unreconciledIds.has(id), `Entry ${id} must appear in Unreconciled tab`);
  }
  console.log(`Unreconciled entries for bank ${bank.name}: ${unreconciled.length} total`);
  const ourInTab = unreconciled.filter((u) => createdIds.includes(u.id));
  console.log(`Our 5 entries in Unreconciled tab: ${ourInTab.length}`);
  ourInTab.forEach((u, i) => console.log(`  ${i + 1}. ${u.description} | id: ${u.id}`));

  console.log('\n========== Summary ==========');
  if (failures.length > 0) {
    console.log('FAILURES:');
    failures.forEach((f) => console.log('  -', f));
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('Reconciliation state test passed:');
  console.log('  - Created 5 new cashbook entries (POSTED).');
  console.log('  - reconciliationStatus / isReconciled = false (N) for all five.');
  console.log('  - All five appear in the Unreconciled tab of the Bank Recon module.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
