/**
 * UAT: Credit note for returned goods 50 ZiG net + VAT — Dr Revenue, Dr VAT Output, Cr AR.
 * Run: npm run test:uat:credit-note-zig
 */
// @ts-nocheck
import { prisma } from '../src/utils/database';
import { CreditNoteService } from '../src/services/CreditNoteService';
import VATService from '../src/services/VATService';

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m);
}

async function main() {
  const net = 50;
  const vat = VATService.calculateVAT(net);
  const total = net + vat;

  const [user, customer, zig] = await Promise.all([
    prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }),
    prisma.customer.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } }),
    prisma.currency.findFirst({
      where: { code: { in: ['ZWL', 'ZWG'] }, isActive: true },
      orderBy: { code: 'asc' }
    })
  ]);
  assert(!!user && !!customer && !!zig, 'Need user, customer, ZWL/ZWG');

  const cn = await CreditNoteService.createCreditNote({
    customerId: customer.id,
    amount: net,
    vatAmount: vat,
    totalAmount: total,
    currencyId: zig.id,
    reason: 'UAT — returned item 50 ZiG net',
    createdById: user.id
  });

  assert(!!cn.journalEntryId, 'journal linked');

  const lines = await prisma.journalEntryLine.findMany({
    where: { journalEntryId: cn.journalEntryId },
    include: { chartOfAccount: true }
  });

  const sumDr = lines.reduce((s, l) => s + Number(l.debitAmount), 0);
  const sumCr = lines.reduce((s, l) => s + Number(l.creditAmount), 0);
  assert(Math.abs(sumDr - sumCr) < 0.02, `JE balanced: dr ${sumDr} cr ${sumCr}`);

  const crAr = lines.filter(
    (l) =>
      Number(l.creditAmount) > 0 &&
      (l.chartOfAccount?.accountNo === '1200' ||
        (l.chartOfAccount?.accountName || '').includes('Receivable'))
  );
  assert(crAr.length >= 1, 'Cr AR');
  assert(Math.abs(Number(crAr[0].creditAmount) - total) < 0.02, `Cr AR = gross ${total}`);

  const drRev = lines.filter(
    (l) =>
      Number(l.debitAmount) > 0 &&
      l.chartOfAccount?.accountType === 'Revenue' &&
      Math.abs(Number(l.debitAmount) - net) < 0.02
  );
  assert(drRev.length >= 1, `Dr Revenue ~${net}`);

  const drVat = lines.filter(
    (l) =>
      Number(l.debitAmount) > 0 &&
      (l.chartOfAccount?.accountName || '').toLowerCase().includes('vat output')
  );
  assert(drVat.length >= 1, 'Dr VAT Output');
  assert(Math.abs(Number(drVat[0].debitAmount) - vat) < 0.02, `Dr VAT ~${vat}`);

  console.log('PASS — Credit note', cn.creditNoteNumber, '| Cr AR', total, '| Dr Rev', net, '| Dr VAT', vat);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
