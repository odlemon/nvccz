// @ts-nocheck
import { Request, Response } from "express";
import IncomeStatementService, { IncomeStatementParams } from "../services/IncomeStatementService";

export class IncomeStatementController {
  /**
   * Generate income statement for a specific period
   */
  static async generateIncomeStatement(req: Request, res: Response) {
    try {
      const { startDate, endDate, currencyId } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "Start date and end date are required"
        });
      }

      const params: IncomeStatementParams = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        currencyId
      };

      const incomeStatement = await IncomeStatementService.generateIncomeStatement(params);

      return res.status(200).json({
        success: true,
        message: "Income statement generated successfully",
        data: incomeStatement
      });
    } catch (error) {
      console.error("Error in generateIncomeStatement:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to generate income statement",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Get detailed income statement with transaction breakdown
   */
  static async getDetailedIncomeStatement(req: Request, res: Response) {
    try {
      const { startDate, endDate, currencyId } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "Start date and end date are required"
        });
      }

      const params: IncomeStatementParams = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        currencyId
      };

      const detailedIncomeStatement = await IncomeStatementService.getDetailedIncomeStatement(params);

      return res.status(200).json({
        success: true,
        message: "Detailed income statement retrieved successfully",
        data: detailedIncomeStatement
      });
    } catch (error) {
      console.error("Error in getDetailedIncomeStatement:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get detailed income statement",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Get income statement summary (high-level totals)
   */
  static async getIncomeStatementSummary(req: Request, res: Response) {
    try {
      const { startDate, endDate, currencyId } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "Start date and end date are required"
        });
      }

      const params: IncomeStatementParams = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        currencyId
      };

      const summary = await IncomeStatementService.getIncomeStatementSummary(params);

      return res.status(200).json({
        success: true,
        message: "Income statement summary retrieved successfully",
        data: summary
      });
    } catch (error) {
      console.error("Error in getIncomeStatementSummary:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get income statement summary",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Get comparative income statement for multiple periods
   */
  static async getComparativeIncomeStatement(req: Request, res: Response) {
    try {
      const { periods } = req.body;

      if (!periods || !Array.isArray(periods) || periods.length < 2) {
        return res.status(400).json({
          success: false,
          message: "At least two periods are required for comparative analysis"
        });
      }

      // Validate each period has required fields
      for (const period of periods) {
        if (!period.startDate || !period.endDate) {
          return res.status(400).json({
            success: false,
            message: "Each period must have startDate and endDate"
          });
        }
      }

      const periodParams: IncomeStatementParams[] = periods.map(period => ({
        startDate: new Date(period.startDate),
        endDate: new Date(period.endDate),
        currencyId: period.currencyId
      }));

      const comparativeData = await IncomeStatementService.getComparativeIncomeStatement(periodParams);

      return res.status(200).json({
        success: true,
        message: "Comparative income statement retrieved successfully",
        data: comparativeData
      });
    } catch (error) {
      console.error("Error in getComparativeIncomeStatement:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get comparative income statement",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Get comprehensive detailed income statement with all transaction details
   */
  static async getComprehensiveDetailedIncomeStatement(req: Request, res: Response) {
    try {
      const { startDate, endDate, currencyId } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "Start date and end date are required"
        });
      }

      const params: IncomeStatementParams = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        currencyId
      };

      const comprehensiveIncomeStatement = await IncomeStatementService.getComprehensiveDetailedIncomeStatement(params);

      return res.status(200).json({
        success: true,
        message: "Comprehensive detailed income statement retrieved successfully",
        data: comprehensiveIncomeStatement
      });
    } catch (error) {
      console.error("Error in getComprehensiveDetailedIncomeStatement:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get comprehensive detailed income statement",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Get income statement by query parameters (for GET requests)
   */
  static async getIncomeStatementByQuery(req: Request, res: Response) {
    try {
      const { startDate, endDate, currencyId, type = "summary" } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "Start date and end date are required"
        });
      }

      const params: IncomeStatementParams = {
        startDate: new Date(startDate as string),
        endDate: new Date(endDate as string),
        currencyId: currencyId as string
      };

      let result;
      switch (type) {
        case "summary":
          result = await IncomeStatementService.getIncomeStatementSummary(params);
          break;
        case "detailed":
          result = await IncomeStatementService.getDetailedIncomeStatement(params);
          break;
        default:
          result = await IncomeStatementService.generateIncomeStatement(params);
          break;
      }

      return res.status(200).json({
        success: true,
        message: "Income statement retrieved successfully",
        data: result
      });
    } catch (error) {
      console.error("Error in getIncomeStatementByQuery:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get income statement",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Get vertical income statement with traditional format
   */
  static async getVerticalIncomeStatement(req: Request, res: Response) {
    try {
      const { startDate, endDate, currencyId } = req.body;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "Start date and end date are required"
        });
      }

      const params: IncomeStatementParams = {
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        currencyId
      };

      const verticalIncomeStatement = await IncomeStatementService.getVerticalIncomeStatement(params);

      return res.status(200).json({
        success: true,
        message: "Vertical income statement retrieved successfully",
        data: verticalIncomeStatement
      });
    } catch (error) {
      console.error("Error in getVerticalIncomeStatement:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get vertical income statement",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
}

export default IncomeStatementController; 