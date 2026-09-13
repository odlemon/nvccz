import { Request, Response } from "express";
import { ProcurementRequisitionApprovalService } from "../services/ProcurementRequisitionApprovalService";

/**
 * The requisition approval matrix behind Procurement → Configuration → Approval matrix.
 *
 * Every member of staff may read it: a requester is entitled to know who will decide their requisition. Only an
 * administrator or the CFO may change it (enforced in the service, which says so in the refusal).
 */
export class ProcurementApprovalMatrixController {
  static async getMatrix(req: Request, res: Response) {
    try {
      const data = await ProcurementRequisitionApprovalService.matrix((req as any).user);
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
      const data = await ProcurementRequisitionApprovalService.saveMatrix((req as any).user, req.body);
      return res.json({ success: true, message: "Approval matrix saved", data });
    } catch (error: any) {
      console.error("Error saving the approval matrix:", error);
      return res.status(error?.status || 500).json({
        success: false,
        message: error?.status ? error.message : "Failed to save the approval matrix",
      });
    }
  }
}
