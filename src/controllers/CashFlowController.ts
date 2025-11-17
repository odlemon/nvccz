// @ts-nocheck
import { Request, Response } from "express";
import CashFlowService from "../services/CashFlowService";
import { CashFlowParams } from "../services/cashflow/types";
import { extractPeriodFilter, periodFilterToDateRange } from "../utils/periodFilterHelper";

export class CashFlowController {
  /**
   * Generate cash flow statement for a specific period
   * Supports period filters (month/quarter/year) via URL query parameters OR legacy date range in request body
   */
  static async generateCashFlowStatement(req: Request, res: Response) {
    try {
      // Try to extract period filter first
      const periodFilter = extractPeriodFilter(req);
      
      let params: CashFlowParams;
      
      if (periodFilter) {
        // Use period filter (month/quarter/year)
        const dateRange = periodFilterToDateRange(periodFilter);
        params = {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          currencyId: dateRange.currencyId
        };
      } else {
        // Fallback to legacy date range format
        const { startDate, endDate, currencyId } = req.body;
        
        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            message: "Either period filter (periodType + periodValue in URL) or date range (startDate + endDate) is required"
          });
        }

        params = {
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          currencyId
        };
      }

      const cashFlowStatement = await CashFlowService.generateCashFlowStatement(params);

      return res.status(200).json({
        success: true,
        message: "Cash flow statement generated successfully",
        data: cashFlowStatement
      });
    } catch (error) {
      console.error("Error in generateCashFlowStatement:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to generate cash flow statement",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Get detailed cash flow statement with transaction breakdown
   * Supports period filters (month/quarter/year) via URL query parameters OR legacy date range in request body
   */
  static async getDetailedCashFlowStatement(req: Request, res: Response) {
    try {
      // Try to extract period filter first
      const periodFilter = extractPeriodFilter(req);
      
      let params: CashFlowParams;
      
      if (periodFilter) {
        // Use period filter (month/quarter/year)
        const dateRange = periodFilterToDateRange(periodFilter);
        params = {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          currencyId: dateRange.currencyId
        };
      } else {
        // Fallback to legacy date range format
        const { startDate, endDate, currencyId } = req.body;
        
        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            message: "Either period filter (periodType + periodValue in URL) or date range (startDate + endDate) is required"
          });
        }

        params = {
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          currencyId
        };
      }

      const detailedCashFlowStatement = await CashFlowService.getDetailedCashFlowStatement(params);

      return res.status(200).json({
        success: true,
        message: "Detailed cash flow statement retrieved successfully",
        data: detailedCashFlowStatement
      });
    } catch (error) {
      console.error("Error in getDetailedCashFlowStatement:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get detailed cash flow statement",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Get cash flow statement summary (high-level totals)
   * Supports period filters (month/quarter/year) via URL query parameters OR legacy date range in request body
   */
  static async getCashFlowStatementSummary(req: Request, res: Response) {
    try {
      // Try to extract period filter first
      const periodFilter = extractPeriodFilter(req);
      
      let params: CashFlowParams;
      
      if (periodFilter) {
        // Use period filter (month/quarter/year)
        const dateRange = periodFilterToDateRange(periodFilter);
        params = {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          currencyId: dateRange.currencyId
        };
      } else {
        // Fallback to legacy date range format
        const { startDate, endDate, currencyId } = req.body;
        
        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            message: "Either period filter (periodType + periodValue in URL) or date range (startDate + endDate) is required"
          });
        }

        params = {
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          currencyId
        };
      }

      const summary = await CashFlowService.getCashFlowStatementSummary(params);

      return res.status(200).json({
        success: true,
        message: "Cash flow statement summary retrieved successfully",
        data: summary
      });
    } catch (error) {
      console.error("Error in getCashFlowStatementSummary:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get cash flow statement summary",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Get comparative cash flow statement for multiple periods
   */
  static async getComparativeCashFlowStatement(req: Request, res: Response) {
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

      const periodParams: CashFlowParams[] = periods.map(period => ({
        startDate: new Date(period.startDate),
        endDate: new Date(period.endDate),
        currencyId: period.currencyId
      }));

      const comparativeData = await CashFlowService.getComparativeCashFlowStatement(periodParams);

      return res.status(200).json({
        success: true,
        message: "Comparative cash flow statement retrieved successfully",
        data: comparativeData
      });
    } catch (error) {
      console.error("Error in getComparativeCashFlowStatement:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get comparative cash flow statement",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Get comprehensive detailed cash flow statement with all transaction details
   * Supports period filters (month/quarter/year) via URL query parameters OR legacy date range in request body
   */
  static async getComprehensiveDetailedCashFlowStatement(req: Request, res: Response) {
    try {
      // Try to extract period filter first
      const periodFilter = extractPeriodFilter(req);
      
      let params: CashFlowParams;
      
      if (periodFilter) {
        // Use period filter (month/quarter/year)
        const dateRange = periodFilterToDateRange(periodFilter);
        params = {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          currencyId: dateRange.currencyId
        };
      } else {
        // Fallback to legacy date range format
        const { startDate, endDate, currencyId } = req.body;
        
        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            message: "Either period filter (periodType + periodValue in URL) or date range (startDate + endDate) is required"
          });
        }

        params = {
          startDate: new Date(startDate),
          endDate: new Date(endDate),
          currencyId
        };
      }

      const comprehensiveCashFlowStatement = await CashFlowService.getComprehensiveDetailedCashFlowStatement(params);

      return res.status(200).json({
        success: true,
        message: "Comprehensive detailed cash flow statement retrieved successfully",
        data: comprehensiveCashFlowStatement
      });
    } catch (error) {
      console.error("Error in getComprehensiveDetailedCashFlowStatement:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get comprehensive detailed cash flow statement",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Get cash flow statement by query parameters (for GET requests)
   * Supports period filters (month/quarter/year) via URL query parameters OR legacy date range
   */
  static async getCashFlowStatementByQuery(req: Request, res: Response) {
    try {
      // Try to extract period filter first
      const periodFilter = extractPeriodFilter(req);
      
      let params: CashFlowParams;
      
      if (periodFilter) {
        // Use period filter (month/quarter/year)
        const dateRange = periodFilterToDateRange(periodFilter);
        params = {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          currencyId: dateRange.currencyId
        };
      } else {
        // Fallback to legacy date range format
        const { startDate, endDate, currencyId } = req.query;

        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            message: "Either period filter (periodType + periodValue) or date range (startDate + endDate) is required"
          });
        }

        params = {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string),
          currencyId: currencyId as string
        };
      }

      const { type = "summary" } = req.query;
      let result;
      switch (type) {
        case "detailed":
          result = await CashFlowService.getDetailedCashFlowStatement(params);
          break;
        case "comprehensive":
          result = await CashFlowService.getComprehensiveDetailedCashFlowStatement(params);
          break;
        case "summary":
        default:
          result = await CashFlowService.getCashFlowStatementSummary(params);
          break;
      }

      return res.status(200).json({
        success: true,
        message: "Cash flow statement retrieved successfully",
        data: result
      });
    } catch (error) {
      console.error("Error in getCashFlowStatementByQuery:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get cash flow statement",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }
}

export default CashFlowController; 