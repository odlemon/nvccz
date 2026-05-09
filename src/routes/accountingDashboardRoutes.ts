// @ts-nocheck
import { Router } from "express";
import { AccountingDashboardController } from "../controllers/AccountingDashboardController";
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
 * /accounting/dashboard:
 *   get:
 *     summary: Get accounting dashboard data
 *     description: Returns comprehensive accounting dashboard data including key metrics (Revenue, COGS, Gross Profit, Net Profit), monthly chart data, expense breakdowns, and assets/liabilities breakdowns. All calculations match the Income Statement and Balance Sheet reports. Assets summary buckets partition total assets (cash is separated from non-cash current assets so rows sum consistently with `assets.total`).
 *     tags: [Dashboards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *           enum: [MTD, YTD]
 *           default: YTD
 *         description: Period type (Month to Date or Year to Date)
 *       - in: query
 *         name: benchmark
 *         schema:
 *           type: string
 *           enum: [LAST_MONTH, LAST_YEAR]
 *           default: LAST_YEAR
 *         description: Benchmark period for comparison
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-01-01"
 *         description: Custom start date (YYYY-MM-DD). If provided, overrides period parameter.
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-12-31"
 *         description: Custom end date (YYYY-MM-DD). If provided, overrides period parameter.
 *       - in: query
 *         name: currencyId
 *         schema:
 *           type: string
 *         description: Currency ID. If not provided, uses default active currency.
 *       - in: query
 *         name: entityId
 *         schema:
 *           type: string
 *         description: Entity ID (for multi-entity support)
 *       - in: query
 *         name: financialYear
 *         schema:
 *           type: string
 *         description: Financial year filter
 *       - in: query
 *         name: months
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: Array of months to filter
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
 *                   example: "Accounting dashboard data retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     metrics:
 *                       type: object
 *                       description: Key performance metrics with current values and changes vs benchmark
 *                       properties:
 *                         revenue:
 *                           type: object
 *                           properties:
 *                             value:
 *                               type: number
 *                               example: 1500000
 *                               description: Total revenue for the period
 *                             change:
 *                               type: number
 *                               example: 130000
 *                               description: Change vs benchmark period
 *                             changePercent:
 *                               type: number
 *                               example: 4.5
 *                               description: Percentage change vs benchmark
 *                         cogs:
 *                           type: object
 *                           properties:
 *                             value:
 *                               type: number
 *                               example: 1300000
 *                             change:
 *                               type: number
 *                               example: -550000
 *                             changePercent:
 *                               type: number
 *                               example: -4.5
 *                         grossProfit:
 *                           type: object
 *                           properties:
 *                             value:
 *                               type: number
 *                               example: 1000000
 *                             change:
 *                               type: number
 *                               example: 110000
 *                             changePercent:
 *                               type: number
 *                               example: 4.5
 *                             grossProfitPercent:
 *                               type: number
 *                               example: 66.67
 *                               description: Gross profit margin percentage
 *                         netProfit:
 *                           type: object
 *                           properties:
 *                             value:
 *                               type: number
 *                               example: 800000
 *                             change:
 *                               type: number
 *                               example: -22000
 *                             changePercent:
 *                               type: number
 *                               example: -4.5
 *                     monthlyData:
 *                       type: array
 *                       description: Monthly breakdown for chart visualization
 *                       items:
 *                         type: object
 *                         properties:
 *                           month:
 *                             type: string
 *                             example: "Jan"
 *                           monthNumber:
 *                             type: number
 *                             example: 1
 *                           revenue:
 *                             type: number
 *                           cogs:
 *                             type: number
 *                           grossProfit:
 *                             type: number
 *                           grossProfitPercent:
 *                             type: number
 *                           netProfit:
 *                             type: number
 *                     expenses:
 *                       type: array
 *                       description: Expense breakdown by category, sorted by amount descending
 *                       items:
 *                         type: object
 *                         properties:
 *                           category:
 *                             type: string
 *                             example: "Salaries & Benefits"
 *                           amount:
 *                             type: number
 *                             example: 504435
 *                           percent:
 *                             type: number
 *                             example: 25.5
 *                     assets:
 *                       type: object
 *                       properties:
 *                         summary:
 *                           type: array
 *                           description: High-level asset categories
 *                           items:
 *                             type: object
 *                             properties:
 *                               category:
 *                                 type: string
 *                                 example: "Cash & Bank Balance"
 *                               amount:
 *                                 type: number
 *                               percent:
 *                                 type: number
 *                         detailed:
 *                           type: array
 *                           description: Detailed asset account breakdown
 *                           items:
 *                             type: object
 *                         total:
 *                           type: number
 *                           example: 25000000
 *                     liabilitiesEquity:
 *                       type: object
 *                       properties:
 *                         summary:
 *                           type: array
 *                           description: High-level liabilities and equity categories
 *                           items:
 *                             type: object
 *                         detailed:
 *                           type: array
 *                           description: Detailed liabilities and equity breakdown
 *                           items:
 *                             type: object
 *                         total:
 *                           type: number
 *                     period:
 *                       type: object
 *                       properties:
 *                         startDate:
 *                           type: string
 *                           format: date-time
 *                         endDate:
 *                           type: string
 *                           format: date-time
 *                         periodType:
 *                           type: string
 *                           enum: [MTD, YTD]
 *                         benchmarkType:
 *                           type: string
 *                           enum: [LAST_MONTH, LAST_YEAR]
 *                     currency:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         code:
 *                           type: string
 *                           example: "USD"
 *                         name:
 *                           type: string
 *                           example: "US Dollar"
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
 *                   example: "Failed to get accounting dashboard"
 *                 details:
 *                   type: string
 */
router.get(
  "/",
  authenticate,
  authorize(["admin", "accountant", "finance_manager"]),
  AccountingDashboardController.getDashboard
);

export default router;
