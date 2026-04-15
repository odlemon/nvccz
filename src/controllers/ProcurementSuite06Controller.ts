// @ts-nocheck
import { Request, Response } from "express";
import { VendorInvoiceIntakeService } from "../services/VendorInvoiceIntakeService";
import { ThreeWayMatchService } from "../services/ThreeWayMatchService";

export class ProcurementSuite06Controller {
  static async createIntake(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { documentUrl, vendorId, sourcePurchaseOrderId, goodsReceivedNoteId } = req.body;
      if (!documentUrl || !vendorId) {
        return res.status(400).json({ success: false, message: "documentUrl and vendorId are required" });
      }
      const data = await VendorInvoiceIntakeService.createIntake({
        documentUrl,
        vendorId,
        sourcePurchaseOrderId,
        goodsReceivedNoteId,
        createdById: userId,
      });
      res.status(201).json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async getIntake(req: Request, res: Response) {
    try {
      const data = await VendorInvoiceIntakeService.getIntakeById(req.params.id);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(e.message === "Intake not found" ? 404 : 400).json({
        success: false,
        message: e.message,
      });
    }
  }

  static async runExtract(req: Request, res: Response) {
    try {
      const data = await VendorInvoiceIntakeService.runExtraction(req.params.id);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async verifyIntake(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const data = await VendorInvoiceIntakeService.markIntakeVerified(req.params.id, userId);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async upsertFieldCorrection(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { vendorId, fieldKey, correctedValue } = req.body;
      if (!vendorId || !fieldKey || correctedValue === undefined) {
        return res.status(400).json({ success: false, message: "vendorId, fieldKey, correctedValue required" });
      }
      const data = await VendorInvoiceIntakeService.applyFieldCorrection({
        vendorId,
        fieldKey,
        correctedValue: String(correctedValue),
        createdById: userId,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async createDraftBill(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const data = await VendorInvoiceIntakeService.createDraftBillFromIntake({
        intakeId: req.params.id,
        createdById: userId,
      });
      res.status(201).json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async runThreeWayMatch(req: Request, res: Response) {
    try {
      const data = await ThreeWayMatchService.runMatch(req.params.purchaseInvoiceId);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async verificationQueue(req: Request, res: Response) {
    try {
      const take = Math.min(100, Math.max(1, Number(req.query.take) || 50));
      const data = await VendorInvoiceIntakeService.listVerificationQueue(take);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async cfoDashboard(req: Request, res: Response) {
    try {
      const data = await VendorInvoiceIntakeService.getCfoDashboardSummary();
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }
}
