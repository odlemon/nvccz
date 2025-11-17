// @ts-nocheck
import { Router } from "express";
import IncomeStatementController from "../controllers/IncomeStatementController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = Router();

/**
 * @swagger
 * /accounting/income-statement/generate:
 *   post:
 *     summary: Generate income statement for a specific period
 *     description: |
 *       Supports period filters (month/quarter/year) via URL query parameters OR legacy date range in request body.
 *       
 *       **Period Filter Examples:**
 *       - Month: `?periodType=month&periodValue=2025-01`
 *       - Quarter: `?periodType=quarter&periodValue=2025-Q1`
 *       - Year: `?periodType=year&periodValue=2025`
 *     tags: [Accounting - Income Statement]
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
 *         description: Income statement generated successfully
 *       400:
 *         description: Invalid request parameters - Either period filter (periodType + periodValue in URL) or date range (startDate + endDate) is required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/generate", authenticate, authorize(["admin", "accountant"]), IncomeStatementController.generateIncomeStatement);

/**
 * @swagger
 * /accounting/income-statement/detailed:
 *   post:
 *     summary: Get detailed income statement with transaction breakdown
 *     description: |
 *       Supports period filters (month/quarter/year) via URL query parameters OR legacy date range in request body.
 *       
 *       **Period Filter Examples:**
 *       - Month: `?periodType=month&periodValue=2025-01`
 *       - Quarter: `?periodType=quarter&periodValue=2025-Q1`
 *       - Year: `?periodType=year&periodValue=2025`
 *     tags: [Accounting - Income Statement]
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
 *         description: Detailed income statement retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/detailed", authenticate, authorize(["admin", "accountant"]), IncomeStatementController.getDetailedIncomeStatement);

/**
 * @swagger
 * /accounting/income-statement/summary:
 *   post:
 *     summary: Get income statement summary (high-level totals)
 *     description: |
 *       Supports period filters (month/quarter/year) via URL query parameters OR legacy date range in request body.
 *     tags: [Accounting - Income Statement]
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
 *         description: Income statement summary retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/summary", authenticate, authorize(["admin", "accountant"]), IncomeStatementController.getIncomeStatementSummary);

/**
 * @swagger
 * /accounting/income-statement/comprehensive:
 *   post:
 *     summary: Get comprehensive detailed income statement with all transaction details
 *     description: |
 *       Supports period filters (month/quarter/year) via URL query parameters OR legacy date range in request body.
 *     tags: [Accounting - Income Statement]
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
 *         description: Comprehensive detailed income statement retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/comprehensive", authenticate, authorize(["admin", "accountant"]), IncomeStatementController.getComprehensiveDetailedIncomeStatement);

/**
 * @swagger
 * /api/accounting/income-statement/comparative:
 *   post:
 *     summary: Get comparative income statement for multiple periods
 *     tags: [Accounting - Income Statement]
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
 *         description: Comparative income statement retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/comparative", authenticate, authorize(["admin", "accountant"]), IncomeStatementController.getComparativeIncomeStatement);

/**
 * @swagger
 * /accounting/income-statement/vertical:
 *   post:
 *     summary: Get vertical income statement with traditional format
 *     description: |
 *       Supports period filters (month/quarter/year) via URL query parameters OR legacy date range in request body.
 *     tags: [Accounting - Income Statement]
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
 *         description: Vertical income statement retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/vertical", authenticate, authorize(["admin", "accountant"]), IncomeStatementController.getVerticalIncomeStatement);

/**
 * @swagger
 * /accounting/income-statement:
 *   get:
 *     summary: Get income statement by query parameters
 *     description: |
 *       Supports period filters (month/quarter/year) via URL query parameters OR legacy date range.
 *       
 *       **Period Filter Examples:**
 *       - Month: `?periodType=month&periodValue=2025-01&type=detailed`
 *       - Quarter: `?periodType=quarter&periodValue=2025-Q1&type=summary`
 *       - Year: `?periodType=year&periodValue=2025`
 *     tags: [Accounting - Income Statement]
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
 *           enum: [summary, detailed]
 *           default: summary
 *         description: Type of income statement to return
 *     responses:
 *       200:
 *         description: Income statement retrieved successfully
 *       400:
 *         description: Invalid request parameters - Either period filter (periodType + periodValue) or date range (startDate + endDate) is required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/", authenticate, authorize(["admin", "accountant"]), IncomeStatementController.getIncomeStatementByQuery);

export default router; 