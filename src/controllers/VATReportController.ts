// @ts-nocheck
import { Request, Response } from "express";
import VATReportService from "../services/VATReportService";
import AuditService from "../services/AuditService";
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
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);

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

      const userId = (req as any).user?.id;
      if (userId) {
        const ipAddress = (req as any).ip || (req as any).headers?.["x-forwarded-for"] || (req as any).socket?.remoteAddress || null;
        const userAgent = ((req as any).headers?.["user-agent"] as string) || null;
        await AuditService.log({
          userId,
          action: "REPORT_EXPORT",
          entityType: "VATReport",
          entityId: `VAT-${start.toISOString().slice(0, 10)}-${end.toISOString().slice(0, 10)}`,
          ipAddress: typeof ipAddress === "string" ? ipAddress : (Array.isArray(ipAddress) ? ipAddress[0] : String(ipAddress ?? "")),
          userAgent,
        });
      }

      return ResponseHelper.success(res, "VAT report generated successfully", report);
    } catch (error: any) {
      console.error("Error generating VAT report:", error);
      return ResponseHelper.error(res, "Failed to generate VAT report", error.message);
    }
  }

  /**
   * Get VAT Output audit trail: line-by-line list of every invoice/transaction that contributed to VAT Output.
   * GET /api/vat/report/output-tax-audit?startDate=2025-01-01&endDate=2025-03-31
   */
  static async getVATOutputAuditTrail(req: Request, res: Response) {
    try {
      const { startDate, endDate, currencyId } = req.query;

      if (!startDate || !endDate) {
        return ResponseHelper.badRequest(
          res,
          "Start date and end date are required (format: YYYY-MM-DD)"
        );
      }

      const start = new Date(startDate as string);
      start.setHours(0, 0, 0, 0);
      const end = new Date(endDate as string);
      end.setHours(23, 59, 59, 999);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return ResponseHelper.badRequest(res, "Invalid date format. Use YYYY-MM-DD");
      }

      if (start > end) {
        return ResponseHelper.badRequest(res, "Start date must be before end date");
      }

      const auditTrail = await VATReportService.getVATOutputAuditTrail({
        startDate: start,
        endDate: end,
        currencyId: currencyId as string | undefined
      });

      return ResponseHelper.success(
        res,
        "VAT Output audit trail retrieved successfully",
        auditTrail
      );
    } catch (error: any) {
      console.error("Error getting VAT Output audit trail:", error);
      return ResponseHelper.error(
        res,
        "Failed to get VAT Output audit trail",
        error.message
      );
    }
  }
}

export default VATReportController;

