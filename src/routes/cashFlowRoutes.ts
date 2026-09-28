// @ts-nocheck
import { Router } from "express";
import CashFlowController from "../controllers/CashFlowController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

// Who may use these routes is decided by the Accounting access guard in front of every accounting router
// (src/middleware/accountingAccessGuard.ts); the role-name lists that stood here refused the Finance Manager and auditors.
const router = Router();

/**
 * @swagger
 * /accounting/cash-flow/generate:
 *   post:
 *     summary: Generate cash flow statement for a specific period
 *     description: |
 *       Supports period filters (month/quarter/year) via URL query parameters OR legacy date range in request body.
 *       
 *       **Period Filter Examples:**
 *       - Month: `?periodType=month&periodValue=2025-01`
 *       - Quarter: `?periodType=quarter&periodValue=2025-Q1`
 *       - Year: `?periodType=year&periodValue=2025`
 *     tags: [Accounting - Cash Flow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periodType
 *         schema:
 *           type: string
 *           enum: [month, quarter, year]
 *         description: Period type filter (use with periodValue). Options: month, quarter, year
 *         example: month
 *       - in: query
 *         name: periodValue
 *         schema:
 *           type: string
 *         description: |
 *           Period value matching periodType:
 *           - month: "2025-01" (YYYY-MM)
 *           - quarter: "2025-Q1" or "2025-1" (YYYY-QN or YYYY-N)
 *           - year: "2025" (YYYY)
 *         example: "2025-01"
 *       - in: query
 *         name: currencyId
 *         schema:
 *           type: string
 *         description: Currency ID (optional, uses default if not provided)
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Legacy date range format (use if period filters not provided)
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Start date of the period (YYYY-MM-DD)
 *                 example: "2025-01-01"
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: End date of the period (YYYY-MM-DD)
 *                 example: "2025-01-31"
 *               currencyId:
 *                 type: string
 *                 description: Currency ID (optional, uses default if not provided)
 *     responses:
 *       200:
 *         description: Cash flow statement generated successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/generate", authenticate, CashFlowController.generateCashFlowStatement);

/**
 * @swagger
 * /accounting/cash-flow/detailed:
 *   post:
 *     summary: Get detailed cash flow statement with transaction breakdown
 *     description: |
 *       Supports period filters (month/quarter/year) via URL query parameters OR legacy date range in request body.
 *     tags: [Accounting - Cash Flow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periodType
 *         schema:
 *           type: string
 *           enum: [month, quarter, year]
 *         description: Period type filter (use with periodValue)
 *         example: month
 *       - in: query
 *         name: periodValue
 *         schema:
 *           type: string
 *         description: Period value (month: "2025-01", quarter: "2025-Q1", year: "2025")
 *         example: "2025-01"
 *       - in: query
 *         name: currencyId
 *         schema:
 *           type: string
 *         description: Currency ID (optional)
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Legacy date range format (use if period filters not provided)
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: "2025-01-01"
 *               endDate:
 *                 type: string
 *                 format: date
 *                 example: "2025-01-31"
 *               currencyId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Detailed cash flow statement retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/detailed", authenticate, CashFlowController.getDetailedCashFlowStatement);

/**
 * @swagger
 * /accounting/cash-flow/summary:
 *   post:
 *     summary: Get cash flow statement summary (high-level totals)
 *     description: |
 *       Supports period filters (month/quarter/year) via URL query parameters OR legacy date range in request body.
 *     tags: [Accounting - Cash Flow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periodType
 *         schema:
 *           type: string
 *           enum: [month, quarter, year]
 *         description: Period type filter (use with periodValue)
 *         example: month
 *       - in: query
 *         name: periodValue
 *         schema:
 *           type: string
 *         description: Period value (month: "2025-01", quarter: "2025-Q1", year: "2025")
 *         example: "2025-01"
 *       - in: query
 *         name: currencyId
 *         schema:
 *           type: string
 *         description: Currency ID (optional)
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Legacy date range format (use if period filters not provided)
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: "2025-01-01"
 *               endDate:
 *                 type: string
 *                 format: date
 *                 example: "2025-01-31"
 *               currencyId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cash flow statement summary retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/summary", authenticate, CashFlowController.getCashFlowStatementSummary);

/**
 * @swagger
 * /accounting/cash-flow/comprehensive:
 *   post:
 *     summary: Get comprehensive detailed cash flow statement with all transaction details
 *     description: |
 *       Supports period filters (month/quarter/year) via URL query parameters OR legacy date range in request body.
 *     tags: [Accounting - Cash Flow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periodType
 *         schema:
 *           type: string
 *           enum: [month, quarter, year]
 *         description: Period type filter (use with periodValue)
 *         example: month
 *       - in: query
 *         name: periodValue
 *         schema:
 *           type: string
 *         description: Period value (month: "2025-01", quarter: "2025-Q1", year: "2025")
 *         example: "2025-01"
 *       - in: query
 *         name: currencyId
 *         schema:
 *           type: string
 *         description: Currency ID (optional)
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Legacy date range format (use if period filters not provided)
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *                 example: "2025-01-01"
 *               endDate:
 *                 type: string
 *                 format: date
 *                 example: "2025-01-31"
 *               currencyId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Comprehensive detailed cash flow statement retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/comprehensive", authenticate, CashFlowController.getComprehensiveDetailedCashFlowStatement);

/**
 * @swagger
 * /api/accounting/cash-flow/comparative:
 *   post:
 *     summary: Get comparative cash flow statement for multiple periods
 *     tags: [Accounting - Cash Flow]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - periods
 *             properties:
 *               periods:
 *                 type: array
 *                 minItems: 2
 *                 items:
 *                   type: object
 *                   required:
 *                     - startDate
 *                     - endDate
 *                   properties:
 *                     startDate:
 *                       type: string
 *                       format: date
 *                     endDate:
 *                       type: string
 *                       format: date
 *                     currencyId:
 *                       type: string
 *     responses:
 *       200:
 *         description: Comparative cash flow statement retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/comparative", authenticate, CashFlowController.getComparativeCashFlowStatement);

/**
 * @swagger
 * /accounting/cash-flow:
 *   get:
 *     summary: Get cash flow statement by query parameters
 *     description: |
 *       Supports period filters (month/quarter/year) via URL query parameters OR legacy date range.
 *       
 *       **Period Filter Examples:**
 *       - Month: `?periodType=month&periodValue=2025-01&type=detailed`
 *       - Quarter: `?periodType=quarter&periodValue=2025-Q1&type=summary`
 *       - Year: `?periodType=year&periodValue=2025`
 *     tags: [Accounting - Cash Flow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: periodType
 *         schema:
 *           type: string
 *           enum: [month, quarter, year]
 *         description: Period type filter (use with periodValue). Options: month, quarter, year
 *         example: month
 *       - in: query
 *         name: periodValue
 *         schema:
 *           type: string
 *         description: |
 *           Period value matching periodType:
 *           - month: "2025-01" (YYYY-MM)
 *           - quarter: "2025-Q1" or "2025-1" (YYYY-QN or YYYY-N)
 *           - year: "2025" (YYYY)
 *         example: "2025-01"
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date of the period (legacy format - use if period filters not provided)
 *         example: "2025-01-01"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date of the period (legacy format - use if period filters not provided)
 *         example: "2025-01-31"
 *       - in: query
 *         name: currencyId
 *         schema:
 *           type: string
 *         description: Currency ID (optional)
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [summary, detailed, comprehensive]
 *           default: summary
 *         description: Type of cash flow statement to return
 *     responses:
 *       200:
 *         description: Cash flow statement retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/", authenticate, CashFlowController.getCashFlowStatementByQuery);

export default router; 