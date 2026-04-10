//@ts-nocheck
import { Request, Response, NextFunction } from "express";
import { CapitalCallService } from "../services/CapitalCallService";

function parseDateOnly(raw: unknown, field: string): Date {
  if (raw == null || raw === "") throw new Error(`${field} is required`);
  const d = raw instanceof Date ? raw : new Date(String(raw));
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid ${field}`);
  return d;
}

export class CapitalCallController {
  static async initiate(req: Request, res: Response, next: NextFunction) {
    try {
      const { fundId } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

      const { callPercent, paymentDueDate, bankInstructions, transactionDate } = req.body || {};
      if (bankInstructions == null || String(bankInstructions).trim() === "") {
        return res.status(400).json({ success: false, message: "bankInstructions is required" });
      }

      const data = await CapitalCallService.initiate({
        fundId,
        callPercent,
        paymentDueDate: parseDateOnly(paymentDueDate, "paymentDueDate"),
        bankInstructions: String(bankInstructions),
        transactionDate: parseDateOnly(transactionDate, "transactionDate"),
        createdById: userId,
      });

      return res.status(201).json({
        success: true,
        message: "Capital call initiated; journal entry posted (Dr 1210 / Cr 3010).",
        data,
      });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Error" });
    }
  }

  static async list(req: Request, res: Response) {
    try {
      const { fundId } = req.params;
      const data = await CapitalCallService.listForFund(fundId);
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Error" });
    }
  }

  static async getOne(req: Request, res: Response) {
    try {
      const { fundId, capitalCallId } = req.params;
      const data = await CapitalCallService.getById(fundId, capitalCallId);
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(404).json({ success: false, message: e?.message || "Not found" });
    }
  }

  static async lpSummary(req: Request, res: Response) {
    try {
      const { fundId } = req.params;
      const data = await CapitalCallService.fundLpDashboardSummary(fundId);
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Error" });
    }
  }

  /** JSON for apps / print; email includes a server-generated PDF with the same fields. */
  static async getNoticeData(req: Request, res: Response) {
    try {
      const { fundId, capitalCallId, allocationId } = req.params;
      const data = await CapitalCallService.getNoticeDataForFrontend(fundId, capitalCallId, allocationId);
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(404).json({ success: false, message: e?.message || "Not found" });
    }
  }

  static async sendNotices(req: Request, res: Response) {
    try {
      const { fundId, capitalCallId } = req.params;
      const data = await CapitalCallService.sendNotices(fundId, capitalCallId);
      return res.json({
        success: true,
        message:
          "Notices sent: HTML + PDF attachment per LP (subject: Capital Call Notice , {fund} , {date}).",
        data,
      });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Error" });
    }
  }

  static async recordPayment(req: Request, res: Response) {
    try {
      const { fundId, capitalCallId, allocationId } = req.params;
      const { amount } = req.body || {};
      if (amount == null) {
        return res.status(400).json({ success: false, message: "amount is required" });
      }
      const data = await CapitalCallService.recordAllocationPayment({
        fundId,
        capitalCallId,
        allocationId,
        amount,
      });
      return res.json({
        success: true,
        message:
          "Payment recorded. Use GET .../allocations/:allocationId/payments for this allocation's ledger, GET .../lp-summary for fund dashboard.",
        data,
      });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e?.message || "Error" });
    }
  }

  static async listAllocationPayments(req: Request, res: Response) {
    try {
      const { fundId, capitalCallId, allocationId } = req.params;
      const data = await CapitalCallService.listAllocationPayments(fundId, capitalCallId, allocationId);
      return res.json({ success: true, data });
    } catch (e: any) {
      return res.status(404).json({ success: false, message: e?.message || "Not found" });
    }
  }
}
