/**
 * Creates a USD invoice, sends it (SENT), does NOT mark paid.
 * Prints a ready PATCH URL + JSON body for Postman (ZAR settlement).
 *
 * Optimized: one Zimrate HTTP request + parallel DB reads; pre-fetched USD/ZWG is passed into
 * invoice + journal create and send so Prisma middleware / sendInvoice skip extra resolver calls.
 *
 * Run: npx ts-node scripts/prepare-postman-usd-zar-mark-paid.ts
 * Requires: DATABASE_URL, Zimrate reachable, ZAR bank with GL (e.g. npm run db:uat:multicurrency-banks)
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import {
  extractZwgPerZar,
  fetchZimrateRates,
  pickUsdZwg
} from '../src/services/ZimrateRateService';
import { InvoiceService } from '../src/services/InvoiceService';

const prisma = new PrismaClient();

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
    fetchZimrateRates()
  ]);

  if (!user || !customer || !usd || !zarCur || !zarBank?.glAccountId) {
    throw new Error(
      'Need user, active customer, USD + ZAR currencies, and a ZAR bank with glAccountId. Run: npm run db:uat:multicurrency-banks'
    );
  }

  const usdRow = pickUsdZwg(zim);
  if (!usdRow || typeof usdRow.avg !== 'number' || !(usdRow.avg > 0)) {
    throw new Error('Zimrate did not return USD/ZWG; cannot snapshot invoice');
  }
  const rateSnapshot = usdRow.avg;

  const zarZwl = extractZwgPerZar(zim);
  if (!zarZwl) {
    throw new Error('Zimrate did not return ZAR/ZWL (or ZWG/ZAR); cannot compute ZAR payment amount');
  }

  const amountUsd = 50;
  const inv = await InvoiceService.createInvoice({
    customerId: customer.id,
    amount: amountUsd,
    currencyId: usd.id,
    transactionDate: new Date(),
    description: `Postman-ready USD invoice (ZAR pay) ${Date.now()}`,
    items: [{ description: 'Postman UAT line', quantity: 1, unitPrice: amountUsd }],
    isTaxable: false,
    createdById: user.id,
    exchangeRateAtCreation: rateSnapshot,
    usdZwgRateSnapshot: rateSnapshot
  });

  const rateCreate = Number(inv.exchangeRateAtCreation ?? inv.usdZwgRateSnapshot);
  if (!rateCreate || rateCreate <= 0) {
    throw new Error('Invoice missing exchangeRateAtCreation');
  }

  const originalZwl = amountUsd * rateCreate;
  const zarDue = new Decimal(originalZwl)
    .div(zarZwl.zwgPerZar)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .toNumber();

  await InvoiceService.sendInvoice(inv.id, { usdZwgSnapshotForSend: rateSnapshot });

  const body = {
    paymentMethod: 'BANK',
    paymentCurrencyId: zarCur.id,
    paymentAmount: zarDue,
    bankId: zarBank.id
  };

  console.log('\n--- Copy into Postman ---\n');
  console.log('Method: PATCH');
  console.log(`URL:    {{baseUrl}}/api/accounting/invoices/${inv.id}/mark-as-paid`);
  console.log('\nHeaders: Authorization: Bearer {{token}}');
  console.log('         Content-Type: application/json\n');
  console.log('Body (raw JSON):\n');
  console.log(JSON.stringify(body, null, 2));
  console.log('\n--- Reference (already done in DB) ---\n');
  console.log(
    JSON.stringify(
      {
        invoiceId: inv.id,
        invoiceNumber: inv.invoiceNumber,
        statusAfterScript: 'SENT',
        invoiceTotalUsd: amountUsd,
        suggestedPaymentZar_exactObligation: zarDue,
        zarBankName: zarBank.name,
        zimratePairUsed: zarZwl.matchedPair,
        usdZwgSnapshotUsedForCreateAndSend: rateSnapshot
      },
      null,
      2
    )
  );
  console.log(
    '\nTip: Increase paymentAmount slightly (e.g. +5 ZAR) if you want to see a realized GAIN in the response.\n'
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
