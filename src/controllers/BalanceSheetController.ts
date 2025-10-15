// @ts-nocheck
import { Request, Response } from "express";
import { BalanceSheetService } from "../services/BalanceSheetService";

export class BalanceSheetController {
  /**
   * Generate balance sheet as of a specific date
   */
  static async generateBalanceSheet(req: Request, res: Response) {
    try {
      const { asOfDate, currencyId } = req.body;

      // Validate required parameters
      if (!asOfDate) {
        return res.status(400).json({
          success: false,
          message: "asOfDate is required"
        });
      }

      // Parse date
      const parsedDate = new Date(asOfDate);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid asOfDate format. Use YYYY-MM-DD"
        });
      }

      // Generate balance sheet
      const balanceSheet = await BalanceSheetService.generateBalanceSheet({
        asOfDate: parsedDate,
        currencyId
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
      const { asOfDate, currencyId } = req.query;

      // Validate required parameters
      if (!asOfDate) {
        return res.status(400).json({
          success: false,
          message: "asOfDate query parameter is required"
        });
      }

      // Parse date
      const parsedDate = new Date(asOfDate as string);
      if (isNaN(parsedDate.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid asOfDate format. Use YYYY-MM-DD"
        });
      }

      // Generate balance sheet
      const balanceSheet = await BalanceSheetService.generateBalanceSheet({
        asOfDate: parsedDate,
        currencyId: currencyId as string
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


