/**
 * UAT: USD invoice → mark paid in ZAR (triple leg + forex + ZAR journal).
 * Run: npx ts-node scripts/test-usd-invoice-zar-payment-uat.ts
 */
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { extractZwgPerZar, pickUsdZwg } from '../src/services/ZimrateRateService';
import { fetchZimrateRatesOrUatFallback } from '../src/services/UsdZwgRateResolver';
import { InvoiceService } from '../src/services/InvoiceService';

const prisma = new PrismaClient();

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m);
}

async function main() {
  const [user, customer, usd, zarCur, zarBank, zim] = await Promise.all([
    prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }),
    prisma.customer.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: 'asc' }
    }),
    prisma.currency.findFirst({ where: { code: 'USD' } }),
    prisma.currency.findFirst({ where: { code: 'ZAR' } }),
    prisma.bank.findFirst({
      where: { isActive: true, currency: { code: 'ZAR' } },
      include: { currency: true, glAccount: true }
    }),
    fetchZimrateRatesOrUatFallback(prisma)
  ]);

  assert(!!user && !!customer && !!usd && !!zarCur && !!zarBank, 'Need user, customer, USD, ZAR currency, and a ZAR bank');
  assert(!!zarBank!.glAccountId, 'ZAR bank must have glAccountId');

  const usdRow = pickUsdZwg(zim);
  assert(!!usdRow && usdRow.avg > 0, 'Zimrate must return USD/ZWG');
  const rateSnapshot = usdRow.avg;

  const zarZwl = extractZwgPerZar(zim);
  assert(!!zarZwl, 'Zimrate must return ZAR/ZWL for this test');

  const amountUsd = 50;
  const inv = await InvoiceService.createInvoice({
    customerId: customer!.id,
    amount: amountUsd,
    currencyId: usd!.id,
    transactionDate: new Date(),
    description: `UAT USD→ZAR cross pay ${Date.now()}`,
    items: [{ description: 'Svc', quantity: 1, unitPrice: amountUsd }],
    isTaxable: false,
    createdById: user!.id,
    exchangeRateAtCreation: rateSnapshot,
    usdZwgRateSnapshot: rateSnapshot
  });

  const rateCreate = Number(inv.exchangeRateAtCreation ?? inv.usdZwgRateSnapshot);
  assert(rateCreate > 0, 'creation rate');
  const originalZwl = amountUsd * rateCreate;
  const zarDue = new Decimal(originalZwl).div(zarZwl!.zwgPerZar).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const payZar = zarDue.plus(5).toNumber();

  await InvoiceService.sendInvoice(inv.id, { usdZwgSnapshotForSend: rateSnapshot });

  const paid = await InvoiceService.markAsPaid(inv.id, {
    paymentMethod: 'BANK',
    paymentCurrencyId: zarCur!.id,
    paymentAmount: payZar,
    bankId: zarBank!.id
  });

  assert(paid.status === 'PAID', 'status PAID');
  assert(!!paid.crossCurrencyPayment, 'crossCurrencyPayment on response');
  assert((paid.crossCurrencyPayment as any).path === 'USD_ZWL_ZAR', 'path');
  assert(!!paid.paymentSettlement, 'paymentSettlement on response');
  assert((paid.paymentSettlement as any).path === 'USD_ZWL_ZAR', 'paymentSettlement.path');
  assert(
    (paid.paymentSettlement as any).realizedGainLoss?.forexGainLossId,
    'paymentSettlement.realizedGainLoss.forexGainLossId'
  );

  const fx = await prisma.forexGainLoss.findFirst({
    where: { invoiceId: inv.id },
    orderBy: { createdAt: 'desc' }
  });
  assert(!!fx, 'ForexGainLoss row');
  assert(!!fx!.journalEntryId, 'Forex linked to journal');

  const lines = await prisma.journalEntryLine.findMany({
    where: { journalEntryId: fx!.journalEntryId! }
  });
  const deb = lines.reduce((s, l) => s + Number(l.debitAmount), 0);
  const cre = lines.reduce((s, l) => s + Number(l.creditAmount), 0);
  assert(Math.abs(deb - cre) < 0.02, `JE balanced deb=${deb} cre=${cre}`);

  console.log('\n=== USD invoice paid in ZAR — OK ===');
  console.log('Invoice:', inv.id, 'invoiceNumber:', inv.invoiceNumber);
  console.log('Paid with ZAR:', payZar, 'bank:', zarBank!.name);
  console.log('crossCurrencyPayment:', JSON.stringify(paid.crossCurrencyPayment, null, 2));
  console.log('forexGainLoss:', fx!.id, fx!.gainLossType, fx!.gainLossAmount.toString());
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
