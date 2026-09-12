/**
 * UAT: Depreciation stops at scrap/residual value (book must not go below salvage).
 * Run: npm run test:uat:depreciation-scrap-floor
 */
// @ts-nocheck
import { prisma } from '../src/utils/database';
import { AssetService } from '../src/services/AssetService';

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m);
}

/** Remote MySQL may drop long-lived connections mid-suite; reconnect once and retry. */
async function calculateAndPostDepreciationMonth(
  assetId: string,
  period: string,
  userId: string
) {
  let rec;
  try {
    rec = await AssetService.calculateDepreciation({
      assetId,
      period,
      createdById: userId,
    });
  } catch (e: any) {
    if (e?.code === 'P1017' || e?.code === 'P2024') {
      await prisma.$disconnect().catch(() => {});
      await prisma.$connect();
      rec = await AssetService.calculateDepreciation({
        assetId,
        period,
        createdById: userId,
      });
    } else throw e;
  }
  try {
    await AssetService.postDepreciation(rec.id, userId);
  } catch (e: any) {
    if (e?.code === 'P1017' || e?.code === 'P2024') {
      await prisma.$disconnect().catch(() => {});
      await prisma.$connect();
      await AssetService.postDepreciation(rec.id, userId);
    } else throw e;
  }
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
  assert(!!assetGl, 'Need asset GL');

  const accDep =
    (await prisma.chartOfAccounts.findFirst({
      where: { isActive: true, accountName: { contains: 'Accumulated Depreciation' } },
    })) ||
    (await prisma.chartOfAccounts.findFirst({ where: { isActive: true, accountType: 'Asset' }, orderBy: { accountNo: 'desc' } }));
  assert(!!accDep, 'Need accumulated depreciation GL');

  const depExp = await prisma.chartOfAccounts.findFirst({
    where: { isActive: true, accountType: 'Expense', accountName: { contains: 'Depreciation' } },
    orderBy: { accountNo: 'asc' },
  });
  assert(!!depExp, 'Need depreciation expense GL');

  const bank = await prisma.bank.findFirst({
    where: { isActive: true, currencyId: zig.id, glAccountId: { not: null } },
    include: { glAccount: true },
  });
  assert(!!bank?.glAccount, 'Need ZiG bank with GL');

  const code = `SCRAP-UAT-${Date.now()}`;
  const cost = 1300;
  const scrap = 100;

  await AssetService.createAsset({
    assetName: 'Scrap floor test asset',
    assetCode: code,
    purchaseDate: new Date(),
    cost,
    usefulLifeYears: 1,
    depreciationMethod: 'STRAIGHT_LINE',
    salvageValue: scrap,
    assetAccountId: assetGl.id,
    accumulatedDepreciationAccountId: accDep.id,
    depreciationExpenseAccountId: depExp.id,
    createdById: user.id,
    currencyId: zig.id,
    paymentBankId: bank.id,
  });

  const assetRow = await prisma.asset.findUnique({ where: { assetCode: code } });
  assert(!!assetRow, 'Asset created');

  for (let m = 1; m <= 12; m++) {
    const period = `2030-${String(m).padStart(2, '0')}`;
    await calculateAndPostDepreciationMonth(assetRow.id, period, user.id);
  }

  await prisma.asset.findUniqueOrThrow({ where: { id: assetRow.id } }).then((a) => {
    const book = Number(a.currentBookValue);
    assert(Math.abs(book - scrap) < 0.02, `After 12 months book should be scrap ~100, got ${book}`);
  });

  let threw = false;
  try {
    await AssetService.calculateDepreciation({
      assetId: assetRow.id,
      period: '2031-01',
      createdById: user.id,
    });
  } catch (e) {
    threw = true;
    assert(
      String(e.message || e).toLowerCase().includes('scrap') ||
        String(e.message || e).toLowerCase().includes('residual'),
      `Expected scrap/residual message, got ${e.message || e}`
    );
  }
  assert(threw, 'Period 13 should not post depreciation');

  console.log('PASS — Book value stops at scrap (100); further periods blocked.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
