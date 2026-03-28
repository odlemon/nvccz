// @ts-nocheck
import { Router } from "express";
import { BalanceSheetController } from "../controllers/BalanceSheetController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = Router();

/**
 * @swagger
 * /api/accounting/balance-sheet/generate:
 *   post:
 *     summary: Generate balance sheet as of a specific date
 *     tags: [Accounting - Balance Sheet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: hideZeroBalances
 *         required: false
 *         schema:
 *           type: string
 *           enum: ["true", "false", "1", "0"]
 *         description: Filter — omit idle zero-balance accounts from lists (true or 1). Totals unchanged.
 *         example: "true"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - asOfDate
 *             properties:
 *               asOfDate:
 *                 type: string
 *                 format: date
 *                 description: As-of date for the balance sheet (e.g., "2025-12-31")
 *                 example: "2025-12-31"
 *               currencyId:
 *                 type: string
 *                 description: Currency ID (optional, uses default if not provided)
 *                 example: "USD"
 *     responses:
 *       200:
 *         description: Balance sheet generated successfully
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
 *                   example: Balance sheet generated successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     asOfDate:
 *                       type: string
 *                       format: date
 *                     currency:
 *                       type: string
 *                     assets:
 *                       type: object
 *                       properties:
 *                         currentAssets:
 *                           type: object
 *                         fixedAssets:
 *                           type: object
 *                         totalAssets:
 *                           type: number
 *                     liabilities:
 *                       type: object
 *                       properties:
 *                         currentLiabilities:
 *                           type: object
 *                         longTermLiabilities:
 *                           type: object
 *                         totalLiabilities:
 *                           type: number
 *                     equity:
 *                       type: object
 *                       properties:
 *                         accounts:
 *                           type: array
 *                         total:
 *                           type: number
 *                         retainedEarnings:
 *                           type: number
 *                     totalLiabilitiesAndEquity:
 *                       type: number
 *                     isBalanced:
 *                       type: boolean
 *                     difference:
 *                       type: number
 *       400:
 *         description: Bad request - missing or invalid parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/generate", authenticate, authorize(["admin", "accountant"]), BalanceSheetController.generateBalanceSheet);

/**
 * @swagger
 * /api/accounting/balance-sheet:
 *   get:
 *     summary: Get balance sheet by query parameters
 *     tags: [Accounting - Balance Sheet]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: asOfDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: As-of date for the balance sheet (e.g., "2025-12-31")
 *         example: "2025-12-31"
 *       - in: query
 *         name: currencyId
 *         schema:
 *           type: string
 *         description: Currency ID (optional)
 *         example: "USD"
 *       - in: query
 *         name: hideZeroBalances
 *         schema:
 *           type: boolean
 *         description: Omit idle zero-balance accounts from lists (totals unchanged). Use true or 1.
 *     responses:
 *       200:
 *         description: Balance sheet retrieved successfully
 *       400:
 *         description: Bad request - missing or invalid parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/", authenticate, authorize(["admin", "accountant"]), BalanceSheetController.getBalanceSheetByQuery);

export default router;


