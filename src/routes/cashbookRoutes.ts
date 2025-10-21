// @ts-nocheck
// Sage Pastel Cashbook Routes
// API endpoints for cashbook operations

import express from "express";
import CashbookController from "../controllers/CashbookController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Test endpoint to verify routes are working
router.get("/test", (req, res) => {
  res.json({ success: true, message: "Cashbook routes are working!" });
});

/**
 * @swagger
 * components:
 *   schemas:
 *     CashReceipt:
 *       type: object
 *       required:
 *         - bankId
 *         - transactionDate
 *         - description
 *         - amount
 *         - counterpartyType
 *       properties:
 *         bankId:
 *           type: string
 *           description: Bank account ID
 *         transactionDate:
 *           type: string
 *           format: date
 *           description: Transaction date
 *         description:
 *           type: string
 *           description: Transaction description
 *         amount:
 *           type: number
 *           description: Amount received
 *         reference:
 *           type: string
 *           description: Reference number (cheque, EFT, etc.)
 *         counterpartyType:
 *           type: string
 *           enum: [GL, CUSTOMER, SUPPLIER]
 *           description: Counterparty type
 *         glAccountId:
 *           type: string
 *           description: GL account ID (required for GL transactions)
 *         customerId:
 *           type: string
 *           description: Customer ID (required for customer transactions)
 *         supplierId:
 *           type: string
 *           description: Supplier ID (required for supplier transactions)
 *     
 *     CashPayment:
 *       type: object
 *       required:
 *         - bankId
 *         - transactionDate
 *         - description
 *         - amount
 *         - counterpartyType
 *       properties:
 *         bankId:
 *           type: string
 *           description: Bank account ID
 *         transactionDate:
 *           type: string
 *           format: date
 *           description: Transaction date
 *         description:
 *           type: string
 *           description: Transaction description
 *         amount:
 *           type: number
 *           description: Amount paid
 *         reference:
 *           type: string
 *           description: Reference number (cheque, EFT, etc.)
 *         counterpartyType:
 *           type: string
 *           enum: [GL, CUSTOMER, SUPPLIER]
 *           description: Counterparty type
 *         glAccountId:
 *           type: string
 *           description: GL account ID (required for GL transactions)
 *         customerId:
 *           type: string
 *           description: Customer ID (required for customer transactions)
 *         supplierId:
 *           type: string
 *           description: Supplier ID (required for supplier transactions)
 */

/**
 * @swagger
 * /api/cashbook/receipts:
 *   post:
 *     summary: Create a cash receipt
 *     description: Record money received into a bank account (Sage Pastel Receipts Journal)
 *     tags: [Cashbook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CashReceipt'
 *     responses:
 *       201:
 *         description: Cash receipt created successfully
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
 *                     cashbookEntry:
 *                       type: object
 *                     journalEntry:
 *                       type: object
 *       400:
 *         description: Bad request - missing required fields
 *       500:
 *         description: Internal server error
 */
router.post("/receipts", CashbookController.createReceipt);

/**
 * @swagger
 * /api/cashbook/payments:
 *   post:
 *     summary: Create a cash payment
 *     description: Record money paid out from a bank account (Sage Pastel Payments Journal)
 *     tags: [Cashbook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CashPayment'
 *     responses:
 *       201:
 *         description: Cash payment created successfully
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
 *                     cashbookEntry:
 *                       type: object
 *                     journalEntry:
 *                       type: object
 *       400:
 *         description: Bad request - missing required fields
 *       500:
 *         description: Internal server error
 */
router.post("/payments", CashbookController.createPayment);

/**
 * @swagger
 * /api/cashbook/{bankId}/position:
 *   get:
 *     summary: Get cash position for a bank account
 *     description: Get current cash position including opening balance, receipts, payments, and current balance
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: bankId
 *         required: true
 *         schema:
 *           type: string
 *         description: Bank account ID
 *     responses:
 *       200:
 *         description: Cash position retrieved successfully
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
 *                     bankName:
 *                       type: string
 *                     openingBalance:
 *                       type: number
 *                     totalReceipts:
 *                       type: number
 *                     totalPayments:
 *                       type: number
 *                     currentBalance:
 *                       type: number
 *                     unreconciledCount:
 *                       type: number
 *       404:
 *         description: Bank account not found
 *       500:
 *         description: Internal server error
 */
router.get("/:bankId/position", CashbookController.getCashPosition);

/**
 * @swagger
 * /api/cashbook/{bankId}/entries:
 *   get:
 *     summary: Get cashbook entries for a bank account
 *     description: Get all cashbook entries (receipts and payments) for a specific bank account
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: bankId
 *         required: true
 *         schema:
 *           type: string
 *         description: Bank account ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [RECEIPT, PAYMENT]
 *         description: Filter by transaction type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING, POSTED, VOIDED]
 *         description: Filter by transaction status
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter from date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter to date
 *     responses:
 *       200:
 *         description: Cashbook entries retrieved successfully
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
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       transactionDate:
 *                         type: string
 *                         format: date
 *                       type:
 *                         type: string
 *                         enum: [RECEIPT, PAYMENT]
 *                       description:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       reference:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [PENDING, POSTED, VOIDED]
 *                       counterpartyType:
 *                         type: string
 *                         enum: [GL, CUSTOMER, SUPPLIER]
 *       500:
 *         description: Internal server error
 */
router.get("/:bankId/entries", CashbookController.getCashbookEntries);

/**
 * @swagger
 * /api/cashbook/banks:
 *   get:
 *     summary: Get all banks (cashbooks)
 *     description: Get all active bank accounts that can be used as cashbooks
 *     tags: [Cashbook]
 *     responses:
 *       200:
 *         description: Banks retrieved successfully
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
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       accountNumber:
 *                         type: string
 *                       glAccount:
 *                         type: object
 *                       currency:
 *                         type: object
 *       500:
 *         description: Internal server error
 */
router.get("/banks", CashbookController.getBanks);

/**
 * @swagger
 * /api/cashbook/reports/cashflow:
 *   get:
 *     summary: Get cash flow report
 *     description: Generate a cash flow report for a specific period and optionally a specific bank
 *     tags: [Cashbook]
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Report start date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Report end date
 *       - in: query
 *         name: bankId
 *         schema:
 *           type: string
 *         description: Filter by specific bank account
 *     responses:
 *       200:
 *         description: Cash flow report generated successfully
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
 *                     period:
 *                       type: object
 *                       properties:
 *                         startDate:
 *                           type: string
 *                           format: date
 *                         endDate:
 *                           type: string
 *                           format: date
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalReceipts:
 *                           type: number
 *                         totalPayments:
 *                           type: number
 *                         netCashFlow:
 *                           type: number
 *                     entries:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Bad request - missing required parameters
 *       500:
 *         description: Internal server error
 */
router.get("/reports/cashflow", CashbookController.getCashFlowReport);

export default router;
