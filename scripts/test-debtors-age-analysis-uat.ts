/**
 * UAT: Invoice dated 65 days ago, due net-30 → ~35 days past due → 31–60 band ("60 Days" column).
 * GET debtors-age-analysis must place outstanding in days31To60.
 * Run: npm run test:uat:debtors-age
 */
// @ts-nocheck
import { prisma } from '../src/utils/database';
import { InvoiceService } from '../src/services/InvoiceService';
import { DebtorsAgeAnalysisService } from '../src/services/DebtorsAgeAnalysisService';

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m);
}

async function main() {
  const [user, customer, cur] = await Promise.all([
    prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }),
    prisma.customer.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } }),
    prisma.currency.findFirst({
      where: { code: { in: ['ZWL', 'ZWG', 'USD'] }, isActive: true },
      orderBy: { code: 'asc' }
    })
  ]);
  assert(!!user && !!customer && !!cur, 'Need user, customer, currency');

  const asOf = new Date(
    Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate())
  );
  const invDate = new Date(asOf);
  invDate.setUTCDate(invDate.getUTCDate() - 65);
  const dueDate = new Date(invDate);
  dueDate.setUTCDate(dueDate.getUTCDate() + 30);

  const inv = await InvoiceService.createInvoice({
    customerId: customer.id,
    amount: 200,
    currencyId: cur.id,
    transactionDate: invDate,
    description: 'UAT debtors ageing — 65d invoice, net 30 due',
    isTaxable: false,
    createdById: user.id,
    items: [{ description: 'Svc', quantity: 1, unitPrice: 200 }]
  });

  await prisma.invoice.update({
    where: { id: inv.id },
    data: { dueDate }
  });

  await InvoiceService.sendInvoice(inv.id);

  const report = await DebtorsAgeAnalysisService.generate({ asOfDate: asOf });
  const row = report.lines.find((l) => l.invoiceId === inv.id);
  assert(!!row, 'invoice on debtors age report');
  assert(row.bucket === 'days31To60', `bucket days31To60 (60 Days col), got ${row.bucket}`);
  assert(row.reportColumnTitle === '60 Days', `reportColumnTitle 60 Days, got ${row.reportColumnTitle}`);
  assert(row.daysPastDue >= 34 && row.daysPastDue <= 36, `~35 days past due, got ${row.daysPastDue}`);

  const code = cur.code.toUpperCase();
  const t = report.totalsByCurrency[code];
  assert(t && t.days31To60 >= 200, 'totals 31–60 include amount');

  console.log('PASS — Debtors age:', row.invoiceNumber, row.bucket, row.daysPastDue, 'd past due');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
