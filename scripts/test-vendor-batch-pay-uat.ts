/**
 * UAT: Batch pay 10 vendor bills → 1 cashbook PAYMENT + 1 JE (Dr AP, Cr Bank) + 10 purchase_invoice_payments.
 * Run: npm run test:uat:vendor-batch-pay
 */
// @ts-nocheck
import { prisma } from "../src/utils/database";
import { PurchaseInvoiceService } from "../src/services/PurchaseInvoiceService";

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m);
}

async function main() {
  const [user, vendor, currency, expense, bank] = await Promise.all([
    prisma.user.findFirst({ orderBy: { createdAt: "asc" } }),
    prisma.vendor.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" } }),
    prisma.currency.findFirst({
      where: { code: { in: ["ZWL", "ZWG", "ZIG", "USD"] }, isActive: true },
      orderBy: { code: "asc" },
    }),
    prisma.chartOfAccounts.findFirst({
      where: { isActive: true, accountType: "Expense", accountNo: { startsWith: "5" } },
      orderBy: { accountNo: "asc" },
    }),
    prisma.bank.findFirst({
      where: { isActive: true, glAccountId: { not: null } },
      include: { currency: true, glAccount: true },
    }),
  ]);

  assert(!!user && !!vendor && !!currency && !!expense, "Need user, vendor, currency, expense GL");
  assert(!!bank?.glAccountId, "Need an active bank with GL linked");

  const banksForCurrency = await prisma.bank.findMany({
    where: {
      isActive: true,
      currencyId: currency.id,
      glAccountId: { not: null },
    },
    include: { glAccount: true },
    take: 1,
  });
  const payBank = banksForCurrency[0];
  assert(!!payBank, `Need a bank in currency ${currency.code} with GL (run db:uat:multicurrency-banks or link a bank)`);

  const stamp = `${Date.now()}`;
  const n = 10;
  const invoiceIds: string[] = [];
  let expectedTotal = 0;

  const due = new Date();
  due.setUTCDate(due.getUTCDate() + 30);

  for (let i = 0; i < n; i++) {
    const lineAmt = 100 + i;
    expectedTotal += lineAmt;
    const draft = await PurchaseInvoiceService.createPurchaseInvoice({
      vendorId: vendor.id,
      invoiceDate: new Date(),
      dueDate: due,
      currencyId: currency.id,
      description: `Batch UAT ${stamp} line ${i + 1}`,
      isTaxable: false,
      createdById: user.id,
      vendorInvoiceReference: `BATCH-UAT-${stamp}-${i}`,
      items: [{ itemName: `Batch item ${i + 1}`, quantity: 1, unitPrice: lineAmt }],
    });
    const posted = await PurchaseInvoiceService.submitInvoice(
      draft.id,
      { paymentMethod: "CREDIT", expenseAccountId: expense.id },
      user.id
    );
    assert(posted.status === "POSTED", `Bill ${i + 1} POSTED`);
    assert(posted.paymentMethod === "CREDIT", "CREDIT");
    assert(Number(posted.outstandingAmount) === lineAmt, `outstanding ${lineAmt}`);
    assert(!posted.cashbookEntryId, "no single cashbook before batch");
    invoiceIds.push(posted.id);
  }

  const batchRef = `BATCH-UAT-${stamp}`;
  const result = await PurchaseInvoiceService.payInvoicesBatch(
    invoiceIds,
    {
      paymentMethod: "BANK",
      bankId: payBank.id,
      paymentDate: new Date(),
      paymentReference: batchRef,
      notes: "UAT batch pay",
    },
    user.id
  );

  assert(result.invoices.length === n, "10 invoices returned");
  assert(Number(result.totalAmount) === expectedTotal, `total ${expectedTotal}, got ${result.totalAmount}`);

  const cb = await prisma.cashbookEntry.findUnique({
    where: { id: result.cashbookEntryId },
    include: { journalEntry: { include: { journalEntryLines: { include: { chartOfAccount: true } } } } },
  });
  assert(!!cb, "cashbook exists");
  assert(cb.type === "PAYMENT", "one bank movement = PAYMENT");
  assert(cb.status === "POSTED", "posted");
  assert(Number(cb.amount) === expectedTotal, "cashbook amount = sum of bills");

  const payRows = await prisma.purchaseInvoicePayment.findMany({
    where: { cashbookEntryId: result.cashbookEntryId },
    orderBy: { purchaseInvoiceId: "asc" },
  });
  assert(payRows.length === n, `10 payment rows, got ${payRows.length}`);
  const byInv = new Map(payRows.map((r) => [r.purchaseInvoiceId, r]));
  for (const id of invoiceIds) {
    assert(byInv.has(id), `payment row for invoice ${id}`);
  }
  const sumPay = payRows.reduce((s, r) => s + Number(r.amount), 0);
  assert(Math.abs(sumPay - expectedTotal) < 0.02, "sum(payment amounts) = batch total");

  const uniqCb = new Set(payRows.map((r) => r.cashbookEntryId));
  assert(uniqCb.size === 1, "all payments same cashbook");

  const lines = cb.journalEntry?.journalEntryLines || [];
  assert(lines.length === 2, "JE: Dr AP + Cr Bank");
  let drAp = 0;
  let crBank = 0;
  for (const l of lines) {
    drAp += Number(l.debitAmount);
    crBank += Number(l.creditAmount);
  }
  assert(Math.abs(drAp - expectedTotal) < 0.02, "Dr AP = total");
  assert(Math.abs(crBank - expectedTotal) < 0.02, "Cr Bank = total");

  for (let i = 0; i < n; i++) {
    const inv = await prisma.purchaseInvoice.findUnique({ where: { id: invoiceIds[i] } });
    assert(inv.paymentStatus === "PAID", `inv ${i + 1} PAID`);
    assert(Number(inv.outstandingAmount) < 0.02, `inv ${i + 1} outstanding 0`);
  }

  console.log(
    "PASS — Senior accountant checks: 1× cashbook PAYMENT, 1× balanced JE (Dr AP / Cr Bank), 10× purchase_invoice_payments, bills cleared."
  );
  console.log({
    cashbookEntryId: result.cashbookEntryId,
    journalEntryId: result.journalEntryId,
    batchReference: result.batchReference,
    totalAmount: result.totalAmount,
    invoiceIds,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
