/**
 * E2E check: USD and ZWL sales invoices — creation / send / paid rate snapshots + equivalentAtCreation.
 *
 * Run: npx ts-node scripts/test-invoice-lifecycle-e2e.ts
 * Uses DATABASE_URL from .env. Calls InvoiceService (same as API).
 */
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { InvoiceService } from '../src/services/InvoiceService';

const prisma = new PrismaClient();

function assert(cond: boolean, message: string): void {
  if (!cond) {
    throw new Error(`ASSERT: ${message}`);
  }
}

function num(v: unknown): number {
  return Number(v);
}

async function runOneCurrency(opts: {
  label: string;
  currencyId: string;
  currencyCode: string;
  customerId: string;
  userId: string;
  amount: number;
}): Promise<string> {
  const { label, currencyId, currencyCode, customerId, userId, amount } = opts;
  const tag = `[${label}]`;

  console.log(`\n${tag} Creating invoice (${currencyCode}, amount=${amount}, not taxable)...`);

  const created = await InvoiceService.createInvoice({
    customerId,
    amount,
    currencyId,
    transactionDate: new Date(),
    description: `E2E lifecycle snapshot test — ${label} ${Date.now()}`,
    items: [{ description: 'Line', quantity: 1, unitPrice: amount }],
    isTaxable: false,
    createdById: userId
  });

  let row = await prisma.invoice.findUnique({ where: { id: created.id } });
  assert(!!row, `${tag} row missing after create`);
  assert(
    row!.exchangeRateAtCreation != null && num(row!.exchangeRateAtCreation) > 0,
    `${tag} exchangeRateAtCreation missing after create`
  );
  assert(
    row!.usdZwgRateSnapshot != null && num(row!.usdZwgRateSnapshot) > 0,
    `${tag} usdZwgRateSnapshot missing after create`
  );
  console.log(
    `${tag} CREATE ok  exchangeRateAtCreation=${num(row!.exchangeRateAtCreation)}  usdZwg=${num(row!.usdZwgRateSnapshot)}`
  );

  const sent = await InvoiceService.sendInvoice(created.id);
  row = await prisma.invoice.findUnique({ where: { id: created.id } });
  assert(
    row!.exchangeRateAtSent != null && num(row!.exchangeRateAtSent) > 0,
    `${tag} exchangeRateAtSent missing after send`
  );
  assert(
    row!.usdZwgRateSnapshotSent != null && num(row!.usdZwgRateSnapshotSent) > 0,
    `${tag} usdZwgRateSnapshotSent missing after send`
  );
  console.log(
    `${tag} SEND ok  exchangeRateAtSent=${num(row!.exchangeRateAtSent)}  snapshotSent=${num(row!.usdZwgRateSnapshotSent)}`
  );

  const paid = await InvoiceService.markAsPaid(created.id, { paymentMethod: 'BANK' });
  row = await prisma.invoice.findUnique({ where: { id: created.id } });
  assert(
    row!.exchangeRateAtPaid != null && num(row!.exchangeRateAtPaid) > 0,
    `${tag} exchangeRateAtPaid missing after paid`
  );
  assert(
    row!.usdZwgRateSnapshotPaid != null && num(row!.usdZwgRateSnapshotPaid) > 0,
    `${tag} usdZwgRateSnapshotPaid missing after paid`
  );
  console.log(
    `${tag} PAID ok  exchangeRateAtPaid=${num(row!.exchangeRateAtPaid)}  snapshotPaid=${num(row!.usdZwgRateSnapshotPaid)}`
  );

  const viewed = await InvoiceService.getInvoiceById(created.id);
  assert(!!viewed, `${tag} getInvoiceById null`);
  const eq = viewed!.equivalentAtCreation;
  assert(eq != null, `${tag} equivalentAtCreation should be set`);
  assert(!!eq!.currency?.code, `${tag} equivalentAtCreation.currency.code missing`);
  const rate = num(viewed!.exchangeRateAtCreation ?? viewed!.usdZwgRateSnapshot);
  const total = new Decimal(viewed!.totalAmount.toString());

  if (currencyCode === 'USD') {
    assert(eq!.currency.code.toUpperCase() === 'ZWL' || eq!.currency.code.toUpperCase() === 'ZWG', `${tag} USD invoice equiv should be ZWL/ZWG`);
    const expected = total.mul(rate).toDecimalPlaces(2);
    assert(
      new Decimal(eq!.amount).equals(expected),
      `${tag} equivalent amount expected ${expected.toString()} got ${eq!.amount}`
    );
  } else {
    assert(eq!.currency.code.toUpperCase() === 'USD', `${tag} ZWL invoice equiv should be USD`);
    const expected = total.div(rate).toDecimalPlaces(2);
    assert(
      new Decimal(eq!.amount).equals(expected),
      `${tag} equivalent amount expected ${expected.toString()} got ${eq!.amount}`
    );
  }
  console.log(
    `${tag} equivalentAtCreation ok  amount=${eq!.amount}  currency=${eq!.currency.code}  (total=${total.toString()} rate=${rate})`
  );

  assert(sent.status === 'SENT', `${tag} send response status`);
  assert(paid.status === 'PAID', `${tag} paid status`);

  return created.id;
}

async function main() {
  const user = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' }, select: { id: true } });
  const customer = await prisma.customer.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: 'asc' },
    select: { id: true }
  });
  const usd = await prisma.currency.findFirst({ where: { code: 'USD', isActive: true } });
  const zwl =
    (await prisma.currency.findFirst({ where: { code: 'ZWL', isActive: true } })) ??
    (await prisma.currency.findFirst({ where: { code: 'ZWG', isActive: true } }));

  assert(!!user, 'Need at least one user');
  assert(!!customer, 'Need at least one active customer');
  assert(!!usd, 'Need USD currency');
  assert(!!zwl, 'Need ZWL or ZWG currency');

  const ids: string[] = [];
  try {
    const idUsd = await runOneCurrency({
      label: 'USD',
      currencyId: usd!.id,
      currencyCode: 'USD',
      customerId: customer!.id,
      userId: user!.id,
      amount: 100
    });
    ids.push(idUsd);

    const idZwl = await runOneCurrency({
      label: 'ZWL',
      currencyId: zwl!.id,
      currencyCode: zwl!.code,
      customerId: customer!.id,
      userId: user!.id,
      amount: 2500
    });
    ids.push(idZwl);

    console.log('\n=== All invoice lifecycle checks passed ===');
    console.log('Invoice IDs (left in DB, PAID):', ids.join(', '));
  } catch (e) {
    console.error('\n=== FAILED ===', e);
    process.exitCode = 1;
  }
}

main().finally(() => prisma.$disconnect());
