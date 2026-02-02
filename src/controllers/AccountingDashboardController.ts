// @ts-nocheck
import { Request, Response } from "express";
import { AccountingDashboardService, DashboardParams } from "../services/AccountingDashboardService";

export class AccountingDashboardController {
  /**
   * Get accounting dashboard data
   */
  static async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const {
        period = 'YTD',
        benchmark = 'LAST_YEAR',
        startDate,
        endDate,
        currencyId,
        entityId,
        financialYear,
        months
      } = req.query;

      const params: DashboardParams = {
        period: period as 'MTD' | 'YTD',
        benchmark: benchmark as 'LAST_MONTH' | 'LAST_YEAR',
        currencyId: currencyId as string,
        entityId: entityId as string,
        financialYear: financialYear as string,
        months: months ? (Array.isArray(months) ? months as string[] : [months as string]) : undefined
      };

      if (startDate) {
        params.startDate = new Date(startDate as string);
      }

      if (endDate) {
        params.endDate = new Date(endDate as string);
      }

      const dashboardData = await AccountingDashboardService.getDashboardData(params);

      res.json({
        success: true,
        message: "Accounting dashboard data retrieved successfully",
        data: dashboardData
      });
    } catch (error: any) {
      console.error("Error getting accounting dashboard:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get accounting dashboard",
        details: error.message
      });
    }
  }
}
