// @ts-nocheck
/**
 * Cleanup procurement module data and related accounting.
 * Deletes: Purchase Requisitions, Purchase Orders, Procurement Invoices,
 * GRNs, Vendor Quotation links; and their JEs + cashbook entries.
 * Run: npx ts-node scripts/cleanup-procurement-module-data.ts
 *
 * Phase 1: Report counts (check)
 * Phase 2: Delete in safe order so accounting stays consistent
 * Phase 3: Optionally run accounting equation check
 */
import { prisma } from '../src/utils/database';
import { BalanceSheetService } from '../src/services/BalanceSheetService';

async function deleteJournalEntry(jeId: string) {
  await prisma.journalEntryLine.deleteMany({ where: { journalEntryId: jeId } }).catch(() => null);
  await prisma.journalEntry.delete({ where: { id: jeId } }).catch(() => null);
}

async function report() {
  const [reqs, reqItems, pos, poItems, procInvs, procItems, grns, grnItems, quotes] = await Promise.all([
    prisma.purchaseRequisition.count(),
    prisma.purchaseRequisitionItem.count(),
    prisma.purchaseOrder.count(),
    prisma.purchaseOrderItem.count(),
    prisma.procurementInvoice.count(),
    prisma.procurementInvoiceItem.count(),
    prisma.goodsReceivedNote.count(),
    prisma.goodsReceivedNoteItem.count(),
    prisma.vendorQuotation.count()
  ]);

  let procWithJe = 0;
  let procWithCashbook = '-';
  try {
    procWithJe = await prisma.procurementInvoice.count({ where: { journalEntryId: { not: null } } });
    procWithCashbook = String(await prisma.procurementInvoice.count({ where: { cashbookEntryId: { not: null } } }));
  } catch {
    procWithCashbook = 'n/a (no cashbook_entry_id column)';
  }

  console.log('--- Procurement module (current counts) ---');
  console.log('  Purchase requisitions:        ', reqs);
  console.log('  Purchase requisition items:     ', reqItems);
  console.log('  Purchase orders:               ', pos);
  console.log('  Purchase order items:           ', poItems);
  console.log('  Procurement invoices:          ', procInvs, `(${procWithJe} with JE, ${procWithCashbook} with cashbook)`);
  console.log('  Procurement invoice items:    ', procItems);
  console.log('  Goods received notes:         ', grns);
  console.log('  GRN items:                    ', grnItems);
  console.log('  Vendor quotations:            ', quotes);
  console.log('');
}

async function cleanup() {
  let totalDeleted = 0;

  // ----- 1. Unlink VendorQuotation from procurement invoices and POs -----
  console.log('--- Unlinking vendor quotations ---');
  const procInvoices = await prisma.procurementInvoice.findMany({ select: { id: true } });
  const procIds = procInvoices.map((p) => p.id);
  const poAll = await prisma.purchaseOrder.findMany({ select: { id: true } });
  const poIds = poAll.map((p) => p.id);

  if (procIds.length > 0) {
    const u1 = await prisma.vendorQuotation.updateMany({
      where: { invoiceId: { in: procIds } },
      data: { invoiceId: null }
    });
    if (u1.count > 0) console.log('  Cleared invoiceId on', u1.count, 'quotation(s)');
  }
  if (poIds.length > 0) {
    const u2 = await prisma.vendorQuotation.updateMany({
      where: { purchaseOrderId: { in: poIds } },
      data: { purchaseOrderId: null }
    }).catch(() => ({ count: 0 }));
    if (u2.count > 0) console.log('  Cleared purchaseOrderId on', u2.count, 'quotation(s)');
  }

  // ----- 2. Procurement invoices: accounting then invoice records -----
  console.log('\n--- Procurement invoices + GL + cashbook ---');
  type ProcInv = { id: string; journalEntryId: string | null; cashbookEntry?: { id: string; journalEntryId: string | null } | null };
  let allProc: ProcInv[];
  try {
    allProc = await prisma.procurementInvoice.findMany({
      include: { cashbookEntry: true, journalEntry: true }
    }) as ProcInv[];
  } catch {
    allProc = await prisma.procurementInvoice.findMany({
      select: { id: true, journalEntryId: true }
    }) as ProcInv[];
  }

  for (const inv of allProc) {
    try {
      await prisma.procurementInvoice.update({
        where: { id: inv.id },
        data: { journalEntryId: null, cashbookEntryId: null }
      }).catch(() => null);
    } catch {
      await prisma.procurementInvoice.update({
        where: { id: inv.id },
        data: { journalEntryId: null }
      }).catch(() => null);
    }

    const cashEntry = inv.cashbookEntry;
    if (cashEntry) {
      const payJeId = cashEntry.journalEntryId;
      await prisma.cashbookEntry.update({
        where: { id: cashEntry.id },
        data: { journalEntryId: null }
      }).catch(() => null);
      if (payJeId) await deleteJournalEntry(payJeId);
      await prisma.cashbookEntry.delete({ where: { id: cashEntry.id } }).catch(() => null);
      totalDeleted++;
    }
    if (inv.journalEntryId) {
      await deleteJournalEntry(inv.journalEntryId);
      totalDeleted++;
    }
    await prisma.procurementInvoiceItem.deleteMany({ where: { invoiceId: inv.id } }).catch(() => null);
    await prisma.procurementInvoice.delete({ where: { id: inv.id } }).catch(() => null);
    totalDeleted++;
  }
  console.log('  Deleted', allProc.length, 'procurement invoice(s) and related JE/cashbook');

  // ----- 3. GRN items then GRNs -----
  console.log('\n--- Goods received notes ---');
  const allGrns = poIds.length > 0
    ? await prisma.goodsReceivedNote.findMany({
        where: { purchaseOrderId: { in: poIds } },
        select: { id: true }
      })
    : [];
  const grnIds = allGrns.map((g) => g.id);
  if (grnIds.length > 0) {
    const dGi = await prisma.goodsReceivedNoteItem.deleteMany({ where: { grnId: { in: grnIds } } });
    const dGrn = await prisma.goodsReceivedNote.deleteMany({ where: { id: { in: grnIds } } });
    console.log('  Deleted', dGi.count, 'GRN item(s),', dGrn.count, 'GRN(s)');
    totalDeleted += dGi.count + dGrn.count;
  } else {
    console.log('  No GRNs to delete');
  }

  // ----- 4. Purchase order items (cascade when deleting PO) and purchase orders -----
  console.log('\n--- Purchase orders ---');
  for (const poId of poIds) {
    await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: poId } }).catch(() => null);
    await prisma.purchaseOrder.delete({ where: { id: poId } }).catch(() => null);
    totalDeleted++;
  }
  console.log('  Deleted', poIds.length, 'purchase order(s)');

  // ----- 5. Purchase requisitions (items cascade) -----
  console.log('\n--- Purchase requisitions ---');
  const reqList = await prisma.purchaseRequisition.findMany({ select: { id: true } });
  for (const r of reqList) {
    await prisma.purchaseRequisitionItem.deleteMany({ where: { requisitionId: r.id } }).catch(() => null);
    await prisma.purchaseRequisition.delete({ where: { id: r.id } }).catch(() => null);
    totalDeleted++;
  }
  console.log('  Deleted', reqList.length, 'purchase requisition(s)');

  return totalDeleted;
}

async function main() {
  console.log('========== Procurement module cleanup ==========\n');

  await report();

  console.log('--- Starting cleanup ---\n');
  const deleted = await cleanup();

  console.log('\n--- Counts after cleanup ---');
  await report();

  console.log('========== Accounting check (Balance Sheet equation) ==========');
  const asOfDate = new Date();
  asOfDate.setHours(23, 59, 59, 999);
  const data = await BalanceSheetService.generateBalanceSheet({
    asOfDate,
    startDate: new Date(0),
    endDate: asOfDate
  });
  const totalAssets = data.assets.totalAssets;
  const totalLiabilities = data.liabilities.totalLiabilities;
  const totalEquity = data.equity.total;
  const diff = totalAssets - totalLiabilities - totalEquity;
  const balanced = Math.abs(diff) < 0.02;
  console.log('\n  sum(Assets)      =', totalAssets.toFixed(2));
  console.log('  sum(Liabilities) =', totalLiabilities.toFixed(2));
  console.log('  sum(Equity)      =', totalEquity.toFixed(2));
  console.log('  Assets - L - E   =', diff.toFixed(2), balanced ? '(OK)' : '(IMBALANCE)');
  if (!balanced) {
    console.log('\n  WARNING: Equation not balanced after cleanup. Review GL.');
    process.exitCode = 1;
  } else {
    console.log('\n  Accounting equation maintained.');
  }

  console.log('\n========== Done ==========');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
