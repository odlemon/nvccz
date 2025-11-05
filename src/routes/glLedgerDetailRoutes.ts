// @ts-nocheck
import express from "express";
import GLLedgerDetailController from "../controllers/GLLedgerDetailController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * /api/accounting/gl-ledger-detail:
 *   get:
 *     summary: Generate General Ledger Detail Report with Running Balance
 *     description: |
 *       Generates a detailed General Ledger report for a specific GL account with running balance.
 *       The report shows all transactions (Debit or Credit) for the account with a running balance
 *       after each transaction, facilitating easy manual review and verification of the closing balance.
 *       
 *       **Key Features:**
 *       - Shows all transactions for the specified GL account
 *       - Calculates running balance after each transaction
 *       - Includes opening balance and closing balance
 *       - Supports filtering by date range (e.g., entire year)
 *       - Shows transaction details (reference, description, type)
 *     tags: [General Ledger Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: accountNo
 *         required: true
 *         schema:
 *           type: string
 *           example: "1100"
 *         description: GL Account number (e.g., 1100 for Bank account)
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-01-01"
 *         description: Start date of the reporting period (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-12-31"
 *         description: End date of the reporting period (YYYY-MM-DD)
 *       - in: query
 *         name: currencyId
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional currency ID to filter by currency
 *     responses:
 *       200:
 *         description: GL Detail report generated successfully
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
 *                   example: "GL Detail report generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     account:
 *                       type: object
 *                       properties:
 *                         accountNo:
 *                           type: string
 *                           example: "1100"
 *                         accountName:
 *                           type: string
 *                           example: "Main Bank Account - USD"
 *                         accountType:
 *                           type: string
 *                           example: "Current Asset"
 *                         openingBalance:
 *                           type: number
 *                           example: 10000.00
 *                           description: "Balance at the start of the period"
 *                         closingBalance:
 *                           type: number
 *                           example: 15000.00
 *                           description: "Balance at the end of the period"
 *                     period:
 *                       type: object
 *                       properties:
 *                         startDate:
 *                           type: string
 *                           format: date
 *                           example: "2025-01-01"
 *                         endDate:
 *                           type: string
 *                           format: date
 *                           example: "2025-12-31"
 *                     transactions:
 *                       type: array
 *                       description: "List of all transactions with running balance after each transaction"
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           date:
 *                             type: string
 *                             format: date
 *                           reference:
 *                             type: string
 *                             example: "JE-2025-001"
 *                           description:
 *                             type: string
 *                           debitAmount:
 *                             type: number
 *                             example: 5000.00
 *                           creditAmount:
 *                             type: number
 *                             example: 0.00
 *                           runningBalance:
 *                             type: number
 *                             example: 15000.00
 *                             description: "Running balance after this transaction"
 *                           journalEntryId:
 *                             type: string
 *                           journalEntryStatus:
 *                             type: string
 *                             enum: [POSTED, PENDING]
 *                           transactionType:
 *                             type: string
 *                             enum: [Receipt, Payment, Invoice, Expense, Revenue, Manual Entry]
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalDebits:
 *                           type: number
 *                           example: 25000.00
 *                         totalCredits:
 *                           type: number
 *                           example: 20000.00
 *                         netChange:
 *                           type: number
 *                           example: 5000.00
 *                           description: "Net change in balance (Debits - Credits for Asset accounts, Credits - Debits for Liability/Equity accounts)"
 *                         transactionCount:
 *                           type: number
 *                           example: 25
 *       400:
 *         description: Bad request - missing or invalid parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/", GLLedgerDetailController.generateGLLedgerDetail);

export default router;

