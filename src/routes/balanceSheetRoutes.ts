// @ts-nocheck
import { Router } from "express";
import { BalanceSheetController } from "../controllers/BalanceSheetController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

// Who may use these routes is decided by the Accounting access guard in front of every accounting router
// (src/middleware/accountingAccessGuard.ts); the role-name lists that stood here refused the Finance Manager and auditors.
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
router.post("/generate", authenticate, BalanceSheetController.generateBalanceSheet);

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
router.get("/", authenticate, BalanceSheetController.getBalanceSheetByQuery);

/**
 * @swagger
 * /api/accounting/balance-sheet/consolidated:
 *   post:
 *     summary: Generate consolidated balance sheet (all currencies converted to one target currency)
 *     description: |
 *       Fetches ALL journal entries regardless of currency, converts every amount to the target
 *       consolidation currency using the exchange rate as of the report date, and aggregates them.
 *       Each account line includes a `currencyBreakdown` array showing sourceAmount, conversionRate
 *       and consolidatedAmount per original currency.
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
 *         description: Omit idle zero-balance accounts
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - asOfDate
 *               - consolidationCurrencyId
 *             properties:
 *               asOfDate:
 *                 type: string
 *                 format: date
 *                 description: As-of date for the balance sheet
 *                 example: "2026-03-31"
 *               consolidationCurrencyId:
 *                 type: string
 *                 description: ID of the target currency to consolidate into
 *                 example: "clxabc123usd"
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Optional start date (if both startDate & endDate provided, restricts range)
 *                 example: "2025-01-01"
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: Optional end date
 *                 example: "2026-03-31"
 *     responses:
 *       200:
 *         description: Consolidated balance sheet generated successfully
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     asOfDate:
 *                       type: string
 *                       format: date
 *                     consolidationCurrency:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         code:
 *                           type: string
 *                         name:
 *                           type: string
 *                     exchangeRates:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           currencyId:
 *                             type: string
 *                           currencyCode:
 *                             type: string
 *                           rate:
 *                             type: number
 *                     assets:
 *                       type: object
 *                     liabilities:
 *                       type: object
 *                     equity:
 *                       type: object
 *                     totalLiabilitiesAndEquity:
 *                       type: number
 *                     isBalanced:
 *                       type: boolean
 *                     difference:
 *                       type: number
 *       400:
 *         description: Bad request - missing consolidationCurrencyId or dates
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/consolidated", authenticate, BalanceSheetController.generateConsolidatedBalanceSheet);

export default router;


