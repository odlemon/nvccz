// @ts-nocheck
import { Request, Response } from "express";
import { BalanceSheetService } from "../services/BalanceSheetService";

function hideZeroBalancesFromQuery(req: Request): boolean {
  const q = req.query.hideZeroBalances;
  const v = Array.isArray(q) ? q[0] : q;
  return v === "true" || v === "1" || v === true;
}

export class BalanceSheetController {
  /**
   * Generate balance sheet as of a specific date
   */
  static async generateBalanceSheet(req: Request, res: Response) {
    try {
      const { asOfDate, currencyId, startDate, endDate } = req.body;
      const hideZero = hideZeroBalancesFromQuery(req);

      // Validate required parameters
      if (!asOfDate && !endDate) {
        return res.status(400).json({
          success: false,
          message: "asOfDate or endDate is required"
        });
      }

      // Parse dates
      const parsedAsOfDate = asOfDate ? new Date(asOfDate) : new Date(endDate);
      if (isNaN(parsedAsOfDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid asOfDate format. Use YYYY-MM-DD"
        });
      }

      let parsedStartDate: Date | undefined;
      let parsedEndDate: Date | undefined;
      
      if (startDate && endDate) {
        parsedStartDate = new Date(startDate);
        parsedEndDate = new Date(endDate);
        if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid startDate or endDate format. Use YYYY-MM-DD"
          });
        }
      }

      // Generate balance sheet
      const balanceSheet = await BalanceSheetService.generateBalanceSheet({
        asOfDate: parsedAsOfDate,
        currencyId,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        hideZeroBalances: hideZero
      });

      res.status(200).json({
        success: true,
        message: "Balance sheet generated successfully",
        data: balanceSheet
      });
    } catch (error: any) {
      console.error("Error generating balance sheet:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to generate balance sheet"
      });
    }
  }

  /**
   * Get balance sheet by query parameters
   */
  static async getBalanceSheetByQuery(req: Request, res: Response) {
    try {
      const { asOfDate, currencyId, startDate, endDate } = req.query;
      const hideZero = hideZeroBalancesFromQuery(req);

      // Validate required parameters
      if (!asOfDate && !endDate) {
        return res.status(400).json({
          success: false,
          message: "asOfDate or endDate query parameter is required"
        });
      }

      // Parse dates
      const parsedAsOfDate = asOfDate ? new Date(asOfDate as string) : new Date(endDate as string);
      if (isNaN(parsedAsOfDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid asOfDate format. Use YYYY-MM-DD"
        });
      }

      let parsedStartDate: Date | undefined;
      let parsedEndDate: Date | undefined;
      
      if (startDate && endDate) {
        parsedStartDate = new Date(startDate as string);
        parsedEndDate = new Date(endDate as string);
        if (isNaN(parsedStartDate.getTime()) || isNaN(parsedEndDate.getTime())) {
          return res.status(400).json({
            success: false,
            message: "Invalid startDate or endDate format. Use YYYY-MM-DD"
          });
        }
      }

      // Generate balance sheet
      const balanceSheet = await BalanceSheetService.generateBalanceSheet({
        asOfDate: parsedAsOfDate,
        currencyId: currencyId as string,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        hideZeroBalances: hideZero
      });

      res.status(200).json({
        success: true,
        message: "Balance sheet retrieved successfully",
        data: balanceSheet
      });
    } catch (error: any) {
      console.error("Error retrieving balance sheet:", error);
      res.status(500).json({
        success: false,
        message: error.message || "Failed to retrieve balance sheet"
      });
    }
  }
}


