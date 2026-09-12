/**
 * Reset a vendor quotation to SUBMITTED so staff can accept/reject again.
 * Unlinks or removes a PO created from accept (no GRNs on that PO).
 *
 *   npx ts-node scripts/reset-vendor-quotation-to-submitted.ts QUO_20260514_0001
 *   QUOTATION_NUMBER=QUO_20260514_0001 npm run db:reset:vendor-quotation-submitted
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const quotationNumber =
    process.argv[2]?.trim() ||
    process.env.QUOTATION_NUMBER?.trim() ||
    "";
  if (!quotationNumber) {
    throw new Error("Pass quotation number as argv or set QUOTATION_NUMBER.");
  }

  const quotation = await prisma.vendorQuotation.findUnique({
    where: { quotationNumber },
    include: {
      purchaseOrder: {
        include: {
          goodsReceivedNotes: { select: { id: true, grnNumber: true } },
          invoices: { select: { id: true, invoiceNumber: true, status: true } },
        },
      },
      invoice: { select: { id: true, invoiceNumber: true, status: true } },
    },
  });

  if (!quotation) {
    console.log(`[skip] No vendor_quotation with number ${quotationNumber}`);
    return;
  }

  console.log(`Found ${quotation.quotationNumber} id=${quotation.id} status=${quotation.status}`);

  const po = quotation.purchaseOrder;
  if (po?.goodsReceivedNotes?.length) {
    throw new Error(
      `PO ${po.poNumber} has ${po.goodsReceivedNotes.length} GRN(s); cannot reset quotation safely.`
    );
  }

  const result = await prisma.$transaction(async (tx) => {
    const actions: string[] = [];

    const invoiceIds = new Set<string>();
    if (quotation.invoiceId) invoiceIds.add(quotation.invoiceId);
    if (quotation.invoice?.id) invoiceIds.add(quotation.invoice.id);

    const invoicesByQuotation = await tx.procurementInvoice.findMany({
      where: { quotationId: quotation.id },
      select: { id: true, invoiceNumber: true, status: true },
    });
    for (const inv of invoicesByQuotation) invoiceIds.add(inv.id);

    if (po?.invoices?.length) {
      for (const inv of po.invoices) invoiceIds.add(inv.id);
    }

    for (const invoiceId of invoiceIds) {
      const inv = await tx.procurementInvoice.findUnique({
        where: { id: invoiceId },
        select: { id: true, invoiceNumber: true, status: true, journalEntryId: true },
      });
      if (!inv) continue;
      if (inv.journalEntryId) {
        throw new Error(
          `Procurement invoice ${inv.invoiceNumber} is posted (journal ${inv.journalEntryId}); aborting.`
        );
      }
      await tx.procurementInvoiceItem.deleteMany({ where: { invoiceId: inv.id } });
      await tx.procurementInvoice.delete({ where: { id: inv.id } });
      actions.push(`deleted procurement invoice ${inv.invoiceNumber}`);
    }

    if (po) {
      await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
      await tx.purchaseOrder.delete({ where: { id: po.id } });
      actions.push(`deleted PO ${po.poNumber}`);
    }

    const rfqUpdates = await tx.procurementRfq.updateMany({
      where: { awardedQuotationId: quotation.id },
      data: { awardedQuotationId: null, awardRationale: null },
    });
    if (rfqUpdates.count > 0) {
      actions.push(`cleared awardedQuotationId on ${rfqUpdates.count} RFQ row(s)`);
    }

    const updated = await tx.vendorQuotation.update({
      where: { id: quotation.id },
      data: {
        status: "SUBMITTED",
        reviewedById: null,
        reviewedAt: null,
        reviewNotes: null,
        rejectionReason: null,
        rejectionContentFingerprint: null,
        invoiceId: null,
      },
      select: { quotationNumber: true, status: true, submittedAt: true },
    });
    actions.push(`quotation → SUBMITTED`);

    return { updated, actions };
  });

  console.log("[ok]", result.updated.quotationNumber, "status=", result.updated.status);
  for (const line of result.actions) console.log("  -", line);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
