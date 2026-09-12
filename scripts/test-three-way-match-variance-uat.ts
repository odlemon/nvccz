// @ts-nocheck
/**
 * UAT: Three-way match — vendor bill > PO + 20% blocks post until acknowledgePoVarianceOverride (manager).
 *
 * Run: npm run test:uat:three-way-variance
 * Requires: DB column purchase_invoices.source_purchase_order_id (npm run db:migrate:purchase-invoice-source-po)
 */
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../src/utils/database';
import { ProcurementService } from '../src/services/ProcurementService';
import {
  PurchaseInvoiceService,
  POVarianceWarningError,
  POVarianceOverrideForbiddenError,
  PO_VARIANCE_MAX_RATIO,
} from '../src/services/PurchaseInvoiceService';

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m);
}

async function main() {
  console.log('========== Three-way match: PO variance on vendor bill post ==========\n');

  const col = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
    `SELECT COUNT(*) AS c FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'purchase_invoices' AND COLUMN_NAME = 'source_purchase_order_id'`
  );
  if (Number(col[0]?.c ?? 0) === 0) {
    console.error('Run: npm run db:migrate:purchase-invoice-source-po');
    process.exitCode = 1;
    return;
  }

  const zig = await prisma.currency.findFirst({ where: { code: 'ZIG', isActive: true } });
  const user =
    (await prisma.user.findFirst({
      where: { email: 'admin@nts.com' },
      include: { role: true },
    })) ||
    (await prisma.user.findFirst({
      where: { email: 'admin@nvccz.co.zw' },
      include: { role: true },
    }));
  const vendor = await prisma.vendor.findFirst({
    where: { isActive: true, email: { contains: '@' } },
  });
  assert(!!zig && !!user && !!vendor, 'Need ZIG, admin user, vendor');

  const suffix = Date.now();
  const po = await ProcurementService.createPurchaseOrder({
    vendorId: vendor.id,
    currencyId: zig.id,
    createdById: user.id,
    items: [{ itemName: `3WM PO ${suffix}`, quantity: 1, unitPrice: 1000 }],
  });
  const poTotal = Number(po.totalAmount);
  await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: { status: 'SENT', sentAt: new Date(), sentById: user.id },
  });

  const bill = await PurchaseInvoiceService.createVendorBillFromPurchaseOrder({
    purchaseOrderId: po.id,
    supplierInvoiceNumber: `3WM-SUP-${suffix}`,
    createdById: user.id,
  });
  assert(bill.sourcePurchaseOrderId === po.id, 'Bill linked to PO');

  const inflated = poTotal * (PO_VARIANCE_MAX_RATIO + 0.05);
  await prisma.purchaseInvoice.update({
    where: { id: bill.id },
    data: {
      subtotal: new Decimal(inflated),
      vatAmount: new Decimal(0),
      totalAmount: new Decimal(inflated),
      outstandingAmount: new Decimal(inflated),
    },
  });

  const expense = await prisma.chartOfAccounts.findFirst({
    where: { isActive: true, accountType: 'Expense' },
    orderBy: { accountNo: 'asc' },
  });
  assert(!!expense, 'Need expense GL');

  let threwWarning = false;
  try {
    await PurchaseInvoiceService.submitInvoice(
      bill.id,
      { paymentMethod: 'CREDIT', expenseAccountId: expense.id },
      user.id
    );
  } catch (e) {
    if (e instanceof POVarianceWarningError) {
      threwWarning = true;
      assert(e.details.poNumber === po.poNumber, 'details.poNumber');
      assert(e.details.billTotal > e.details.poTotal * PO_VARIANCE_MAX_RATIO, 'over 20%');
      console.log('OK: Post blocked with Variance Warning (no override)');
    } else {
      throw e;
    }
  }
  assert(threwWarning, 'Expected POVarianceWarningError without override');

  const posted = await PurchaseInvoiceService.submitInvoice(
    bill.id,
    {
      paymentMethod: 'CREDIT',
      expenseAccountId: expense.id,
      acknowledgePoVarianceOverride: true,
    },
    user.id
  );
  assert(posted.status === 'POSTED', 'Posted with manager override');
  assert(!!posted.journalEntryId, 'Journal created');
  console.log('OK: Posted with acknowledgePoVarianceOverride (admin / manage_accounting)\n');
  console.log('PASS — three-way match variance UAT\n');
}

main()
  .catch((e) => {
    if (e instanceof POVarianceOverrideForbiddenError) {
      console.error('Override forbidden — use admin or role with manage_accounting');
    }
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
