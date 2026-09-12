import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  let testRevenueSource = await prisma.revenueSource.findFirst({
    where: { name: 'API Test Revenue' }
  });
  if (!testRevenueSource) {
    testRevenueSource = await prisma.revenueSource.create({
      data: {
        name: 'API Test Revenue',
        description: 'Auto-created for API smoke tests (scripts/dump-test-entity-ids.ts)'
      }
    });
  }

  let testRevenueCategory = await prisma.revenueCategory.findFirst({
    where: { name: 'API Test Revenue Category' }
  });
  if (!testRevenueCategory) {
    testRevenueCategory = await prisma.revenueCategory.create({
      data: {
        name: 'API Test Revenue Category',
        description: 'Auto-created for API smoke tests (scripts/dump-test-entity-ids.ts)'
      }
    });
  }

  const [usdRow, zarRow, currencies] = await Promise.all([
    prisma.currency.findFirst({ where: { code: 'USD' } }),
    prisma.currency.findFirst({ where: { code: 'ZAR' } }),
    prisma.currency.findMany({ take: 20, orderBy: { code: 'asc' } })
  ]);
  const usd = usdRow ?? currencies[0];
  const zar = zarRow;

  const customer = await prisma.customer.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' }
  });
  const vendor = await prisma.vendor.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' }
  });
  const bank = await prisma.bank.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' }
  });
  const coaList = await prisma.chartOfAccounts.findMany({
    where: { isActive: true },
    take: 8,
    orderBy: { accountNo: 'asc' }
  });
  const coaInv = await prisma.chartOfAccounts.findFirst({
    where: {
      isActive: true,
      OR: [
        { accountName: { contains: 'Inventory' } },
        { accountName: { contains: 'Merchandise' } }
      ]
    }
  });
  const invCoa = coaInv;

  const out = {
    currencyUsd: usd ? { id: usd.id, code: usd.code, name: usd.name } : null,
    currencyZar: zar ? { id: zar.id, code: zar.code, name: zar.name } : null,
    customer: customer ? { id: customer.id, name: customer.name } : null,
    vendor: vendor ? { id: vendor.id, name: vendor.name } : null,
    bank: bank
      ? { id: bank.id, name: bank.name, currencyId: bank.currencyId }
      : null,
    revenueSource: { id: testRevenueSource.id, name: testRevenueSource.name },
    revenueCategory: {
      id: testRevenueCategory.id,
      name: testRevenueCategory.name
    },
    chartAccounts: coaList.map((c) => ({
      id: c.id,
      accountNo: c.accountNo,
      accountName: c.accountName,
      accountType: c.accountType
    })),
    suggestedInventoryAssetCoa: invCoa
      ? {
          id: invCoa.id,
          accountNo: invCoa.accountNo,
          accountName: invCoa.accountName
        }
      : null
  };

  const rsAny = await prisma.revenueSource.findFirst();
  const rcAny = await prisma.revenueCategory.findFirst();
  const coaRevenue = await prisma.chartOfAccounts.findFirst({
    where: {
      isActive: true,
      OR: [
        { accountType: { contains: 'Revenue' } },
        { accountName: { contains: 'Revenue' } },
        { accountName: { contains: 'Sales' } }
      ]
    }
  });
  const coaAR = await prisma.chartOfAccounts.findFirst({
    where: {
      isActive: true,
      OR: [
        { accountName: { contains: 'Receivable' } },
        { accountNo: '1200' }
      ]
    }
  });
  const extra = {
    testRevenueSource: {
      id: testRevenueSource.id,
      name: testRevenueSource.name
    },
    testRevenueCategory: {
      id: testRevenueCategory.id,
      name: testRevenueCategory.name
    },
    revenueSourceAny: rsAny
      ? { id: rsAny.id, name: rsAny.name, isActive: rsAny.isActive }
      : null,
    revenueCategoryAny: rcAny
      ? { id: rcAny.id, name: rcAny.name, isActive: rcAny.isActive }
      : null,
    coaRevenue: coaRevenue
      ? {
          id: coaRevenue.id,
          accountNo: coaRevenue.accountNo,
          accountName: coaRevenue.accountName
        }
      : null,
    coaAccountsReceivable: coaAR
      ? { id: coaAR.id, accountNo: coaAR.accountNo, accountName: coaAR.accountName }
      : null,
    coaInventory: coaInv
      ? { id: coaInv.id, accountNo: coaInv.accountNo, accountName: coaInv.accountName }
      : null
  };

  console.log(JSON.stringify({ ...out, ...extra }, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
