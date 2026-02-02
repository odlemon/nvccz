// @ts-nocheck
import { Request, Response } from "express";
import { PortfolioDashboardService, PortfolioDashboardParams } from "../services/PortfolioDashboardService";

export class PortfolioDashboardController {
  /**
   * Get portfolio dashboard data
   */
  static async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const {
        fundId,
        currencyId,
        asOfDate,
        year
      } = req.query;

      const params: PortfolioDashboardParams = {
        fundId: fundId as string,
        currencyId: currencyId as string,
        asOfDate: asOfDate ? new Date(asOfDate as string) : undefined,
        year: year ? parseInt(year as string) : undefined
      };

      const dashboardData = await PortfolioDashboardService.getDashboardData(params);

      res.json({
        success: true,
        message: "Portfolio dashboard data retrieved successfully",
        data: dashboardData
      });
    } catch (error: any) {
      console.error("Error getting portfolio dashboard:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get portfolio dashboard",
        details: error.message
      });
    }
  }
}
