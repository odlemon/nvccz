/**
 * UAT: Vendor bill "Office Rent" on CREDIT → Cr AP 2000; appears in Creditors Age Analysis "Current".
 * Run: npm run test:uat:creditors-rent
 */
// @ts-nocheck
import { prisma } from '../src/utils/database';
import { PurchaseInvoiceService } from '../src/services/PurchaseInvoiceService';
import { CreditorsAgeAnalysisService } from '../src/services/CreditorsAgeAnalysisService';

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m);
}

async function main() {
  const [user, vendor, currency, ap2000] = await Promise.all([
    prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }),
    prisma.vendor.findFirst({ where: { isActive: true }, orderBy: { createdAt: 'asc' } }),
    prisma.currency.findFirst({
      where: { code: { in: ['ZWL', 'ZWG', 'USD'] }, isActive: true },
      orderBy: { code: 'asc' }
    }),
    prisma.chartOfAccounts.findFirst({
      where: {
        isActive: true,
        OR: [{ accountNo: '2000' }, { accountName: { contains: 'Creditors Control' } }]
      }
    })
  ]);

  assert(!!user && !!vendor && !!currency && !!ap2000, 'Need user, vendor, currency, AP 2000');

  const expense = await prisma.chartOfAccounts.findFirst({
    where: {
      isActive: true,
      accountType: 'Expense',
      OR: [
        { accountName: { contains: 'Rent' } },
        { accountNo: { startsWith: '5' } }
      ]
    },
    orderBy: { accountNo: 'asc' }
  });
  assert(!!expense, 'Need an expense GL account (e.g. Rent)');

  const due = new Date();
  due.setUTCDate(due.getUTCDate() + 30);

  const draft = await PurchaseInvoiceService.createPurchaseInvoice({
    vendorId: vendor.id,
    invoiceDate: new Date(),
    dueDate: due,
    currencyId: currency.id,
    description: 'Office Rent — landlord',
    isTaxable: false,
    createdById: user.id,
    items: [{ itemName: 'Office Rent', quantity: 1, unitPrice: 500 }]
  });

  const posted = await PurchaseInvoiceService.submitInvoice(
    draft.id,
    { paymentMethod: 'CREDIT', expenseAccountId: expense.id },
    user.id
  );

  assert(posted.paymentStatus === 'PENDING', 'credit bill stays PENDING until paid');
  assert(Number(posted.outstandingAmount) === 500, 'outstanding = total');

  const lines = await prisma.journalEntryLine.findMany({
    where: { journalEntryId: posted.journalEntryId },
    include: { chartOfAccount: true }
  });
  const crAp = lines.filter(
    (l) =>
      Number(l.creditAmount) > 0 &&
      (l.chartOfAccount?.accountNo === '2000' ||
        (l.chartOfAccount?.accountName || '').toLowerCase().includes('payable'))
  );
  assert(crAp.length >= 1, 'Expected Cr to Accounts Payable (2000)');
  assert(
    Math.abs(Number(crAp[0].creditAmount) - 500) < 0.02,
    `Cr AP ~500, got ${crAp[0].creditAmount}`
  );

  const report = await CreditorsAgeAnalysisService.generate();
  const row = report.lines.find((l) => l.purchaseInvoiceId === posted.id);
  assert(!!row, 'Bill in creditors age report');
  assert(row.bucket === 'current', `Current bucket (not past due), got ${row.bucket}`);
  const curTot = report.totalsByCurrency[currency.code.toUpperCase()];
  assert(curTot && curTot.current >= 500, 'Current bucket includes this bill');

  console.log('PASS — Office Rent bill Cr 2000, Creditors Age Analysis Current:', row.invoiceNumber);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
