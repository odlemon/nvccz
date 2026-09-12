// @ts-nocheck
import { Router } from 'express';
import { TrialBalanceController } from '../controllers/TrialBalanceController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

/**
 * @swagger
 * /accounting/trial-balance:
 *   get:
 *     summary: Generate trial balance for a specific date
 *     description: |
 *       Supports period filters (month/quarter/year) via URL query parameters OR legacy date range.
 *       
 *       **Period Filter Examples:**
 *       - Month: `?periodType=month&periodValue=2025-01`
 *       - Quarter: `?periodType=quarter&periodValue=2025-Q1`
 *       - Year: `?periodType=year&periodValue=2025`
 *     tags: [Trial Balance]
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
 *         name: date
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Date for trial balance (YYYY-MM-DD) - legacy format. Defaults to current date if not provided.
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for date range (legacy format - use if period filters not provided)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for date range (legacy format - use if period filters not provided)
 *       - in: query
 *         name: hideZeroBalances
 *         schema:
 *           type: boolean
 *         description: When true, omit accounts with no period activity and zero net balance. Accounts with offsetting debits/credits in the period (net zero) are still included so row sums align with totals.
 *         example: true
 *       - in: query
 *         name: includeTransactionDetails
 *         schema:
 *           type: boolean
 *           default: true
 *         description: When false, uses a minimal query for scale (e.g. 12 months, 10k entries in under 5s). Omit or true for full drill-down.
 *     responses:
 *       200:
 *         description: Trial balance generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     date:
 *                       type: string
 *                     accounts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           accountId:
 *                             type: string
 *                           accountName:
 *                             type: string
 *                           accountNo:
 *                             type: string
 *                           accountType:
 *                             type: string
 *                           debitBalance:
 *                             type: number
 *                           creditBalance:
 *                             type: number
 *                           netBalance:
 *                             type: number
 *                     totals:
 *                       type: object
 *                       properties:
 *                         totalDebits:
 *                           type: number
 *                           description: Gross sum of debit amounts on all lines in scope (journal activity).
 *                         totalCredits:
 *                           type: number
 *                           description: Gross sum of credit amounts on all lines in scope.
 *                         netDebitColumnTotal:
 *                           type: number
 *                           description: Sum of displayed debitBalance per account (net column). Matches Excel SUM(debitBalance) over full account list.
 *                         netCreditColumnTotal:
 *                           type: number
 *                           description: Sum of displayed creditBalance per account. Equals netDebitColumnTotal when balanced.
 *                         isBalanced:
 *                           type: boolean
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticate, TrialBalanceController.generateTrialBalance);

/**
 * @swagger
 * /accounting/trial-balance/summary:
 *   get:
 *     summary: Get trial balance summary
 *     description: |
 *       Supports period filters (month/quarter/year) via URL query parameters OR legacy date.
 *     tags: [Trial Balance]
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
 *         name: date
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Date for trial balance (YYYY-MM-DD) - legacy format. Defaults to current date if not provided.
 *     responses:
 *       200:
 *         description: Trial balance summary retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalAccounts:
 *                       type: number
 *                     totalDebits:
 *                       type: number
 *                     totalCredits:
 *                       type: number
 *                     netDebitColumnTotal:
 *                       type: number
 *                     netCreditColumnTotal:
 *                       type: number
 *                     isBalanced:
 *                       type: boolean
 *                     balanceDifference:
 *                       type: number
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/summary', authenticate, TrialBalanceController.getTrialBalanceSummary);

/**
 * @swagger
 * /accounting/trial-balance/by-account-type:
 *   get:
 *     summary: Get trial balance grouped by account type
 *     description: |
 *       Supports period filters (month/quarter/year) via URL query parameters OR legacy date.
 *     tags: [Trial Balance]
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
 *         name: date
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Date for trial balance (YYYY-MM-DD) - legacy format. Defaults to current date if not provided.
 *     responses:
 *       200:
 *         description: Trial balance by account type retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       accounts:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             accountId:
 *                               type: string
 *                             accountName:
 *                               type: string
 *                             accountNo:
 *                               type: string
 *                             accountType:
 *                               type: string
 *                             debitBalance:
 *                               type: number
 *                             creditBalance:
 *                               type: number
 *                             netBalance:
 *                               type: number
 *                       totalDebits:
 *                         type: number
 *                       totalCredits:
 *                         type: number
 *                       netBalance:
 *                         type: number
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/by-account-type', authenticate, TrialBalanceController.getTrialBalanceByAccountType);

export default router;
