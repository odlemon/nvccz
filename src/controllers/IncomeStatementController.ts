// @ts-nocheck
import { Request, Response } from "express";
import IncomeStatementService, { IncomeStatementParams } from "../services/IncomeStatementService";
import { extractPeriodFilter, periodFilterToDateRange, PeriodFilter } from "../utils/periodFilterHelper";
import { ConsolidatedReportService } from "../services/ConsolidatedReportService";
import { parseDate } from "../utils/dateHelper";

export class IncomeStatementController {
  /**
   * Generate income statement for a specific period
   * Supports period filters: { periodType: 'month'|'quarter'|'year', periodValue: '2025-01'|'2025-Q1'|'2025' }
   * Or legacy date range: { startDate, endDate }
   */
  static async generateIncomeStatement(req: Request, res: Response) {
    try {
      // Try to extract period filter first
      const periodFilter = extractPeriodFilter(req);
      
      let params: IncomeStatementParams;
      
      if (periodFilter) {
        // Use period filter (month/quarter/year)
        const dateRange = periodFilterToDateRange(periodFilter);
        params = {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          currencyId: dateRange.currencyId
        };
      } else {
        // Fallback to legacy date range format (from body for POST, from query for GET)
        const startDate = req.body?.startDate || req.query?.startDate;
        const endDate = req.body?.endDate || req.query?.endDate;
        const currencyId = req.body?.currencyId || req.query?.currencyId;
        
        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            message: "Either period filter (periodType + periodValue in URL) or date range (startDate + endDate) is required"
          });
        }

        params = {
          startDate: parseDate(startDate),
          endDate: parseDate(endDate),
          currencyId
        };
      }

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
   * Generate P&L with budget vs actual variance (for highlighting over-spend in red / showing % over-spend).
   * Same params as generateIncomeStatement; operating expense lines include budgetVariance when a budget exists.
   */
  static async getIncomeStatementWithBudgetVariance(req: Request, res: Response) {
    try {
      const periodFilter = extractPeriodFilter(req);
      let params: IncomeStatementParams;
      if (periodFilter) {
        const dateRange = periodFilterToDateRange(periodFilter);
        params = { startDate: dateRange.startDate, endDate: dateRange.endDate, currencyId: dateRange.currencyId };
      } else {
        const startDate = req.body?.startDate || req.query?.startDate;
        const endDate = req.body?.endDate || req.query?.endDate;
        const currencyId = req.body?.currencyId || req.query?.currencyId;
        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            message: "Either period filter (periodType + periodValue) or date range (startDate + endDate) is required"
          });
        }
        params = { startDate: parseDate(startDate), endDate: parseDate(endDate), currencyId };
      }
      const incomeStatement = await IncomeStatementService.generateIncomeStatementWithBudgetVariance(params);
      return res.status(200).json({
        success: true,
        message: "Income statement with budget variance retrieved successfully",
        data: incomeStatement
      });
    } catch (error) {
      console.error("Error in getIncomeStatementWithBudgetVariance:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to generate income statement with budget variance",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Get detailed income statement with transaction breakdown
   * Supports period filters: { periodType: 'month'|'quarter'|'year', periodValue: '2025-01'|'2025-Q1'|'2025' }
   * Or legacy date range: { startDate, endDate }
   */
  static async getDetailedIncomeStatement(req: Request, res: Response) {
    try {
      // Try to extract period filter first
      const periodFilter = extractPeriodFilter(req);
      
      let params: IncomeStatementParams;
      
      if (periodFilter) {
        // Use period filter (month/quarter/year)
        const dateRange = periodFilterToDateRange(periodFilter);
        params = {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          currencyId: dateRange.currencyId
        };
      } else {
        // Fallback to legacy date range format (from body for POST, from query for GET)
        const startDate = req.body?.startDate || req.query?.startDate;
        const endDate = req.body?.endDate || req.query?.endDate;
        const currencyId = req.body?.currencyId || req.query?.currencyId;
        
        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            message: "Either period filter (periodType + periodValue in URL) or date range (startDate + endDate) is required"
          });
        }

        params = {
          startDate: parseDate(startDate),
          endDate: parseDate(endDate),
          currencyId
        };
      }

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
   * Supports period filters: { periodType: 'month'|'quarter'|'year', periodValue: '2025-01'|'2025-Q1'|'2025' }
   * Or legacy date range: { startDate, endDate }
   */
  static async getIncomeStatementSummary(req: Request, res: Response) {
    try {
      // Try to extract period filter first
      const periodFilter = extractPeriodFilter(req);
      
      let params: IncomeStatementParams;
      
      if (periodFilter) {
        // Use period filter (month/quarter/year)
        const dateRange = periodFilterToDateRange(periodFilter);
        params = {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          currencyId: dateRange.currencyId
        };
      } else {
        // Fallback to legacy date range format (from body for POST, from query for GET)
        const startDate = req.body?.startDate || req.query?.startDate;
        const endDate = req.body?.endDate || req.query?.endDate;
        const currencyId = req.body?.currencyId || req.query?.currencyId;
        
        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            message: "Either period filter (periodType + periodValue in URL) or date range (startDate + endDate) is required"
          });
        }

        params = {
          startDate: parseDate(startDate),
          endDate: parseDate(endDate),
          currencyId
        };
      }

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
        startDate: parseDate(period.startDate),
        endDate: parseDate(period.endDate),
        currencyId: period.currencyId
      }));

      const labels = req.body.periodLabels as string[] | undefined;
      const comparativeData = await IncomeStatementService.getComparativeIncomeStatement(periodParams, labels);

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
   * Get P&L comparing "This Month" vs "Last Month" with two columns and variance (dollar and percentage change).
   * GET /api/accounting/income-statement/comparative/this-month-vs-last-month?currencyId=optional
   * Optional query: asOfDate=YYYY-MM-DD to use a reference date (default: today).
   */
  static async getComparativeThisMonthVsLastMonth(req: Request, res: Response) {
    try {
      const asOf = (req.query.asOfDate as string) || new Date().toISOString().split("T")[0];
      const ref = parseDate(asOf);
      if (isNaN(ref.getTime())) {
        return res.status(400).json({
          success: false,
          message: "Invalid asOfDate. Use YYYY-MM-DD."
        });
      }
      const currencyId = req.query.currencyId as string | undefined;

      const thisMonthStart = new Date(ref.getFullYear(), ref.getMonth(), 1, 0, 0, 0, 0);
      const thisMonthEnd = new Date(ref.getFullYear(), ref.getMonth() + 1, 0, 23, 59, 59, 999);
      const lastMonthStart = new Date(ref.getFullYear(), ref.getMonth() - 1, 1, 0, 0, 0, 0);
      const lastMonthEnd = new Date(ref.getFullYear(), ref.getMonth(), 0, 23, 59, 59, 999);

      const periods: IncomeStatementParams[] = [
        { startDate: lastMonthStart, endDate: lastMonthEnd, currencyId },
        { startDate: thisMonthStart, endDate: thisMonthEnd, currencyId }
      ];
      const comparativeData = await IncomeStatementService.getComparativeIncomeStatement(
        periods,
        ["Last Month", "This Month"]
      );

      return res.status(200).json({
        success: true,
        message: "Comparative income statement (This Month vs Last Month) retrieved successfully",
        data: comparativeData
      });
    } catch (error) {
      console.error("Error in getComparativeThisMonthVsLastMonth:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to get comparative income statement",
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  /**
   * Get comprehensive detailed income statement with all transaction details
   * Supports period filters: { periodType: 'month'|'quarter'|'year', periodValue: '2025-01'|'2025-Q1'|'2025' }
   * Or legacy date range: { startDate, endDate }
   */
  static async getComprehensiveDetailedIncomeStatement(req: Request, res: Response) {
    try {
      // Try to extract period filter first
      const periodFilter = extractPeriodFilter(req);
      
      let params: IncomeStatementParams;
      
      if (periodFilter) {
        // Use period filter (month/quarter/year)
        const dateRange = periodFilterToDateRange(periodFilter);
        params = {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          currencyId: dateRange.currencyId
        };
      } else {
        // Fallback to legacy date range format (from body for POST, from query for GET)
        const startDate = req.body?.startDate || req.query?.startDate;
        const endDate = req.body?.endDate || req.query?.endDate;
        const currencyId = req.body?.currencyId || req.query?.currencyId;
        
        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            message: "Either period filter (periodType + periodValue in URL) or date range (startDate + endDate) is required"
          });
        }

        params = {
          startDate: parseDate(startDate),
          endDate: parseDate(endDate),
          currencyId
        };
      }

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
   * Supports period filters: ?periodType=month&periodValue=2025-01
   * Or legacy date range: ?startDate=2025-01-01&endDate=2025-01-31
   */
  static async getIncomeStatementByQuery(req: Request, res: Response) {
    try {
      // Try to extract period filter first
      const periodFilter = extractPeriodFilter(req);
      
      let params: IncomeStatementParams;
      
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
          startDate: parseDate(startDate as string),
          endDate: parseDate(endDate as string),
          currencyId: currencyId as string
        };
      }

      const { type } = req.query;
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
   * Supports period filters: { periodType: 'month'|'quarter'|'year', periodValue: '2025-01'|'2025-Q1'|'2025' }
   * Or legacy date range: { startDate, endDate }
   */
  static async getVerticalIncomeStatement(req: Request, res: Response) {
    try {
      // Try to extract period filter first
      const periodFilter = extractPeriodFilter(req);
      
      let params: IncomeStatementParams;
      
      if (periodFilter) {
        // Use period filter (month/quarter/year)
        const dateRange = periodFilterToDateRange(periodFilter);
        params = {
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          currencyId: dateRange.currencyId
        };
      } else {
        // Fallback to legacy date range format (from body for POST, from query for GET)
        const startDate = req.body?.startDate || req.query?.startDate;
        const endDate = req.body?.endDate || req.query?.endDate;
        const currencyId = req.body?.currencyId || req.query?.currencyId;
        
        if (!startDate || !endDate) {
          return res.status(400).json({
            success: false,
            message: "Either period filter (periodType + periodValue in URL) or date range (startDate + endDate) is required"
          });
        }

        params = {
          startDate: parseDate(startDate),
          endDate: parseDate(endDate),
          currencyId
        };
      }

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
  /**
   * Generate consolidated income statement — all currencies converted to a single target currency.
   * Supports period filters (?periodType=month&periodValue=2025-01) or legacy date range (body/query).
   */
  static async generateConsolidatedIncomeStatement(req: Request, res: Response) {
    try {
      const periodFilter = extractPeriodFilter(req);
      let startDate: any;
      let endDate: any;

      if (periodFilter) {
        const dateRange = periodFilterToDateRange(periodFilter);
        startDate = dateRange.startDate;
        endDate = dateRange.endDate;
      } else {
        startDate = req.body?.startDate || req.query?.startDate;
        endDate = req.body?.endDate || req.query?.endDate;
      }

      const consolidationCurrencyId = req.body?.consolidationCurrencyId || req.query?.consolidationCurrencyId;

      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: "Either period filter (periodType + periodValue in URL) or date range (startDate + endDate) is required",
        });
      }
      if (!consolidationCurrencyId) {
        return res.status(400).json({ success: false, message: "consolidationCurrencyId is required" });
      }

      const data = await ConsolidatedReportService.generateConsolidatedIncomeStatement({
        startDate: parseDate(startDate),
        endDate: parseDate(endDate),
        consolidationCurrencyId,
      });

      return res.status(200).json({
        success: true,
        message: "Consolidated income statement generated successfully",
        data,
      });
    } catch (error) {
      console.error("Error in generateConsolidatedIncomeStatement:", error);
      return res.status(500).json({
        success: false,
        message: "Failed to generate consolidated income statement",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
}

export default IncomeStatementController; 