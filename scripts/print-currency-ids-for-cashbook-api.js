require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const port = process.env.PORT || '3000';
  const base = `http://localhost:${port}`;

  const zigLike = await prisma.currency.findMany({
    where: {
      isActive: true,
      OR: [
        { code: 'ZIG' },
        { code: 'ZWG' },
        { code: { contains: 'ZIG' } },
        { name: { contains: 'ZiG' } },
      ],
    },
    select: { id: true, code: true, name: true },
    orderBy: { code: 'asc' },
  });

  const usd = await prisma.currency.findFirst({
    where: { isActive: true, code: 'USD' },
    select: { id: true, code: true, name: true },
  });

  const zigBank = await prisma.bank.findFirst({
    where: {
      isActive: true,
      OR: [{ name: { contains: 'ZiG' } }, { name: { contains: 'ZIG' } }],
    },
    select: { id: true, name: true, accountNumber: true, currencyId: true },
  });

  console.log('\n=== Copy-paste: ZiG-style currency row(s) ===\n');
  if (zigLike.length === 0) console.log('(none found by ZIG/ZWG/code contains)');
  else console.log(JSON.stringify(zigLike, null, 2));

  if (usd) {
    console.log('\n=== USD (for reference) ===\n');
    console.log(JSON.stringify(usd, null, 2));
  }

  if (zigBank) {
    console.log('\n=== Sample ZiG-named bank (optional bankId filter) ===\n');
    console.log(JSON.stringify(zigBank, null, 2));
  }

  const primaryZig = zigLike.find((c) => c.code === 'ZIG') || zigLike.find((c) => c.code === 'ZWG') || zigLike[0];
  if (primaryZig) {
    const cid = primaryZig.id;
    const q = new URLSearchParams({
      startDate: '2026-03-23',
      endDate: '2026-03-29',
      currencyId: cid,
      minAmount: '100',
      maxAmount: '500',
      search: 'Monthly municipal TAX',
      page: '1',
      limit: '50',
    });
    console.log('\n=== Full GET (real currencyId, no placeholders) ===\n');
    console.log(`${base}/api/cashbook/entries?${q.toString()}`);
  }

  console.log('\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
