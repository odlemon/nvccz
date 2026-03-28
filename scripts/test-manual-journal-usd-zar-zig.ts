// @ts-nocheck
/**
 * Manual journal: USD on line 1, ZAR on line 2 — ZiG equivalence must balance (DR = CR).
 *
 * Requires: npm run db:migrate:journal-line-recorded-currency
 * Run: npx ts-node scripts/test-manual-journal-usd-zar-zig.ts
 */
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../src/utils/database';
import JournalEntryService from '../src/services/JournalEntryService';
import { resolveUsdZwgAvgForSnapshot } from '../src/services/UsdZwgRateResolver';
import { fetchZimrateRates, extractZwgPerZar } from '../src/services/ZimrateRateService';

const failures: string[] = [];

function assert(condition: boolean, msg: string) {
  if (!condition) failures.push(msg);
}

async function main() {
  console.log('========== Manual JE: USD + ZAR (ZiG balance) ==========\n');

  const admin = await prisma.user.findFirst({
    where: { email: { in: ['admin@nts.com', 'admin@nvccz.co.zw'] } },
  });
  if (!admin) throw new Error('Admin user not found');

  const usd = await prisma.currency.findFirst({ where: { code: 'USD' } });
  const zar = await prisma.currency.findFirst({ where: { code: 'ZAR' } });
  if (!usd || !zar) throw new Error('USD and ZAR currencies must exist');

  const drAccount = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: '1520' },
    select: { id: true },
  });
  const crAccount = await prisma.chartOfAccounts.findFirst({
    where: { accountNo: '1000' },
    select: { id: true },
  });
  if (!drAccount || !crAccount) {
    throw new Error('Need chart accounts 1520 (debit) and 1000 (credit) — see test-natural-balance-delivery-van.ts');
  }

  const usdZwg = await resolveUsdZwgAvgForSnapshot(prisma);
  const full = await fetchZimrateRates();
  const zarPair = extractZwgPerZar(full);
  if (usdZwg == null || usdZwg <= 0) throw new Error('USD→ZiG rate unavailable');
  if (zarPair == null) throw new Error('ZAR→ZiG rate unavailable');

  const usdAmount = 100;
  const zigTarget = new Decimal(usdAmount).mul(usdZwg);
  const zarCredit = zigTarget.div(zarPair.zwgPerZar).toDecimalPlaces(3, Decimal.ROUND_HALF_UP);

  console.log('Rates: USD→ZiG avg =', usdZwg, '| ZWG per ZAR =', zarPair.zwgPerZar, `(${zarPair.matchedPair})`);
  console.log('Line 1: Dr', usdAmount, 'USD  →  ZiG ~', zigTarget.toFixed(3));
  console.log('Line 2: Cr', zarCredit.toFixed(3), 'ZAR  →  ZiG should match\n');

  const ok = await JournalEntryService.createManualJournalEntry({
    transactionDate: new Date(),
    referenceNumber: `MJ-USD-ZAR-${Date.now()}`,
    description: 'UAT: manual JE USD Dr / ZAR Cr (ZiG balanced)',
    currencyId: usd.id,
    journalEntryLines: [
      {
        chartOfAccountId: drAccount.id,
        debitAmount: usdAmount,
        creditAmount: 0,
        description: 'Dr USD',
        currencyId: usd.id,
      },
      {
        chartOfAccountId: crAccount.id,
        debitAmount: 0,
        creditAmount: Number(zarCredit),
        description: 'Cr ZAR',
        currencyId: zar.id,
      },
    ],
    createdById: admin.id,
  });

  if (!ok.success) {
    console.error('Create failed:', ok.error);
    process.exit(1);
  }
  const z = (ok as any).zigEquivalence;
  if (!z?.zigDebitTotal || !z?.zigCreditTotal) {
    console.error('Expected zigEquivalence with ZiG totals on mixed-currency manual JE');
    process.exit(1);
  }
  console.log('Created JE', ok.journalEntry?.id);
  console.log('zigEquivalence:', JSON.stringify(z, null, 2));

  const bad = await JournalEntryService.createManualJournalEntry({
    transactionDate: new Date(),
    referenceNumber: `MJ-USD-ZAR-BAD-${Date.now()}`,
    description: 'Should fail — ZiG imbalance',
    currencyId: usd.id,
    journalEntryLines: [
      {
        chartOfAccountId: drAccount.id,
        debitAmount: usdAmount,
        creditAmount: 0,
        description: 'Dr USD',
        currencyId: usd.id,
      },
      {
        chartOfAccountId: crAccount.id,
        debitAmount: 0,
        creditAmount: 1,
        description: 'Cr ZAR (too small)',
        currencyId: zar.id,
      },
    ],
    createdById: admin.id,
  });
  assert(bad.success === false, 'Imbalanced ZiG journal should be rejected');
  assert(String(bad.error || '').includes('ZiG'), `Expected ZiG balance error, got: ${bad.error}`);

  if (failures.length) {
    console.error('\nFAILURES:\n', failures.join('\n'));
    process.exit(1);
  }
  console.log('\nOK — balanced multi-currency manual JE accepted; imbalanced rejected.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
