// @ts-nocheck
import { Router } from "express";
import IncomeStatementController from "../controllers/IncomeStatementController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = Router();

/**
 * @swagger
 * /api/accounting/income-statement/generate:
 *   post:
 *     summary: Generate income statement for a specific period
 *     tags: [Income Statement]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startDate
 *               - endDate
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Start date of the period
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: End date of the period
 *               currencyId:
 *                 type: string
 *                 description: Currency ID (optional, uses default if not provided)
 *     responses:
 *       200:
 *         description: Income statement generated successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/generate", authenticate, authorize(["admin", "accountant"]), IncomeStatementController.generateIncomeStatement);

/**
 * @swagger
 * /api/accounting/income-statement/detailed:
 *   post:
 *     summary: Get detailed income statement with transaction breakdown
 *     tags: [Income Statement]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startDate
 *               - endDate
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
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
 * /api/accounting/income-statement/summary:
 *   post:
 *     summary: Get income statement summary (high-level totals)
 *     tags: [Income Statement]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startDate
 *               - endDate
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
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
 * /api/accounting/income-statement/comprehensive:
 *   post:
 *     summary: Get comprehensive detailed income statement with all transaction details
 *     tags: [Income Statement]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startDate
 *               - endDate
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
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
 *     tags: [Income Statement]
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
 * /api/accounting/income-statement/vertical:
 *   post:
 *     summary: Get vertical income statement with traditional format
 *     tags: [Income Statement]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startDate
 *               - endDate
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *               endDate:
 *                 type: string
 *                 format: date
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
 * /api/accounting/income-statement:
 *   get:
 *     summary: Get income statement by query parameters
 *     tags: [Income Statement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date of the period
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: End date of the period
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
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/", authenticate, authorize(["admin", "accountant"]), IncomeStatementController.getIncomeStatementByQuery);

export default router; 