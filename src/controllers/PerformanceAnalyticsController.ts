// @ts-nocheck
import { Request, Response } from "express";
import { PerformanceAnalyticsService } from "../services/PerformanceAnalyticsService";
import { ResponseHelper } from "../utils/responseHelper";

export class PerformanceAnalyticsController {
  /**
   * Get KPI performance analysis
   */
  static async getKPIAnalysis(req: Request, res: Response) {
    try {
      const { kpiId, department, startDate, endDate } = req.query;

      const dateRange = startDate && endDate ? {
        start: new Date(startDate as string),
        end: new Date(endDate as string)
      } : undefined;

      const analysis = await PerformanceAnalyticsService.getKPIAnalysis(
        kpiId as string,
        department as string,
        dateRange
      );

      return ResponseHelper.success(res, "KPI analysis retrieved successfully", analysis);
    } catch (error: any) {
      console.error("Error getting KPI analysis:", error);
      return ResponseHelper.error(res, error.message || "Failed to get KPI analysis", undefined, 500);
    }
  }

  /**
   * Get performance dashboard data
   */
  static async getPerformanceDashboard(req: Request, res: Response) {
    try {
      const dashboard = await PerformanceAnalyticsService.getPerformanceDashboard();

      return ResponseHelper.success(res, "Performance dashboard retrieved successfully", dashboard);
    } catch (error: any) {
      console.error("Error getting performance dashboard:", error);
      return ResponseHelper.error(res, error.message || "Failed to get performance dashboard", undefined, 500);
    }
  }

  /**
   * Get goal progress reports
   */
  static async getGoalProgressReports(req: Request, res: Response) {
    try {
      const { type, department, stage, startDate, endDate } = req.query;

      const filters: any = {};
      
      if (type) filters.type = type as string;
      if (department) filters.department = department as string;
      if (stage) filters.stage = stage as string;
      
      if (startDate && endDate) {
        filters.dateRange = {
          start: new Date(startDate as string),
          end: new Date(endDate as string)
        };
      }

      const reports = await PerformanceAnalyticsService.getGoalProgressReports(filters);

      return ResponseHelper.success(res, "Goal progress reports retrieved successfully", reports);
    } catch (error: any) {
      console.error("Error getting goal progress reports:", error);
      return ResponseHelper.error(res, error.message || "Failed to get goal progress reports", undefined, 500);
    }
  }

  /**
   * Get department performance comparison
   */
  static async getDepartmentComparison(req: Request, res: Response) {
    try {
      const comparison = await PerformanceAnalyticsService.getDepartmentComparison();

      return ResponseHelper.success(res, "Department comparison retrieved successfully", comparison);
    } catch (error: any) {
      console.error("Error getting department comparison:", error);
      return ResponseHelper.error(res, error.message || "Failed to get department comparison", undefined, 500);
    }
  }
}
