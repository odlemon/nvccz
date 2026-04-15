// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import { ProcurementRfqService } from "../services/ProcurementRfqService";

export class PublicProcurementController {
  /** Suite 03.10 — public tender listing (minimal fields). */
  static async listPublicRfqs(_req: Request, res: Response) {
    try {
      const data = await ProcurementRfqService.listPublicOpen();
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  /** Suite 04.5 — vendor acknowledges PO via one-time token (no JWT). */
  static async acknowledgePurchaseOrder(req: Request, res: Response) {
    try {
      const { token } = req.params;
      const po = await prisma.purchaseOrder.findFirst({
        where: { vendorAckToken: token },
      });
      if (!po) {
        return res.status(404).json({ success: false, message: "Invalid or expired link" });
      }
      await prisma.purchaseOrder.update({
        where: { id: po.id },
        data: { vendorAcknowledgedAt: new Date() },
      });
      res.json({
        success: true,
        message: "Purchase order acknowledged. Thank you.",
        data: { poNumber: po.poNumber, acknowledgedAt: new Date().toISOString() },
      });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }
}
