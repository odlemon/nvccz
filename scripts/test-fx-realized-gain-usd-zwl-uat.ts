/**
 * UAT: 100 USD invoice @ 1:10 ZWL (ZiG), pay 1,200 ZWL @ implied 1:12 → realized gain 200 ZWL.
 * Expected payment JE: Dr Bank 1,200 | Cr AR 1,000 | Cr realized FX gain 200.
 * ZiG in product = ZWL in DB (this script resolves ZWL or ZWG).
 * Run: npm run test:uat:fx-realized-usd-zwl
 */
// @ts-nocheck
import { prisma } from '../src/utils/database';
import { InvoiceService } from '../src/services/InvoiceService';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

async function main() {
  console.log('=== UAT: USD invoice → ZWL payment, realized FX gain ===\n');

  const [user, customer, usd, zwl] = await Promise.all([
    prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }),
    prisma.customer.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.currency.findFirst({ where: { code: 'USD', isActive: true } }),
    prisma.currency.findFirst({
      where: { code: { in: ['ZWL', 'ZWG'] }, isActive: true },
      orderBy: { code: 'asc' }
    })
  ]);

  assert(!!user && !!customer && !!usd && !!zwl, 'Need user, customer, USD, and ZWL (or ZWG) currency');

  const rateAtInvoice = 10;
  const paymentZwl = 1200;
  const expectedArClear = 1000;
  const expectedGain = 200;

  const inv = await InvoiceService.createInvoice({
    customerId: customer.id,
    amount: 100,
    currencyId: usd.id,
    transactionDate: new Date(),
    description: `UAT FX realized USD→ZWL ${Date.now()}`,
    items: [{ description: 'UAT', quantity: 1, unitPrice: 100 }],
    isTaxable: false,
    createdById: user.id,
    exchangeRateAtCreation: rateAtInvoice,
    usdZwgRateSnapshot: rateAtInvoice
  });

  assert(Number(inv.totalAmount) === 100, 'totalAmount 100 USD');
  assert(Number(inv.exchangeRateAtCreation) === rateAtInvoice, 'exchangeRateAtCreation 10');

  await InvoiceService.sendInvoice(inv.id, { usdZwgSnapshotForSend: rateAtInvoice });

  const paid = await InvoiceService.markAsPaid(inv.id, {
    paymentMethod: 'BANK',
    paymentCurrencyId: zwl.id,
    paymentAmount: paymentZwl,
    paymentExchangeRate: 12
  });

  assert(paid.status === 'PAID', 'PAID');
  assert(paid.paymentSettlement?.path === 'USD_ZWL', 'USD_ZWL path');
  assert(paid.paymentSettlement?.realizedGainLoss?.gainLossType === 'GAIN', 'GAIN');

  const fx = await prisma.forexGainLoss.findFirst({
    where: { invoiceId: inv.id },
    orderBy: { createdAt: 'desc' }
  });
  assert(!!fx, 'ForexGainLoss row');
  assert(fx.gainLossType === 'GAIN', 'fx GAIN');
  assert(Math.abs(Number(fx.gainLossAmount) - expectedGain) < 0.02, `gainLossAmount ~${expectedGain}`);
  assert(!!fx.journalEntryId, 'linked JE');

  const lines = await prisma.journalEntryLine.findMany({
    where: { journalEntryId: fx.journalEntryId },
    include: { chartOfAccount: true }
  });

  const totalDr = lines.reduce((s, l) => s + Number(l.debitAmount), 0);
  const totalCr = lines.reduce((s, l) => s + Number(l.creditAmount), 0);
  assert(Math.abs(totalDr - totalCr) < 0.05, `balanced JE dr=${totalDr} cr=${totalCr}`);

  const maxDebit = Math.max(...lines.map((l) => Number(l.debitAmount)), 0);
  const sumCrArLike = lines
    .filter((l) => {
      const no = l.chartOfAccount?.accountNo;
      const name = (l.chartOfAccount?.accountName || '').toLowerCase();
      return no === '1200' || name.includes('receivable');
    })
    .reduce((s, l) => s + Number(l.creditAmount), 0);
  const sumCrFx = lines
    .filter((l) => {
      const name = (l.chartOfAccount?.accountName || '').toLowerCase();
      return (
        name.includes('foreign exchange') ||
        name.includes('forex') ||
        name.includes('fx ')
      );
    })
    .reduce((s, l) => s + Number(l.creditAmount), 0);

  assert(
    Math.abs(maxDebit - paymentZwl) < 0.05,
    `Dr bank/cash ~${paymentZwl}, got max debit line ${maxDebit}`
  );
  assert(
    Math.abs(sumCrArLike - expectedArClear) < 0.05,
    `Cr AR ~${expectedArClear}, got ${sumCrArLike}`
  );
  assert(
    Math.abs(sumCrFx - expectedGain) < 0.05,
    `Cr FX gain ~${expectedGain}, got ${sumCrFx}`
  );

  console.log('Invoice:', inv.id, inv.invoiceNumber);
  console.log('ForexGainLoss:', fx.id, fx.gainLossType, fx.gainLossAmount.toString());
  console.log('JE lines:', lines.length, '| max Dr:', maxDebit, '| Cr AR:', sumCrArLike, '| Cr FX:', sumCrFx);
  console.log('\nPASS — realized FX gain JE (1,200 / 1,000 / 200).');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
