// @ts-nocheck
import { Request, Response } from "express";
import {
  PerformanceDashboardService,
  type PerformanceDashboardParams
} from "../services/PerformanceDashboardService";

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

      let monthParam: PerformanceDashboardParams["month"];
      if (month === undefined || month === "") {
        monthParam = undefined;
      } else if (String(month).toLowerCase() === "all") {
        monthParam = "all";
      } else {
        const parsed = parseInt(month as string, 10);
        monthParam = Number.isFinite(parsed) && parsed >= 1 && parsed <= 12 ? parsed : undefined;
      }

      const params: PerformanceDashboardParams = {
        month: monthParam,
        year: year ? parseInt(year as string, 10) : undefined
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
