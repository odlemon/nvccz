// @ts-nocheck
import { Router } from "express";
import CashFlowController from "../controllers/CashFlowController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = Router();

/**
 * @swagger
 * /api/accounting/cash-flow/generate:
 *   post:
 *     summary: Generate cash flow statement for a specific period
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
 *         description: Cash flow statement generated successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/generate", authenticate, authorize(["admin", "accountant"]), CashFlowController.generateCashFlowStatement);

/**
 * @swagger
 * /api/accounting/cash-flow/detailed:
 *   post:
 *     summary: Get detailed cash flow statement with transaction breakdown
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
 *         description: Detailed cash flow statement retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/detailed", authenticate, authorize(["admin", "accountant"]), CashFlowController.getDetailedCashFlowStatement);

/**
 * @swagger
 * /api/accounting/cash-flow/summary:
 *   post:
 *     summary: Get cash flow statement summary (high-level totals)
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
 *         description: Cash flow statement summary retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/summary", authenticate, authorize(["admin", "accountant"]), CashFlowController.getCashFlowStatementSummary);

/**
 * @swagger
 * /api/accounting/cash-flow/comprehensive:
 *   post:
 *     summary: Get comprehensive detailed cash flow statement with all transaction details
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
 *         description: Comprehensive detailed cash flow statement retrieved successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/comprehensive", authenticate, authorize(["admin", "accountant"]), CashFlowController.getComprehensiveDetailedCashFlowStatement);

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
router.post("/comparative", authenticate, authorize(["admin", "accountant"]), CashFlowController.getComparativeCashFlowStatement);

/**
 * @swagger
 * /api/accounting/cash-flow:
 *   get:
 *     summary: Get cash flow statement by query parameters
 *     tags: [Accounting - Cash Flow]
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
router.get("/", authenticate, authorize(["admin", "accountant"]), CashFlowController.getCashFlowStatementByQuery);

export default router; 