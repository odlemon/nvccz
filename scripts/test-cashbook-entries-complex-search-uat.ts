/**
 * UAT: Complex cashbook search — amount range + currency + substring search (case-insensitive).
 * Mirrors GET /api/cashbook/entries filters in CashbookControllerEnhanced.getAllEntries.
 *
 * Run: npx ts-node scripts/test-cashbook-entries-complex-search-uat.ts
 */
// @ts-nocheck
import { prisma } from '../src/utils/database';
import { CashbookService } from '../src/services/CashbookService';

const failures: string[] = [];
function assert(cond: boolean, msg: string) {
  if (!cond) failures.push(msg);
}

async function main() {
  console.log('========== Cashbook complex search UAT ==========\n');

  const admin = await prisma.user.findFirst({
    where: { email: { in: ['admin@nts.com', 'admin@nvccz.co.zw'] } }
  });
  assert(!!admin, 'Admin user not found');

  const zigCtx = await CashbookService.ensureZigCashbookBank();
  const bank = zigCtx.bank;
  const currencyId = bank.currencyId;
  assert(!!currencyId, 'ZiG bank must have currencyId');

  const day = new Date();
  day.setHours(12, 0, 0, 0);

  const descriptions = [
    'Monthly municipal TAX — case test',
    'Bulk taX adjustment receipt',
    'No keyword here 150',
    'reference-only',
    'Final TAX installment edge 500'
  ];

  const createdIds: string[] = [];

  const income = await prisma.chartOfAccounts.findFirst({
    where: { isActive: true, accountNo: '4000' }
  });
  const incomeFallback = await prisma.chartOfAccounts.findFirst({
    where: { accountType: { contains: 'Revenue' } },
    orderBy: { accountNo: 'asc' }
  });
  const glId = income?.id || incomeFallback?.id;
  assert(!!glId, 'Need a revenue GL for receipts');

  for (let i = 0; i < descriptions.length; i++) {
    const amount = i === 2 ? 150 : i === 3 ? 200 : i === 4 ? 500 : 100 + i * 50; // i=0:100, i=1:150
    const ref = i === 3 ? 'INV-TAX-REF-99' : `CS-UAT-${i}`;
    const r = await CashbookService.createCashReceipt({
      bankId: bank.id,
      transactionDate: day,
      description: descriptions[i],
      amount,
      reference: ref,
      counterpartyType: 'GL',
      glAccountId: glId,
      vatCode: '0%',
      createdById: admin!.id
    });
    assert(r.success && r.transaction, `Create receipt ${i}: ${r.message}`);
    if (r.transaction) createdIds.push(r.transaction.id);
  }

  const startDate = new Date(day);
  startDate.setHours(0, 0, 0, 0);
  const endDate = new Date(day);
  endDate.setHours(23, 59, 59, 999);

  const where = {
    AND: [
      { originalTransactionId: null },
      { transactionDate: { gte: startDate, lte: endDate } },
      { amount: { gte: 100, lte: 500 } },
      {
        OR: [{ description: { contains: 'Tax' } }, { reference: { contains: 'Tax' } }]
      },
      {
        OR: [{ bank: { currencyId } }, { recordedCurrencyId: currencyId }]
      }
    ]
  };

  const matches = await prisma.cashbookEntry.findMany({ where, select: { id: true, description: true, reference: true, amount: true } });

  const matchSet = new Set(matches.map((m) => m.id));
  assert(matchSet.has(createdIds[0]), 'Should match description TAX (uppercase substring)');
  assert(matchSet.has(createdIds[1]), 'Should match description taX (mixed case)');
  assert(!matchSet.has(createdIds[2]), 'Should NOT match row with no tax substring');
  assert(matchSet.has(createdIds[3]), 'Should match reference INV-TAX-REF-99');
  assert(matchSet.has(createdIds[4]), 'Should match amount 500 at upper bound');

  console.log('Matching rows:', matches.length);
  matches.forEach((m) => console.log(`  - ${m.id} amt=${m.amount} ref=${m.reference} | ${m.description?.slice(0, 50)}`));

  if (failures.length) {
    console.error('\nFAILURES:\n', failures.join('\n'));
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log('\nUAT passed: case-insensitive substring, amount range, currency, date.');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
