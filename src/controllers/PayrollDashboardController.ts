// @ts-nocheck
import { Request, Response } from "express";
import { PayrollDashboardService, PayrollDashboardParams } from "../services/PayrollDashboardService";

export class PayrollDashboardController {
  /**
   * Get payroll dashboard data
   */
  static async getDashboard(req: Request, res: Response): Promise<void> {
    try {
      const {
        month,
        year,
        currencyId
      } = req.query;

      const params: PayrollDashboardParams = {
        month: month ? parseInt(month as string) : undefined,
        year: year ? parseInt(year as string) : undefined,
        currencyId: currencyId as string
      };

      const dashboardData = await PayrollDashboardService.getDashboardData(params);

      res.json({
        success: true,
        message: "Payroll dashboard data retrieved successfully",
        data: dashboardData
      });
    } catch (error: any) {
      console.error("Error getting payroll dashboard:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get payroll dashboard",
        details: error.message
      });
    }
  }
}
