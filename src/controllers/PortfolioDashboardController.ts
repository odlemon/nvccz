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
        portfolioCompanyId,
        currencyId,
        asOfDate,
        year,
        scope,
        search,
        q,
      } = req.query;

      const sid = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
      const searchRaw = sid(search) || sid(q);
      const params: PortfolioDashboardParams = {
        fundId: sid(fundId),
        portfolioCompanyId: sid(portfolioCompanyId),
        currencyId: sid(currencyId),
        asOfDate: asOfDate ? new Date(asOfDate as string) : undefined,
        year: year ? parseInt(year as string, 10) : undefined,
        scope:
          String(scope || "").toLowerCase() === "aum" ? "aum" : "full",
        search: searchRaw,
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

  /**
   * KPI time series for trend charts (from portfolio_company.financialKpis.kpiValues).
   */
  static async getKpiTimeSeries(req: Request, res: Response): Promise<void> {
    try {
      const { fundId, portfolioCompanyId, metrics } = req.query;
      const metricsKeys =
        typeof metrics === "string" && metrics.trim()
          ? metrics.split(",").map((k) => k.trim()).filter(Boolean)
          : undefined;

      const data = await PortfolioDashboardService.getKpiTimeSeries({
        fundId: fundId as string | undefined,
        portfolioCompanyId: portfolioCompanyId as string | undefined,
        metricsKeys,
      });

      res.json({
        success: true,
        message: "KPI time series retrieved successfully",
        data,
      });
    } catch (error: any) {
      console.error("Error getting KPI time series:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get KPI time series",
        details: error.message,
      });
    }
  }

  /**
   * Same as getDashboard but portfolioCompanyId is taken from the path (optional convenience).
   */
  static async getDashboardForCompany(req: Request, res: Response): Promise<void> {
    try {
      const { portfolioCompanyId } = req.params;
      const { fundId, currencyId, asOfDate, year, scope, search, q } = req.query;

      const sid = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
      const searchRaw = sid(search) || sid(q);
      const params: PortfolioDashboardParams = {
        fundId: sid(fundId),
        portfolioCompanyId: sid(portfolioCompanyId),
        currencyId: sid(currencyId),
        asOfDate: asOfDate ? new Date(asOfDate as string) : undefined,
        year: year ? parseInt(year as string, 10) : undefined,
        scope:
          String(scope || "").toLowerCase() === "aum" ? "aum" : "full",
        search: searchRaw,
      };

      const dashboardData = await PortfolioDashboardService.getDashboardData(params);

      res.json({
        success: true,
        message: "Portfolio dashboard data retrieved successfully",
        data: dashboardData,
      });
    } catch (error: any) {
      console.error("Error getting portfolio dashboard:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get portfolio dashboard",
        details: error.message,
      });
    }
  }
}
