// @ts-nocheck
/**
 * UAT: Commitment accounting — ZIG PO increases procurement "Committed Spend"; GL unchanged until bill.
 * After PO → vendor bill conversion, PO is BILLED and leaves committed spend (AP posts on submit, not tested here).
 *
 * Run: npm run test:uat:commitment-zig
 */
import { prisma } from '../src/utils/database';
import { ProcurementService } from '../src/services/ProcurementService';
import { PurchaseInvoiceService } from '../src/services/PurchaseInvoiceService';

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m);
}

async function main() {
  console.log('========== Commitment accounting (ZIG PO → dashboard, no GL on PO) ==========\n');

  const zig = await prisma.currency.findFirst({
    where: { code: 'ZIG', isActive: true },
  });
  assert(!!zig, 'Need active ZIG currency');

  const user =
    (await prisma.user.findFirst({ where: { email: 'admin@nts.com' } })) ||
    (await prisma.user.findFirst({ where: { email: 'admin@nvccz.co.zw' } })) ||
    (await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } }));
  const vendor = await prisma.vendor.findFirst({
    where: { isActive: true, email: { contains: '@' } },
    orderBy: { createdAt: 'asc' },
  });
  assert(!!user && !!vendor, 'Need user and vendor with email');

  const dashBefore = await ProcurementService.getProcurementDashboard();
  const zigBefore = dashBefore.commitmentAccounting.committedSpendZIG;
  const jeBefore = await prisma.journalEntry.count();

  const suffix = Date.now();
  const po = await ProcurementService.createPurchaseOrder({
    vendorId: vendor.id,
    currencyId: zig.id,
    createdById: user.id,
    priority: 'MEDIUM',
    items: [
      {
        itemName: `Commitment UAT ${suffix}`,
        description: '5000 ZIG nominal line',
        quantity: 1,
        unitPrice: 5000,
        unit: 'ea',
      },
    ],
  });

  const jeAfterCreate = await prisma.journalEntry.count();
  assert(
    jeAfterCreate === jeBefore,
    `Creating a PO must not create journal entries (GL unchanged); JE count ${jeBefore} → ${jeAfterCreate}`
  );

  const dashMid = await ProcurementService.getProcurementDashboard();
  const zigMid = dashMid.commitmentAccounting.committedSpendZIG;
  const expectedDelta = Number(po.totalAmount);
  assert(
    Math.abs(zigMid - zigBefore - expectedDelta) < 0.02,
    `Committed Spend ZIG should increase by PO total ${expectedDelta}; before ${zigBefore}, after ${zigMid}`
  );

  const zigRow = dashMid.commitmentAccounting.committedSpendByCurrency.find(
    (r: { code: string }) => r.code?.toUpperCase() === 'ZIG'
  );
  assert(!!zigRow && zigRow.committedSpend >= expectedDelta - 0.02, 'ZIG row in committedSpendByCurrency');

  console.log(
    `OK: Committed Spend ZIG +${(zigMid - zigBefore).toFixed(2)} (PO total ${expectedDelta.toFixed(2)}, subtotal 5000 + VAT if any)`
  );

  await prisma.purchaseOrder.update({
    where: { id: po.id },
    data: { status: 'SENT', sentAt: new Date(), sentById: user.id },
  });

  const supRef = `COMM-UAT-${suffix}`;
  await PurchaseInvoiceService.createVendorBillFromPurchaseOrder({
    purchaseOrderId: po.id,
    supplierInvoiceNumber: supRef,
    createdById: user.id,
  });

  const poBilled = await prisma.purchaseOrder.findUnique({
    where: { id: po.id },
    select: { status: true },
  });
  assert(poBilled?.status === 'BILLED', 'PO should be BILLED after vendor bill creation');

  const dashEnd = await ProcurementService.getProcurementDashboard();
  const zigEnd = dashEnd.commitmentAccounting.committedSpendZIG;
  const drop = zigMid - zigEnd;
  assert(
    drop >= expectedDelta - 0.02,
    `After BILLED, committed ZIG should drop by at least PO total (${expectedDelta}); mid ${zigMid}, end ${zigEnd}, drop ${drop}`
  );

  console.log(
    `OK: After vendor bill draft, PO BILLED — Committed Spend ZIG ${zigMid.toFixed(2)} → ${zigEnd.toFixed(2)} (drop ${drop.toFixed(2)})\n`
  );
  console.log('PASS — commitment accounting UAT\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
