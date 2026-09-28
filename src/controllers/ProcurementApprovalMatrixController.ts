import { Request, Response } from "express";
import { ProcurementRequisitionApprovalService } from "../services/ProcurementRequisitionApprovalService";
import AuditService from "../services/AuditService";

/**
 * The requisition approval matrix behind Procurement → Configuration → Approval matrix.
 *
 * Every member of staff may read it: a requester is entitled to know who will decide their requisition. Only an
 * administrator or the CFO may change it (enforced in the service, which says so in the refusal).
 */
/** The route being read or edited: the requisition route by default, or the award recommendation route (?stage=AWARD_RECOMMENDATION). */
const stageOf = (req: Request) => {
  const s = String(req.query?.stage || "").toUpperCase();
  return s === "AWARD_RECOMMENDATION" || s === "PURCHASE_ORDER" ? s : "PURCHASE_REQUISITION";
};

export class ProcurementApprovalMatrixController {
  static async getMatrix(req: Request, res: Response) {
    try {
      const data = await ProcurementRequisitionApprovalService.matrix((req as any).user, stageOf(req));
      return res.json({ success: true, data });
    } catch (error: any) {
      console.error("Error loading the approval matrix:", error);
      return res.status(error?.status || 500).json({
        success: false,
        message: error?.status ? error.message : "Failed to load the approval matrix",
      });
    }
  }

  static async saveMatrix(req: Request, res: Response) {
    try {
      const before = await ProcurementRequisitionApprovalService.matrix((req as any).user, stageOf(req)).catch(() => null);
      const data = await ProcurementRequisitionApprovalService.saveMatrix((req as any).user, req.body, stageOf(req));
      await AuditService.log({ userId: (req as any).user?.id, action: "APPROVAL_MATRIX_UPDATE", entityType: "ApprovalMatrix", entityId: stageOf(req), oldValues: before, newValues: data, eventType: "WORKFLOW_CHANGE" });
      return res.json({ success: true, message: "Approval matrix saved", data });
    } catch (error: any) {
      console.error("Error saving the approval matrix:", error);
      return res.status(error?.status || 500).json({
        success: false,
        message: error?.status ? error.message : "Failed to save the approval matrix",
      });
    }
  }

  /** PUT /procurement/invoice-auto-approval {enabled, limit}: administrator or CFO. */
  static async saveInvoiceAutoApproval(req: Request, res: Response) {
    try {
      const { ProcurementInvoiceAutoApprovalService } = await import("../services/ProcurementInvoiceAutoApprovalService");
      const before = await ProcurementInvoiceAutoApprovalService.settings().catch(() => null);
      const data = await ProcurementInvoiceAutoApprovalService.saveSettings((req as any).user, req.body);
      await AuditService.log({ userId: (req as any).user?.id, action: "INVOICE_AUTO_APPROVAL_UPDATE", entityType: "ProcurementSettings", entityId: "invoice-auto-approval", oldValues: before, newValues: data, eventType: "WORKFLOW_CHANGE" });
      return res.json({
        success: true,
        message: data.enabled ? "Invoices that match exactly are approved automatically" : "Automatic invoice approval is off",
        data,
      });
    } catch (error: any) {
      console.error("Error saving automatic invoice approval:", error);
      return res.status(error?.status || 500).json({
        success: false,
        message: error?.status ? error.message : "Failed to save automatic invoice approval",
      });
    }
  }
}
