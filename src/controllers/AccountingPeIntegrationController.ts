// @ts-nocheck
import { Request, Response } from "express";
import { PortfolioDashboardService } from "../services/PortfolioDashboardService";

export class AccountingPeIntegrationController {
  /**
   * GET /api/accounting/v1/pe/portfolio-irr — weighted fund gross IRR for performance sync (6 dp).
   */
  static async getPortfolioIrr(req: Request, res: Response): Promise<void> {
    try {
      const fundId = req.query.fundId as string | undefined;
      const { irr, precisionDigits, fundCount } =
        await PortfolioDashboardService.getWeightedFundGrossIrrSixDecimals({
          fundId: fundId || undefined
        });

      res.json({
        success: true,
        message: "Portfolio IRR retrieved for integration",
        data: {
          metrics: {
            irr,
            fundGrossIRR: irr,
            precisionDigits,
            fundCount
          }
        },
        generatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Error getting portfolio IRR for PE integration:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get portfolio IRR",
        details: error?.message
      });
    }
  }

  /**
   * GET /api/accounting/v1/pe/portfolio-total-revenue — aggregated TOTAL_REVENUE from portfolio company KPIs.
   */
  static async getPortfolioTotalRevenue(req: Request, res: Response): Promise<void> {
    try {
      const fundId = req.query.fundId as string | undefined;
      const data = await PortfolioDashboardService.getAggregatedPortfolioTotalRevenue({
        fundId: fundId || undefined
      });

      res.json({
        success: true,
        message: "Portfolio total revenue retrieved for integration",
        data: {
          metrics: {
            totalRevenue: data.totalRevenue,
            companyCount: data.companyCount,
            companiesWithRevenue: data.companiesWithRevenue
          }
        },
        generatedAt: new Date().toISOString()
      });
    } catch (error: any) {
      console.error("Error getting portfolio total revenue for PE integration:", error);
      res.status(500).json({
        success: false,
        error: "Failed to get portfolio total revenue",
        details: error?.message
      });
    }
  }
}
