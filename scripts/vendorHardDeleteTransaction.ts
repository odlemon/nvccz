import type { Prisma } from "@prisma/client";

/**
 * Hard-delete one vendor and clear / remove common blocking relations.
 * Shared by `delete-vendor-by-email.ts` and `delete-vendor-by-id.ts`.
 */
export async function runVendorHardDeleteInTx(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.employee.updateMany({
    where: { reimbursementVendorId: id },
    data: { reimbursementVendorId: null },
  });

  await tx.purchaseRequisitionItem.updateMany({
    where: { preferredVendorId: id },
    data: { preferredVendorId: null },
  });

  await tx.cashbookEntry.updateMany({ where: { vendorId: id }, data: { vendorId: null } });
  await tx.invoice.updateMany({ where: { vendorId: id }, data: { vendorId: null } });
  await tx.rfqClarification.updateMany({ where: { vendorId: id }, data: { vendorId: null } });

  await tx.inventoryItem.updateMany({
    where: { supplierId: id },
    data: { supplierId: null },
  });

  await tx.vendorInvoiceFieldCorrection.deleteMany({ where: { vendorId: id } });
  await tx.vendorInvoiceIntake.deleteMany({ where: { vendorId: id } });

  const purchaseInvoices = await tx.purchaseInvoice.findMany({
    where: { vendorId: id },
    select: { id: true },
  });
  for (const bill of purchaseInvoices) {
    await tx.purchaseInvoicePayment.deleteMany({ where: { purchaseInvoiceId: bill.id } });
    await tx.purchaseInvoiceItem.deleteMany({ where: { invoiceId: bill.id } });
  }
  await tx.purchaseInvoice.deleteMany({ where: { vendorId: id } });

  const procInvoices = await tx.procurementInvoice.findMany({
    where: { vendorId: id },
    select: { id: true },
  });
  const procInvoiceIds = procInvoices.map((x) => x.id);
  if (procInvoiceIds.length) {
    await tx.vendorQuotation.updateMany({
      where: { invoiceId: { in: procInvoiceIds } },
      data: { invoiceId: null },
    });
  }
  for (const inv of procInvoices) {
    await tx.procurementInvoiceItem.deleteMany({ where: { invoiceId: inv.id } });
  }
  await tx.procurementInvoice.deleteMany({ where: { vendorId: id } });

  const pos = await tx.purchaseOrder.findMany({
    where: { vendorId: id },
    select: { id: true },
  });
  await tx.purchaseOrder.updateMany({
    where: { vendorId: id },
    data: { quotationId: null },
  });

  for (const po of pos) {
    const grns = await tx.goodsReceivedNote.findMany({
      where: { purchaseOrderId: po.id },
      select: { id: true },
    });
    for (const grn of grns) {
      await tx.grnReturnToVendor.deleteMany({ where: { goodsReceivedNoteId: grn.id } });
      await tx.goodsReceivedNoteItem.deleteMany({ where: { grnId: grn.id } });
      await tx.purchaseInvoice.updateMany({
        where: { sourceGoodsReceivedNoteId: grn.id },
        data: { sourceGoodsReceivedNoteId: null },
      });
    }
    await tx.goodsReceivedNote.deleteMany({ where: { purchaseOrderId: po.id } });
    await tx.vendorInvoiceIntake.updateMany({
      where: { sourcePurchaseOrderId: po.id },
      data: { sourcePurchaseOrderId: null },
    });
    await tx.purchaseInvoice.updateMany({
      where: { sourcePurchaseOrderId: po.id },
      data: { sourcePurchaseOrderId: null },
    });
    await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: po.id } });
    await tx.purchaseOrder.delete({ where: { id: po.id } });
  }

  await tx.rfqVendorInvitation.deleteMany({ where: { vendorId: id } });

  await tx.expense.deleteMany({ where: { vendorId: id } });

  const stmts = await tx.statementOfAccount.findMany({
    where: { vendorId: id },
    select: { id: true },
  });
  for (const s of stmts) {
    await tx.statementItem.deleteMany({ where: { statementId: s.id } });
  }
  await tx.statementOfAccount.deleteMany({ where: { vendorId: id } });

  await tx.discountConfig.deleteMany({
    where: { entityType: "SUPPLIER", entityId: id },
  });

  await tx.vendorKycDocument.deleteMany({ where: { vendorId: id } });
  await tx.vendorBank.deleteMany({ where: { vendorId: id } });

  await tx.vendor.delete({ where: { id } });
}
