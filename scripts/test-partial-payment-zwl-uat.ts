/**
 * UAT: 100 ZWL (ZiG) invoice, pay 40 → PARTIALLY_PAID, outstanding 60; open list.
 * Run: npm run test:uat:partial-pay-zwl
 */
// @ts-nocheck
import { prisma } from '../src/utils/database';
import { InvoiceService } from '../src/services/InvoiceService';
import { OpenItemService } from '../src/services/OpenItemService';

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m);
}

async function main() {
  const [user, customer, zig] = await Promise.all([
    prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }),
    prisma.customer.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } }),
    prisma.currency.findFirst({
      where: { code: { in: ['ZWL', 'ZWG'] }, isActive: true },
      orderBy: { code: 'asc' }
    })
  ]);
  assert(!!user && !!customer && !!zig, 'Need user, customer, ZWL/ZWG currency');

  const inv = await InvoiceService.createInvoice({
    customerId: customer.id,
    amount: 100,
    currencyId: zig.id,
    transactionDate: new Date(),
    description: `UAT partial pay ZWL ${Date.now()}`,
    isTaxable: false,
    createdById: user.id,
    items: [{ description: 'Line', quantity: 1, unitPrice: 100 }]
  });

  await InvoiceService.sendInvoice(inv.id);

  const afterPay = await InvoiceService.markAsPaid(inv.id, {
    paymentMethod: 'BANK',
    paymentAmount: 40
  });

  assert(afterPay.status === 'PARTIALLY_PAID', `status PARTIALLY_PAID, got ${afterPay.status}`);
  assert(Number(afterPay.outstandingAmount) === 60, `outstanding 60, got ${afterPay.outstandingAmount}`);
  assert(Number(afterPay.paidAmount) === 40, `paidAmount 40, got ${afterPay.paidAmount}`);

  const list = await InvoiceService.getInvoices({
    status: 'OPEN',
    customerId: customer.id,
    limit: 50,
    page: 1
  });
  const found = list.invoices.find((i) => i.id === inv.id);
  assert(!!found, 'invoice in OPEN list (SENT|PARTIALLY_PAID & outstanding>0)');

  const openItems = await OpenItemService.getCustomerInvoices(customer.id);
  assert(openItems.some((o) => o.id === inv.id), 'OpenItemService lists invoice');
  const row = openItems.find((o) => o.id === inv.id);
  assert(Number(row.outstandingAmount) === 60, 'Open item outstanding 60');

  const full = await InvoiceService.markAsPaid(inv.id, { paymentMethod: 'BANK' });
  assert(full.status === 'PAID', 'second call pays remainder → PAID');
  assert(Number(full.outstandingAmount) === 0, 'outstanding 0');

  console.log('\nPASS — partial ZWL payment, open list, then settle.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
