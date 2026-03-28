/**
 * Expense payment: 300 ZiG for Electricity (GL 5200) → Dr 5200, Cr bank GL (e.g. 1100).
 * Cashbook PAYMENT = Money Out. Journal is created and POSTED for GL counterparty.
 *
 * Run: npx ts-node --transpile-only scripts/test-cashbook-expense-payment-zig-uat.ts
 */
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../src/utils/database';
import CashbookService from '../src/services/CashbookService';

const EPS = 0.02;

async function main() {
  console.log('========== Cashbook: ZiG expense payment (Electricity 5200) UAT ==========\n');

  const admin = await prisma.user.findFirst({
    where: { email: { in: ['admin@nts.com', 'admin@nvccz.co.zw'] } },
  });
  if (!admin) {
    throw new Error('Admin user not found');
  }

  const ensured = await CashbookService.ensureZigCashbookBank();
  const expense5200 = await CashbookService.ensureElectricityExpenseAccount5200();
  const amount = 300;

  const result = await CashbookService.createCashPayment({
    bankId: ensured.bank.id,
    transactionDate: new Date(),
    description: 'Electricity',
    amount,
    reference: `UAT-ELEC-${Date.now()}`,
    counterpartyType: 'GL',
    glAccountId: expense5200.id,
    vatCode: '0%',
    createdById: admin.id,
  });

  if (!result.success || !result.transaction) {
    throw new Error(result.message || 'Payment failed');
  }
  if (result.transaction.type !== 'PAYMENT') {
    throw new Error('Expected PAYMENT (Money Out)');
  }
  if (result.transaction.status !== 'POSTED') {
    throw new Error(`GL payment should be POSTED with journal; got ${result.transaction.status}`);
  }
  if (!result.transaction.journalEntryId || !result.journalEntry) {
    throw new Error('Expected cashbook payment linked to a posted journal entry');
  }

  const lines = await prisma.journalEntryLine.findMany({
    where: { journalEntryId: result.journalEntry.id },
    include: { chartOfAccount: true },
  });

  const bankGlId = ensured.bank.glAccountId;
  const crBank = lines.find((l) => l.chartOfAccountId === bankGlId);
  const drExp = lines.find((l) => l.chartOfAccountId === expense5200.id);

  if (!drExp || new Decimal(drExp.debitAmount).toNumber() < amount - EPS) {
    throw new Error(`Expected Dr GL 5200 ≈ ${amount}`);
  }
  if (!crBank || new Decimal(crBank.creditAmount).toNumber() < amount - EPS) {
    throw new Error(`Expected Cr bank GL (${ensured.glAccountNo}) ≈ ${amount}`);
  }

  console.log('OK: Journal entry', result.journalEntry.id, '(POSTED)');
  console.log(`   Dr ${drExp.chartOfAccount.accountNo} ${drExp.chartOfAccount.accountName}: ${drExp.debitAmount}`);
  console.log(`   Cr ${crBank.chartOfAccount.accountNo} ${crBank.chartOfAccount.accountName}: ${crBank.creditAmount}`);
  console.log('\nOK: Bank register (Money Out)');
  console.log(`   PAYMENT amount ${amount} ${ensured.currencyCode} — ${result.transaction.description}`);
  console.log('\n', result.message);
  console.log('\nUAT passed.\n');

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
