// @ts-nocheck
import { Request, Response } from "express";
import { PerformanceDashboardService, PerformanceDashboardParams } from "../services/PerformanceDashboardService";

export class PerformanceDashboardController {
  /**
   * Get performance dashboard data
   */
  static async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const {
        month,
        year
      } = req.query;

      const params: PerformanceDashboardParams = {
        month: month ? parseInt(month as string) : undefined,
        year: year ? parseInt(year as string) : undefined
      };

      const dashboardData = await PerformanceDashboardService.getDashboardData(params);

      res.json({
        success: true,
        message: "Performance dashboard data retrieved successfully",
        data: dashboardData
      });
    } catch (error: any) {
      console.error("Error getting performance dashboard:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get performance dashboard",
        details: error.message
      });
    }
  }
}
