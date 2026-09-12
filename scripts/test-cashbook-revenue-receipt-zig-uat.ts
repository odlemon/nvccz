/**
 * Revenue receipting: 1200 ZiG cash sale (consulting) → Dr bank GL (1100 when free), Cr income 4000.
 * Bank register: RECEIPT = Money In (positive amount).
 *
 * Run: npx ts-node --transpile-only scripts/test-cashbook-revenue-receipt-zig-uat.ts
 */
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../src/utils/database';
import CashbookService from '../src/services/CashbookService';

const EPS = 0.02;

async function main() {
  console.log('========== Cashbook: ZiG revenue receipt (Consulting) UAT ==========\n');

  const admin = await prisma.user.findFirst({
    where: { email: { in: ['admin@nts.com', 'admin@nvccz.co.zw'] } },
  });
  if (!admin) {
    throw new Error('Admin user not found');
  }

  const ensured = await CashbookService.ensureZigCashbookBank();
  console.log(
    `ZiG bank: ${ensured.bank.name} (${ensured.created ? 'created' : 'existing'}) — GL ${ensured.glAccountNo}, currency ${ensured.currencyCode}\n`
  );

  const income4000 = await CashbookService.ensureConsultingIncomeAccount4000();
  const amount = 1200;

  // Cash sale: GL counterparty to revenue (not CUSTOMER, which would Cr 1200 AR)
  const result = await CashbookService.createCashReceipt({
    bankId: ensured.bank.id,
    transactionDate: new Date(),
    description: 'Consulting Services — customer cash receipt',
    amount,
    reference: `UAT-CONSULT-${Date.now()}`,
    counterpartyType: 'GL',
    glAccountId: income4000.id,
    vatCode: '0%',
    createdById: admin.id,
  });

  if (!result.success || !result.transaction || !result.journalEntry) {
    throw new Error(result.message || 'Receipt failed');
  }

  const tx = result.transaction;
  if (tx.type !== 'RECEIPT') {
    throw new Error('Cashbook type must be RECEIPT (Money In)');
  }
  if (new Decimal(tx.amount).toNumber() !== amount) {
    throw new Error('Cashbook amount mismatch');
  }

  const lines = await prisma.journalEntryLine.findMany({
    where: { journalEntryId: result.journalEntry.id },
    include: { chartOfAccount: true },
  });

  const bankGlId = ensured.bank.glAccountId;
  const drBank = lines.find((l) => l.chartOfAccountId === bankGlId);
  const crIncome = lines.find((l) => l.chartOfAccountId === income4000.id);

  if (!drBank || new Decimal(drBank.debitAmount).toNumber() < amount - EPS) {
    throw new Error(`Expected Dr bank GL (${ensured.glAccountNo}) ≈ ${amount}`);
  }
  if (!crIncome || new Decimal(crIncome.creditAmount).toNumber() < amount - EPS) {
    throw new Error(`Expected Cr GL 4000 ≈ ${amount}`);
  }

  console.log('OK: Journal');
  console.log(`   Dr ${drBank.chartOfAccount.accountNo} ${drBank.chartOfAccount.accountName}: ${drBank.debitAmount}`);
  console.log(`   Cr ${crIncome.chartOfAccount.accountNo} ${crIncome.chartOfAccount.accountName}: ${crIncome.creditAmount}`);
  console.log('\nOK: Bank register (Money In)');
  console.log(`   RECEIPT amount +${amount} ${ensured.currencyCode} — ${tx.description}`);
  console.log('\nUAT passed.\n');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
