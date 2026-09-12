/**
 * UAT: ZiG cash sale — balanced JE; Dr bank GL, Cr sales (+ VAT lines if taxable). Same currency on all lines.
 * Values below are intentionally non-round to catch rounding bugs. Run: npm run test:uat:revenue-zig-double-entry
 */
// @ts-nocheck
import { prisma } from '../src/utils/database';
import { RevenueService } from '../src/services/RevenueService';

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m);
}

async function main() {
  const [user, source, zig, bank] = await Promise.all([
    prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }),
    prisma.revenueSource.findFirst({ where: { isActive: true } }),
    prisma.currency.findFirst({
      where: { isActive: true, code: { in: ['ZWG', 'ZWL', 'ZIG'] } },
      orderBy: { code: 'asc' },
    }),
    prisma.bank.findFirst({
      where: { isActive: true, glAccountId: { not: null } },
      include: { glAccount: true, currency: true },
    }),
  ]);

  assert(!!user && !!source && !!zig && !!bank?.glAccount, 'Need user, revenue source, ZiG currency, bank with GL');

  const zwlBank =
    bank.currencyId === zig.id
      ? bank
      : await prisma.bank.findFirst({
          where: { isActive: true, currencyId: zig.id, glAccountId: { not: null } },
          include: { glAccount: true },
        });
  assert(!!zwlBank?.glAccount, 'Need a bank in ZiG/ZWL with GL (ZiG cash sale)');

  const netAmount = 333.33;
  const revenue = await RevenueService.createRevenue({
    sourceId: source.id,
    amount: netAmount,
    currencyId: zig.id,
    transactionDate: new Date(),
    description: `UAT taxable sale ${netAmount} + VAT ${zig.code}`,
    isTaxable: true,
    paymentMethod: 'CASH',
    createdById: user.id,
    paymentBankId: zwlBank.id,
  });

  const expectedVat = Number(revenue.vatAmount);
  const expectedTotal = Number(revenue.totalAmount);
  assert(
    Array.isArray(revenue.doubleEntryLines) && revenue.doubleEntryLines.length === 3,
    'Three JE lines (Dr bank, Cr sales, Cr VAT)'
  );
  const dr = revenue.doubleEntryLines.filter((l) => l.side === 'DR');
  const cr = revenue.doubleEntryLines.filter((l) => l.side === 'CR');
  assert(dr.length === 1 && cr.length === 2, 'One DR, two CR');
  assert(
    revenue.doubleEntryLines.every(
      (l) => l.currencyCode.toUpperCase() === zig.code.toUpperCase()
    ),
    'All lines same currency as sale'
  );
  const drTot = dr.reduce((s, l) => s + l.amount, 0);
  const crTot = cr.reduce((s, l) => s + l.amount, 0);
  assert(Math.abs(drTot - crTot) < 0.05, `DR total ${drTot} must equal CR total ${crTot}`);
  assert(Math.abs(drTot - expectedTotal) < 0.05, `Dr bank ~ totalAmount ${expectedTotal}, got ${drTot}`);
  const crVat = cr.find((l) => l.accountName.toLowerCase().includes('vat'));
  const crSales = cr.find((l) => !l.accountName.toLowerCase().includes('vat'));
  assert(!!crVat && Math.abs(crVat.amount - expectedVat) < 0.05, 'Cr VAT line ~ vatAmount');
  assert(!!crSales && Math.abs(crSales.amount - netAmount) < 0.05, 'Cr revenue ~ net');

  assert(
    dr[0].accountNo === zwlBank.glAccount.accountNo,
    `Dr should be bank GL ${zwlBank.glAccount.accountNo}, got ${dr[0].accountNo}`
  );

  const je = await prisma.journalEntry.findUnique({
    where: { id: revenue.journalEntryId },
    include: { journalEntryLines: true },
  });
  assert(!!je, 'Journal persisted');
  for (const ln of je.journalEntryLines) {
    assert(ln.recordedCurrencyId === zig.id, 'Line recordedCurrencyId = transaction currency');
  }

  console.log(
    `PASS — ${expectedTotal} ${zig.code} (net ${netAmount} + VAT ${expectedVat.toFixed(2)}): DR ${dr[0].accountNo} | doubleEntry balanced`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
