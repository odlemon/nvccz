// @ts-nocheck
import { Request, Response } from "express";
import VATReportService from "../services/VATReportService";
import { ResponseHelper } from "../utils/responseHelper";

export class VATReportController {
  /**
   * Generate VAT/Tax Report for a quarter
   * GET /api/vat/report?startDate=2025-01-01&endDate=2025-03-31&currencyId=...
   */
  static async generateVATReport(req: Request, res: Response) {
    try {
      const { startDate, endDate, currencyId } = req.query;

      if (!startDate || !endDate) {
        return ResponseHelper.badRequest(
          res,
          "Start date and end date are required (format: YYYY-MM-DD)"
        );
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return ResponseHelper.badRequest(res, "Invalid date format. Use YYYY-MM-DD");
      }

      if (start > end) {
        return ResponseHelper.badRequest(res, "Start date must be before end date");
      }

      const report = await VATReportService.generateVATReport({
        startDate: start,
        endDate: end,
        currencyId: currencyId as string | undefined
      });

      return ResponseHelper.success(res, "VAT report generated successfully", report);
    } catch (error: any) {
      console.error("Error generating VAT report:", error);
      return ResponseHelper.error(res, "Failed to generate VAT report", error.message);
    }
  }
}

export default VATReportController;

