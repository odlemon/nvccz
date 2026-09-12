// @ts-nocheck
import { Request, Response } from "express";
import { FundReportingLpService } from "../services/fundReporting/FundReportingLpService";

export class FundReportingLpController {
  static async getPortal(req: Request, res: Response) {
    try {
      const data = await FundReportingLpService.getPortal((req as any).user.id);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(e.statusCode || 400).json({ success: false, message: e.message });
    }
  }

  static async listReports(req: Request, res: Response) {
    try {
      const page = Number(req.query.page || 1);
      const limit = Number(req.query.limit || 20);
      const data = await FundReportingLpService.listReports((req as any).user.id, page, limit);
      res.json({ success: true, ...data });
    } catch (e: any) {
      res.status(e.statusCode || 400).json({ success: false, message: e.message });
    }
  }

  static async downloadReport(req: Request, res: Response) {
    try {
      const result = await FundReportingLpService.downloadOwnReport(
        (req as any).user.id,
        req.params.jobId
      );
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
      res.send(result.buffer);
    } catch (e: any) {
      res.status(e.statusCode || 400).json({ success: false, message: e.message });
    }
  }
}
