// @ts-nocheck
import { Router } from "express";
import { PortfolioDashboardController } from "../controllers/PortfolioDashboardController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Dashboards
 *   description: Dashboard endpoints for comprehensive data visualization - Accounting, Payroll, Performance, and Portfolio Management dashboards with filtering capabilities
 */

/**
 * @swagger
 * /portfolio/dashboard:
 *   get:
 *     summary: Get portfolio management dashboard data
 *     description: |
 *       Metrics, performance overview, J curve, deal allocation, IRR by quarter, and portfolio summary.
 *       **`data.comparisonChart`** — per-company revenue growth rate, EBITDA margin, and net margin for side-by-side bar charts.
 *       **`data.netProfitWaterfall`** — bridge from prior to current net profit (revenue change + costs & other).
 *       **`data.portfolioComposition`** — AUM headline (realized/unrealized, #holdings), **value-weighted** `aumBySector` / `aumByAssetClass` / `aumByBusinessUnit`,
 *         diversification (HHI on AUM), YoY + CAGR + `historySeries`, utilization (deployment vs commitments), TVPI/DPI/MOIC/IRR/ROI,
 *         and placeholders for Sharpe/beta (`riskAdjustedReturns` + `note`).
 *       **`metrics.portfolioRoi`** — return on deployed capital vs total portfolio value.
 *       **`data.aumKpis`** — tile-ready holdings AUM, `totalCompanies`, `sectorDistribution` + `topSectors`, diversification score (HHI + 0–100),
 *         YoY + **YTD** growth, deployment %, IRR/TVPI/DPI/MOIC/ROI; explicitly excludes pipeline/request value and recent disbursement lists.
 *       **`data.portfolioComposition.diversification.diversificationScore0to100`** — inverse HHI on AUM sector weights.
 *     tags: [Dashboards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fundId
 *         schema:
 *           type: string
 *         description: Optional fund ID to filter by specific fund. If not provided, aggregates data across all funds.
 *       - in: query
 *         name: portfolioCompanyId
 *         schema:
 *           type: string
 *         description: Optional portfolio company ID — narrows portfolioSummary to that investee (fund context resolved from company if fundId omitted).
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Optional year filter for historical data (e.g., 2025). Filters J Curve and IRR by quarter data.
 *       - in: query
 *         name: currencyId
 *         schema:
 *           type: string
 *         description: Optional currency ID filter
 *       - in: query
 *         name: asOfDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Optional date for snapshot (ISO format: YYYY-MM-DD)
 *       - in: query
 *         name: scope
 *         schema:
 *           type: string
 *           enum: [full, aum]
 *         description: |
 *           `aum` — faster payload (no comparisonChart, netProfitWaterfall, analyst rollup; shorter `irrByQuarter`).
 *           Omitted or `full` — complete dashboard (IRR series capped at ~14 years for performance).
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Portfolio dashboard data retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     metrics:
 *                       type: object
 *                       properties:
 *                         totalInvested:
 *                           type: number
 *                           example: 234900000
 *                         availableForDrawdown:
 *                           type: number
 *                           example: 47500000
 *                         fundGrossIRR:
 *                           type: number
 *                           example: 16.32
 *                         lpNetIRR:
 *                           type: number
 *                           example: 11.47
 *                         tvpi:
 *                           type: number
 *                           example: 1.29
 *                     performanceOverview:
 *                       type: object
 *                       properties:
 *                         paidIn:
 *                           type: number
 *                           example: 350000000
 *                         totalInvestment:
 *                           type: number
 *                           example: 234900000
 *                         managementExpenses:
 *                           type: number
 *                           example: 5000000
 *                         otherExpenses:
 *                           type: number
 *                           example: 2000000
 *                         realizedProceedsAndIncome:
 *                           type: number
 *                           example: 70000000
 *                         fmvUnrealizedPortfolio:
 *                           type: number
 *                           example: 289690000
 *                     jCurve:
 *                       type: array
 *                       description: J Curve data showing contribution, distribution, and cumulative amount by year
 *                       items:
 *                         type: object
 *                         properties:
 *                           year:
 *                             type: number
 *                             example: 2025
 *                           contribution:
 *                             type: number
 *                             example: 50000000
 *                           distribution:
 *                             type: number
 *                             example: 10000000
 *                           cumulativeAmount:
 *                             type: number
 *                             example: -250000000
 *                     dealAllocation:
 *                       type: array
 *                       description: Deal allocation by sector with investment cost and percentage
 *                       items:
 *                         type: object
 *                         properties:
 *                           sector:
 *                             type: string
 *                             example: "Software & Services"
 *                           investmentCost:
 *                             type: number
 *                             example: 143300000
 *                           percentage:
 *                             type: number
 *                             example: 61.0
 *                     irrByQuarter:
 *                       type: array
 *                       description: IRR by quarter showing Investor Net IRR, Fund Net IRR, and Fund Gross IRR
 *                       items:
 *                         type: object
 *                         properties:
 *                           quarter:
 *                             type: string
 *                             example: "Q1 2025"
 *                           quarterNumber:
 *                             type: number
 *                             example: 1
 *                           year:
 *                             type: number
 *                             example: 2025
 *                           investorNetIRR:
 *                             type: number
 *                             example: 11.47
 *                           fundNetIRR:
 *                             type: number
 *                             example: 14.34
 *                           fundGrossIRR:
 *                             type: number
 *                             example: 16.32
 *                     portfolioSummary:
 *                       type: array
 *                       description: Detailed portfolio company summary table
 *                       items:
 *                         type: object
 *                         properties:
 *                           companyId:
 *                             type: string
 *                           name:
 *                             type: string
 *                             example: "Genesys"
 *                           initialInvestment:
 *                             type: string
 *                             format: date
 *                             nullable: true
 *                             example: "2016-12-01"
 *                           mainIndustry:
 *                             type: string
 *                             example: "Software"
 *                           commitReserves:
 *                             type: number
 *                             example: 0
 *                           currentOwnership:
 *                             type: number
 *                             nullable: true
 *                             example: 13.30
 *                           totalInvestmentCost:
 *                             type: number
 *                             example: 4000000
 *                           currentInvestmentCost:
 *                             type: number
 *                             example: 4000000
 *                           realized:
 *                             type: number
 *                             example: 0
 *                           fairMarketValue:
 *                             type: number
 *                             example: 4000000
 *                           totalValue:
 *                             type: number
 *                             example: 4000000
 *                           multiplesOfCost:
 *                             type: number
 *                             example: 1.00
 *                           grossIRR:
 *                             type: number
 *                             example: 2.00
 *                     comparisonChart:
 *                       type: array
 *                       description: Bar chart inputs (growth & margins per company; rates as decimals, *Pct on 0–100 scale)
 *                     netProfitWaterfall:
 *                       type: array
 *                       description: Net profit bridge between latest two kpiValues periods (when comparative data exists)
 *                     totals:
 *                       type: object
 *                       properties:
 *                         totalInvestmentCost:
 *                           type: number
 *                           example: 234990000
 *                         currentInvestmentCost:
 *                           type: number
 *                           example: 219890000
 *                         realized:
 *                           type: number
 *                           example: 70000000
 *                         fairMarketValue:
 *                           type: number
 *                           example: 289690000
 *                         totalValue:
 *                           type: number
 *                           example: 359690000
 *                         multiplesOfCost:
 *                           type: number
 *                           example: 1.53
 *                         grossIRR:
 *                           type: number
 *                           example: 16.32
 *                     period:
 *                       type: object
 *                       properties:
 *                         asOfDate:
 *                           type: string
 *                           format: date-time
 *                         fundName:
 *                           type: string
 *                           nullable: true
 *                           example: "USD Fund I"
 *                         year:
 *                           type: number
 *                           nullable: true
 *                         scope:
 *                           type: string
 *                           enum: [full, aum]
 *                           description: Echo of query scope (aum = lighter payload)
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to get portfolio dashboard"
 *                 details:
 *                   type: string
 */
/**
 * @swagger
 * /portfolio/dashboard/kpi-timeseries:
 *   get:
 *     summary: KPI time series for portfolio trend charts
 *     tags: [Dashboards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fundId
 *         schema: { type: string }
 *       - in: query
 *         name: portfolioCompanyId
 *         schema: { type: string }
 *       - in: query
 *         name: metrics
 *         schema: { type: string }
 *         description: Comma-separated keys from kpiValues (default includes TOTAL_REVENUE,NET_PROFIT,CASH_FLOW_NET,PORTFOLIO_FAIR_VALUE,EBITDA,EBITDA_MARGIN)
 *     responses:
 *       200:
 *         description: OK
 */
router.get(
  "/kpi-timeseries",
  authenticate,
  authorize(["admin", "ceo", "fund_manager", "investments_manager", "finance_manager"]),
  PortfolioDashboardController.getKpiTimeSeries
);

/**
 * @swagger
 * /portfolio/dashboard/company/{portfolioCompanyId}:
 *   get:
 *     summary: Portfolio dashboard scoped to one investee (same payload as main dashboard with portfolioSummary filtered)
 *     tags: [Dashboards]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/company/:portfolioCompanyId",
  authenticate,
  authorize(["admin", "ceo", "fund_manager", "investments_manager", "finance_manager"]),
  PortfolioDashboardController.getDashboardForCompany
);

router.get(
  "/",
  authenticate,
  authorize(["admin", "ceo", "fund_manager", "investments_manager", "finance_manager"]),
  PortfolioDashboardController.getDashboard
);

export default router;
