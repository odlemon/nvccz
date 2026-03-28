/**
 * UAT: Depreciation JE mapping — Dr 5130 (Depreciation Expense), Cr 1550 (Accumulated Depreciation).
 * Asset stores `depreciationExpenseAccountId` and `accumulatedDepreciationAccountId`; postDepreciation uses them on the JE lines.
 * Run: npm run test:uat:depreciation-je-mapping
 */
// @ts-nocheck
import { prisma } from '../src/utils/database';
import { AssetService } from '../src/services/AssetService';

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m);
}

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  assert(!!user, 'Need a user');

  const exp5130 = await prisma.chartOfAccounts.findFirst({
    where: { isActive: true, accountNo: '5130' },
  });
  const acc1550 = await prisma.chartOfAccounts.findFirst({
    where: { isActive: true, accountNo: '1550' },
  });
  assert(!!exp5130, 'Need GL 5130 (Depreciation Expense)');
  assert(!!acc1550, 'Need GL 1550 (Accumulated Depreciation)');

  const zig = await prisma.currency.findFirst({
    where: { isActive: true, code: { in: ['ZWG', 'ZWL', 'ZIG'] } },
    orderBy: { code: 'asc' },
  });
  assert(!!zig, 'Need ZiG/ZWL currency');

  const assetGl =
    (await prisma.chartOfAccounts.findFirst({ where: { isActive: true, accountNo: '1500' } })) ||
    (await prisma.chartOfAccounts.findFirst({
      where: { isActive: true, accountName: { contains: 'Equipment' } },
      orderBy: { accountNo: 'asc' },
    }));
  assert(!!assetGl, 'Need asset cost GL (e.g. 1500)');

  const bank = await prisma.bank.findFirst({
    where: { isActive: true, currencyId: zig.id, glAccountId: { not: null } },
    include: { glAccount: true },
  });
  assert(!!bank?.glAccount, 'Need ZiG bank with GL');

  const code = `JE-MAP-UAT-${Date.now()}`;
  await AssetService.createAsset({
    assetName: 'JE mapping test',
    assetCode: code,
    purchaseDate: new Date(),
    cost: 2400,
    usefulLifeYears: 2,
    depreciationMethod: 'STRAIGHT_LINE',
    salvageValue: 0,
    assetAccountId: assetGl.id,
    accumulatedDepreciationAccountId: acc1550.id,
    depreciationExpenseAccountId: exp5130.id,
    createdById: user.id,
    currencyId: zig.id,
    paymentBankId: bank.id,
  });

  const assetRow = await prisma.asset.findUnique({ where: { assetCode: code } });
  assert(!!assetRow, 'Asset created');

  const period = `2032-06`;
  const rec = await AssetService.calculateDepreciation({
    assetId: assetRow.id,
    period,
    createdById: user.id,
  });
  await AssetService.postDepreciation(rec.id, user.id);

  const je = await prisma.journalEntry.findFirst({
    where: { referenceNumber: { startsWith: `DEP-${period}-` } },
    orderBy: { createdAt: 'desc' },
    include: {
      journalEntryLines: { include: { chartOfAccount: true } },
    },
  });
  assert(!!je, 'Depreciation journal entry exists');

  const dr = je.journalEntryLines.find((l) => Number(l.debitAmount) > 0);
  const cr = je.journalEntryLines.find((l) => Number(l.creditAmount) > 0);
  assert(!!dr && !!cr, 'Expected one Dr and one Cr line');

  assert(
    dr.chartOfAccount.accountNo === '5130',
    `Dr should be 5130, got ${dr.chartOfAccount.accountNo}`
  );
  assert(
    cr.chartOfAccount.accountNo === '1550',
    `Cr should be 1550, got ${cr.chartOfAccount.accountNo}`
  );
  assert(
    Math.abs(Number(dr.debitAmount) - Number(cr.creditAmount)) < 0.02,
    'Dr and Cr amounts should match'
  );

  console.log(
    `PASS — Depreciation JE: Dr 5130 ${dr.debitAmount}, Cr 1550 ${cr.creditAmount} | ${je.referenceNumber}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
