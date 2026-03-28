/**
 * UAT: Sell fully depreciated asset for 50 ZiG cash — register removal, clear accum depr, Dr bank, Cr gain.
 * Run: npm run test:uat:asset-disposal-zig
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
  const acc1550 = await prisma.chartOfAccounts.findFirst({
    where: { isActive: true, accountNo: '1550' },
  });
  const exp5130 = await prisma.chartOfAccounts.findFirst({
    where: { isActive: true, accountNo: '5130' },
  });
  assert(!!assetGl && !!acc1550 && !!exp5130, 'Need asset GL, 1550 accum depr, 5130 depr expense');

  const bank = await prisma.bank.findFirst({
    where: { isActive: true, currencyId: zig.id, glAccountId: { not: null } },
    include: { glAccount: true },
  });
  assert(!!bank?.glAccount, 'Need ZiG bank with GL');

  const code = `LAPTOP-DISP-${Date.now()}`;
  const cost = 600;
  await AssetService.createAsset({
    assetName: 'Laptop (UAT disposal)',
    assetCode: code,
    purchaseDate: new Date(),
    cost,
    usefulLifeYears: 1,
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

  for (let m = 1; m <= 12; m++) {
    const period = `2033-${String(m).padStart(2, '0')}`;
    const rec = await AssetService.calculateDepreciation({
      assetId: assetRow.id,
      period,
      createdById: user.id,
    });
    await AssetService.postDepreciation(rec.id, user.id);
  }

  const beforeDisp = await prisma.asset.findUniqueOrThrow({ where: { id: assetRow.id } });
  assert(Math.abs(Number(beforeDisp.currentBookValue)) < 0.05, 'Should be fully depreciated (book ~0)');

  await AssetService.disposeAsset({
    assetId: assetRow.id,
    disposalDate: new Date(),
    disposalValue: 50,
    disposalMethod: 'SALE',
    description: 'Cash sale — UAT',
    createdById: user.id,
    currencyId: zig.id,
    paymentBankId: bank.id,
  });

  const after = await prisma.asset.findUniqueOrThrow({ where: { id: assetRow.id } });
  assert(after.status === 'DISPOSED', 'status DISPOSED');
  assert(after.isActive === false, 'inactive (off register)');

  const register = await AssetService.getAssetRegister();
  assert(!register.some((r) => r.assetCode === code), 'Asset not on active register');

  const je = await prisma.journalEntry.findFirst({
    where: { referenceNumber: `DISPOSAL-${code}` },
    include: { journalEntryLines: { include: { chartOfAccount: true } } },
  });
  assert(!!je, 'Disposal JE exists');
  assert(je.currencyId === zig.id, 'JE in ZiG');

  const drBank = je.journalEntryLines.find(
    (l) =>
      Number(l.debitAmount) > 0 &&
      l.chartOfAccountId === bank.glAccountId &&
      Math.abs(Number(l.debitAmount) - 50) < 0.02
  );
  assert(!!drBank, 'Dr bank GL 50 (proceeds)');

  const drAccum = je.journalEntryLines.find(
    (l) =>
      Number(l.debitAmount) > 0 &&
      l.chartOfAccountId === acc1550.id &&
      Math.abs(Number(l.debitAmount) - cost) < 0.02
  );
  assert(!!drAccum, `Dr accumulated depreciation ~${cost}`);

  const crAsset = je.journalEntryLines.find(
    (l) =>
      Number(l.creditAmount) > 0 &&
      l.chartOfAccountId === assetGl.id &&
      Math.abs(Number(l.creditAmount) - cost) < 0.02
  );
  assert(!!crAsset, `Cr asset cost ~${cost}`);

  const crGain = je.journalEntryLines.find(
    (l) =>
      Number(l.creditAmount) > 0 &&
      Math.abs(Number(l.creditAmount) - 50) < 0.02 &&
      ['Revenue', 'Income'].includes(l.chartOfAccount?.accountType)
  );
  assert(!!crGain, 'Cr gain (Revenue/Income) 50');

  const tDr = je.journalEntryLines.reduce((s, l) => s + Number(l.debitAmount), 0);
  const tCr = je.journalEntryLines.reduce((s, l) => s + Number(l.creditAmount), 0);
  assert(Math.abs(tDr - tCr) < 0.02, 'JE balanced');

  console.log(`PASS — Disposal sale 50 ZiG: off register, accum cleared, gain posted | ${je.referenceNumber}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
