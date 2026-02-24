// @ts-nocheck
/**
 * Cleanup all invoice test data: customer, purchase, procurement invoices,
 * their GL (journal entries + lines) and cashbook entries.
 * Run: npx ts-node scripts/cleanup-all-invoice-test-data.ts
 */
import { prisma } from '../src/utils/database';

async function deleteJournalEntry(jeId: string) {
  await prisma.journalEntryLine.deleteMany({ where: { journalEntryId: jeId } }).catch(() => null);
  await prisma.journalEntry.delete({ where: { id: jeId } }).catch(() => null);
}

async function main() {
  console.log('========== Cleanup: All invoice test data (GL + Cashbook) ==========\n');

  const admin = await prisma.user.findUnique({ where: { email: 'admin@nts.com' } });
  if (!admin) {
    console.log('Admin user not found. Exiting.');
    await prisma.$disconnect();
    return;
  }

  let totalDeleted = 0;

  // ---------- 1. Customer invoices: "Test sale", "Sale 2" ----------
  console.log('--- Customer invoices (Test sale, Sale 2) ---');
  const customerInvoices = await prisma.invoice.findMany({
    where: { description: { in: ['Test sale', 'Sale 2'] } },
    include: { journalEntry: true }
  });

  const processedCashbookIds = new Set<string>();
  for (const inv of customerInvoices) {
    const allocations = await prisma.paymentAllocation.findMany({
      where: { invoiceId: inv.id },
      include: { cashbookEntry: true }
    });

    for (const alloc of allocations) {
      const ce = alloc.cashbookEntry;
      if (ce && !processedCashbookIds.has(ce.id)) {
        processedCashbookIds.add(ce.id);
        if (ce.journalEntryId) {
          await prisma.cashbookEntry.update({
            where: { id: ce.id },
            data: { journalEntryId: null }
          }).catch(() => null);
          await deleteJournalEntry(ce.journalEntryId);
          console.log('  Deleted receipt/payment JE + cashbook entry:', ce.id);
          totalDeleted++;
        }
        await prisma.cashbookEntry.delete({ where: { id: ce.id } }).catch(() => null);
      }
    }
    await prisma.paymentAllocation.deleteMany({ where: { invoiceId: inv.id } });

    const saleJeId = inv.journalEntryId;
    await prisma.invoice.update({
      where: { id: inv.id },
      data: { journalEntryId: null }
    }).catch(() => null);
    if (saleJeId) {
      await deleteJournalEntry(saleJeId);
      console.log('  Deleted sale JE:', saleJeId);
      totalDeleted++;
    }
    await prisma.invoice.delete({ where: { id: inv.id } }).catch(() => null);
    console.log('  Deleted customer invoice:', inv.invoiceNumber || inv.id);
    totalDeleted++;
  }

  // Orphan payment JEs from markAsPaid (Payment JE not linked to cashbook, totalAmount 500)
  const usedJeIds = (await prisma.cashbookEntry.findMany({
    where: { journalEntryId: { not: null } },
    select: { journalEntryId: true }
  }))
    .map((c) => c.journalEntryId)
    .filter((id): id is string => id != null);
  const orphanPaymentJEs = await prisma.journalEntry.findMany({
    where: {
      description: { contains: 'Payment' },
      totalAmount: 500,
      createdById: admin.id,
      ...(usedJeIds.length > 0 ? { id: { notIn: usedJeIds } } : {})
    }
  });
  for (const je of orphanPaymentJEs) {
    await deleteJournalEntry(je.id);
    console.log('  Deleted orphan payment JE:', je.referenceNumber);
    totalDeleted++;
  }

  // ---------- 2. Purchase invoices: Test vendors, recent ----------
  console.log('\n--- Purchase invoices (test vendors, last 7 days) ---');
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const testVendors = await prisma.vendor.findMany({
    where: { name: { in: ['Test Event Vendor', 'Test Vendor PI'] } },
    select: { id: true }
  });
  const vendorIds = testVendors.map((v) => v.id);

  const purchaseInvoices = await prisma.purchaseInvoice.findMany({
    where: {
      vendorId: { in: vendorIds },
      createdAt: { gte: sevenDaysAgo }
    },
    include: { cashbookEntry: true, journalEntry: true }
  });

  for (const inv of purchaseInvoices) {
    await prisma.purchaseInvoice.update({
      where: { id: inv.id },
      data: { journalEntryId: null, cashbookEntryId: null }
    }).catch(() => null);

    if (inv.cashbookEntry) {
      const payJeId = inv.cashbookEntry.journalEntryId;
      await prisma.cashbookEntry.update({
        where: { id: inv.cashbookEntry.id },
        data: { journalEntryId: null }
      }).catch(() => null);
      if (payJeId) await deleteJournalEntry(payJeId);
      await prisma.cashbookEntry.delete({ where: { id: inv.cashbookEntry.id } }).catch(() => null);
      console.log('  Deleted purchase cashbook entry:', inv.cashbookEntry.id);
      totalDeleted++;
    }
    if (inv.journalEntryId) {
      await deleteJournalEntry(inv.journalEntryId);
      console.log('  Deleted purchase submit JE:', inv.journalEntryId);
      totalDeleted++;
    }
    await prisma.purchaseInvoiceItem.deleteMany({ where: { invoiceId: inv.id } }).catch(() => null);
    await prisma.purchaseInvoice.delete({ where: { id: inv.id } }).catch(() => null);
    console.log('  Deleted purchase invoice:', inv.invoiceNumber);
    totalDeleted++;
  }

  // ---------- 3. Procurement invoices: PROC-TEST-*, PROC-GL-* ----------
  console.log('\n--- Procurement invoices (PROC-TEST-*, PROC-GL-*) ---');
  const allProc = await prisma.procurementInvoice.findMany({
    where: {
      OR: [
        { invoiceNumber: { startsWith: 'PROC-TEST-' } },
        { invoiceNumber: { startsWith: 'PROC-GL-' } }
      ]
    },
    include: { cashbookEntry: true, journalEntry: true }
  });

  for (const inv of allProc) {
    await prisma.procurementInvoice.update({
      where: { id: inv.id },
      data: { cashbookEntryId: null, journalEntryId: null }
    }).catch(() => null);

    if (inv.cashbookEntry) {
      const payJeId = inv.cashbookEntry.journalEntryId;
      await prisma.cashbookEntry.update({
        where: { id: inv.cashbookEntry.id },
        data: { journalEntryId: null }
      }).catch(() => null);
      if (payJeId) await deleteJournalEntry(payJeId);
      await prisma.cashbookEntry.delete({ where: { id: inv.cashbookEntry.id } }).catch(() => null);
      console.log('  Deleted procurement cashbook entry:', inv.cashbookEntry.id);
      totalDeleted++;
    }
    if (inv.journalEntryId) {
      await deleteJournalEntry(inv.journalEntryId);
      console.log('  Deleted procurement expense JE:', inv.journalEntryId);
      totalDeleted++;
    }
    await prisma.procurementInvoiceItem.deleteMany({ where: { invoiceId: inv.id } }).catch(() => null);
    await prisma.procurementInvoice.delete({ where: { id: inv.id } }).catch(() => null);
    console.log('  Deleted procurement invoice:', inv.invoiceNumber);
    totalDeleted++;
  }

  console.log('\n========== Cleanup done ==========');
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
