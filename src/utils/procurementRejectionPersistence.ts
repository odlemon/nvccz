import {
  computeGoodsReceivedNoteRejectionFingerprint,
  computeProcurementInvoiceRejectionFingerprint,
  computePurchaseOrderRejectionFingerprint,
} from "./procurementEntityRejectionFingerprint";
import { computePurchaseRequisitionContentFingerprint } from "./purchaseRequisitionContentFingerprint";

/**
 * Persists REJECTED status, rejectionReason, and content fingerprint on procurement entities
 * when an approval workflow rejects (shared by ApprovalService + ProcurementApprovalConfigService).
 */
export async function persistProcurementEntityRejection(
  db: any,
  stageType: string,
  entityId: string,
  reason: string
): Promise<void> {
  switch (stageType) {
    case "PURCHASE_REQUISITION": {
      const pr = await db.purchaseRequisition.findUnique({
        where: { id: entityId },
        include: { items: true },
      });
      const fingerprint = pr ? computePurchaseRequisitionContentFingerprint(pr) : null;
      await db.purchaseRequisition.update({
        where: { id: entityId },
        data: {
          status: "REJECTED",
          rejectionReason: reason,
          ...(fingerprint ? { rejectionContentFingerprint: fingerprint } : {}),
        },
      });
      break;
    }

    case "PURCHASE_ORDER": {
      const po = await db.purchaseOrder.findUnique({
        where: { id: entityId },
        include: { items: true },
      });
      const fingerprint = po ? computePurchaseOrderRejectionFingerprint(po) : null;
      await db.purchaseOrder.update({
        where: { id: entityId },
        data: {
          status: "REJECTED",
          rejectionReason: reason,
          ...(fingerprint ? { rejectionContentFingerprint: fingerprint } : {}),
        },
      });
      break;
    }

    case "INVOICE": {
      const inv = await db.procurementInvoice.findUnique({
        where: { id: entityId },
        include: { items: true },
      });
      const invFp = inv ? computeProcurementInvoiceRejectionFingerprint(inv) : null;
      await db.procurementInvoice.update({
        where: { id: entityId },
        data: {
          status: "REJECTED",
          rejectionReason: reason,
          ...(invFp ? { rejectionContentFingerprint: invFp } : {}),
        },
      });
      break;
    }

    case "GRN": {
      const grn = await db.goodsReceivedNote.findUnique({
        where: { id: entityId },
        include: { items: true },
      });
      const grnFp = grn ? computeGoodsReceivedNoteRejectionFingerprint(grn) : null;
      await db.goodsReceivedNote.update({
        where: { id: entityId },
        data: {
          status: "REJECTED",
          rejectionReason: reason,
          ...(grnFp ? { rejectionContentFingerprint: grnFp } : {}),
        },
      });
      break;
    }

    default:
      break;
  }
}
