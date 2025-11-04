// @ts-nocheck
import { Request, Response } from "express";
import GLLedgerDetailService from "../services/GLLedgerDetailService";
import { ResponseHelper } from "../utils/responseHelper";

export class GLLedgerDetailController {
  /**
   * Generate General Ledger Detail Report with Running Balance
   * GET /api/accounting/gl-ledger-detail?accountNo=1100&startDate=2025-01-01&endDate=2025-12-31&currencyId=...
   */
  static async generateGLLedgerDetail(req: Request, res: Response) {
    try {
      const { accountNo, startDate, endDate, currencyId, includeMultiCurrency } = req.query;

      if (!accountNo) {
        return ResponseHelper.badRequest(res, "Account number (accountNo) is required");
      }

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

      // Parse includeMultiCurrency (defaults to true if not provided)
      const includeMultiCurrencyFlag = includeMultiCurrency === 'false' ? false : true;

      const report = await GLLedgerDetailService.generateGLLedgerDetail({
        accountNo: accountNo as string,
        startDate: start,
        endDate: end,
        currencyId: currencyId as string | undefined,
        includeMultiCurrency: includeMultiCurrencyFlag
      });

      return ResponseHelper.success(res, "GL Detail report generated successfully", report);
    } catch (error: any) {
      console.error("Error generating GL Detail report:", error);
      return ResponseHelper.error(res, "Failed to generate GL Detail report", error.message);
    }
  }
}

export default GLLedgerDetailController;

