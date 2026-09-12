/**
 * UAT: Acquire fixed asset "Server" 5000 ZiG — Dr asset GL (e.g. 1500), Cr bank GL; appears on active register.
 * Run: npm run test:uat:asset-acquisition-zig
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
  assert(!!zig, 'Need ZiG/ZWL currency (ZWG/ZWL/ZIG)');

  const assetGl =
    (await prisma.chartOfAccounts.findFirst({
      where: { isActive: true, accountNo: '1500' },
    })) ||
    (await prisma.chartOfAccounts.findFirst({
      where: {
        isActive: true,
        OR: [
          { financialStatement: { contains: 'Fixed' } },
          { accountType: { contains: 'Fixed' } },
          { accountName: { contains: 'Equipment' } },
          { accountName: { contains: 'Computer' } },
        ],
      },
      orderBy: { accountNo: 'asc' },
    }));
  assert(!!assetGl, 'Need asset GL (account 1500 or a fixed-asset account)');

  const accDep =
    (await prisma.chartOfAccounts.findFirst({
      where: {
        isActive: true,
        OR: [
          { accountName: { contains: 'Accumulated Depreciation' } },
          { accountNo: { startsWith: '159' } },
        ],
      },
      orderBy: { accountNo: 'asc' },
    })) || (await prisma.chartOfAccounts.findFirst({ where: { isActive: true, accountType: 'Asset' }, orderBy: { accountNo: 'desc' } }));
  assert(!!accDep, 'Need accumulated depreciation GL');

  const depExp = await prisma.chartOfAccounts.findFirst({
    where: {
      isActive: true,
      accountType: 'Expense',
      OR: [
        { accountName: { contains: 'Depreciation' } },
        { accountNo: { startsWith: '6' } },
      ],
    },
    orderBy: { accountNo: 'asc' },
  });
  assert(!!depExp, 'Need depreciation expense GL');

  const bank = await prisma.bank.findFirst({
    where: {
      isActive: true,
      currencyId: zig.id,
      glAccountId: { not: null },
    },
    include: { glAccount: true },
  });
  assert(!!bank?.glAccount, 'Need an active bank in ZiG with glAccountId set (credits bank on acquisition)');

  const code = `SRV-UAT-${Date.now()}`;
  const asset = await AssetService.createAsset({
    assetName: 'Server',
    assetCode: code,
    description: 'UAT — asset acquisition',
    purchaseDate: new Date(),
    cost: 5000,
    usefulLifeYears: 3,
    depreciationMethod: 'STRAIGHT_LINE',
    salvageValue: 0,
    assetAccountId: assetGl.id,
    accumulatedDepreciationAccountId: accDep.id,
    depreciationExpenseAccountId: depExp.id,
    createdById: user.id,
    currencyId: zig.id,
    paymentBankId: bank.id,
  });

  assert(asset.status === 'IN_USE', 'New asset IN_USE');
  assert(Number(asset.cost) === 5000, 'cost 5000');

  const je = await prisma.journalEntry.findFirst({
    where: { referenceNumber: `ASSET-${code}` },
    include: {
      journalEntryLines: { include: { chartOfAccount: true } },
    },
  });
  assert(!!je, 'Acquisition journal exists');
  assert(je.currencyId === zig.id, 'JE in ZiG currency');

  const dr = je.journalEntryLines.filter((l) => Number(l.debitAmount) > 0);
  const cr = je.journalEntryLines.filter((l) => Number(l.creditAmount) > 0);
  assert(dr.length >= 1 && cr.length >= 1, 'Dr and Cr lines');
  assert(
    dr.some((l) => l.chartOfAccountId === assetGl.id && Math.abs(Number(l.debitAmount) - 5000) < 0.02),
    `Dr asset (${assetGl.accountNo}) 5000`
  );
  assert(
    cr.some(
      (l) => l.chartOfAccountId === bank.glAccountId && Math.abs(Number(l.creditAmount) - 5000) < 0.02
    ),
    `Cr bank GL (${bank.glAccount?.accountNo}) 5000`
  );

  const register = await AssetService.getAssetRegister();
  const row = register.find((r) => r.assetCode === code);
  assert(!!row, 'Asset on active register');
  assert(row.status === 'IN_USE', 'Register row IN_USE');
  assert(row.cost === 5000, 'Register cost 5000');

  console.log(
    `PASS — Server 5000 ${zig.code}: Dr ${assetGl.accountNo} Cr bank ${bank.glAccount?.accountNo} | register ${code}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
