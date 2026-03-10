// @ts-nocheck
// Enhanced Cashbook Routes with missing critical features
// Extends the existing cashbook routes with void, edit, batch posting, and reconciliation endpoints

import express from "express";
import CashbookController from "../controllers/CashbookController";
import { CashbookControllerEnhanced } from "../controllers/CashbookController-Enhanced";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Enhanced routes only - core routes are handled by cashbookRoutes.ts

// Enhanced routes (new functionality)

/**
 * @swagger
 * /api/cashbook/entries/{id}:
 *   get:
 *     summary: Get cashbook entry by ID
 *     description: Get detailed information about a specific cashbook entry
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Cashbook entry ID
 *     responses:
 *       200:
 *         description: Cashbook entry retrieved successfully
 *       404:
 *         description: Cashbook entry not found
 *       500:
 *         description: Internal server error
 */
router.get("/entries/:id", CashbookControllerEnhanced.getEntryById);

/**
 * @swagger
 * /api/cashbook/entries:
 *   get:
 *     summary: Get all cashbook entries with advanced filtering
 *     description: Get cashbook entries with pagination and advanced filtering options
 *     tags: [Cashbook]
 *     parameters:
 *       - in: query
 *         name: bankId
 *         schema:
 *           type: string
 *         description: Filter by bank ID
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
 *         name: counterpartyType
 *         schema:
 *           type: string
 *           enum: [GL, CUSTOMER, SUPPLIER]
 *         description: Filter by counterparty type
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
 *       - in: query
 *         name: isReconciled
 *         schema:
 *           type: boolean
 *         description: Filter by reconciliation status
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of entries per page
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
 *                   type: object
 *                   properties:
 *                     entries:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         pages:
 *                           type: integer
 *       500:
 *         description: Internal server error
 */
router.get("/entries", CashbookControllerEnhanced.getAllEntries);

/**
 * @swagger
 * /api/cashbook/export-audit:
 *   get:
 *     summary: Export month cashbook to Excel for tax audit
 *     description: Export a month's cashbook with columns Date, Payee, Reference, Amount, Tax; totals match the system.
 *     tags: [Cashbook]
 *     parameters:
 *       - in: query
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: month
 *         required: true
 *         schema: { type: integer, minimum: 1, maximum: 12 }
 *       - in: query
 *         name: bankId
 *         schema: { type: string }
 *         description: Optional; filter by bank
 *     responses:
 *       200:
 *         description: Excel file attachment
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema: { type: string, format: binary }
 *       400:
 *         description: Bad request - year/month required
 */
router.get("/export-audit", CashbookControllerEnhanced.exportAudit);

/**
 * @swagger
 * /api/cashbook/entries/{id}:
 *   put:
 *     summary: Update a cashbook entry
 *     description: Update a cashbook entry (only if not posted)
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Cashbook entry ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               transactionDate:
 *                 type: string
 *                 format: date
 *               description:
 *                 type: string
 *               amount:
 *                 type: number
 *               reference:
 *                 type: string
 *               counterpartyType:
 *                 type: string
 *                 enum: [GL, CUSTOMER, SUPPLIER]
 *               glAccountId:
 *                 type: string
 *               customerId:
 *                 type: string
 *               supplierId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Cashbook entry updated successfully
 *       400:
 *         description: Bad request - cannot edit posted entries
 *       404:
 *         description: Cashbook entry not found
 *       500:
 *         description: Internal server error
 */
router.put("/entries/:id", CashbookControllerEnhanced.updateEntry);

/**
 * @swagger
 * /api/cashbook/entries/{id}/void:
 *   put:
 *     summary: Void a cashbook entry
 *     description: Void a cashbook entry and create reversal journal entries
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Cashbook entry ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for voiding the entry
 *     responses:
 *       200:
 *         description: Cashbook entry voided successfully
 *       400:
 *         description: Bad request - entry already voided
 *       404:
 *         description: Cashbook entry not found
 *       500:
 *         description: Internal server error
 */
router.put("/entries/:id/void", CashbookControllerEnhanced.voidEntry);

/**
 * @swagger
 * /api/cashbook/{bankId}/post-batch:
 *   post:
 *     summary: Post cashbook batch
 *     description: Post all pending cashbook entries for a bank (Sage Pastel style)
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: bankId
 *         required: true
 *         schema:
 *           type: string
 *         description: Bank ID
 *     responses:
 *       200:
 *         description: Cashbook batch posted successfully
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
 *                     postedCount:
 *                       type: integer
 *                     entries:
 *                       type: array
 *                       items:
 *                         type: object
 *       500:
 *         description: Internal server error
 */
router.post("/:bankId/post-batch", CashbookControllerEnhanced.postBatch);

/**
 * @swagger
 * /api/cashbook/entries/{id}/reconcile:
 *   put:
 *     summary: Mark cashbook entry as reconciled
 *     description: Mark a cashbook entry as reconciled with bank statement
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Cashbook entry ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               bankTransactionId:
 *                 type: string
 *                 description: Bank transaction ID for linking
 *     responses:
 *       200:
 *         description: Cashbook entry reconciled successfully
 *       400:
 *         description: Bad request - only posted entries can be reconciled
 *       404:
 *         description: Cashbook entry not found
 *       500:
 *         description: Internal server error
 */
router.put("/entries/:id/reconcile", CashbookControllerEnhanced.reconcileEntry);

/**
 * @swagger
 * /api/cashbook/entries/{id}/unreconcile:
 *   put:
 *     summary: Unreconcile a cashbook entry
 *     description: Mark a cashbook entry as unreconciled (allows voiding)
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Cashbook entry ID
 *     responses:
 *       200:
 *         description: Cashbook entry unreconciled successfully
 *       400:
 *         description: Bad request - entry is not reconciled
 *       404:
 *         description: Cashbook entry not found
 *       500:
 *         description: Internal server error
 */
router.put("/entries/:id/unreconcile", CashbookControllerEnhanced.unreconcileEntry);

/**
 * @swagger
 * /api/cashbook/{bankId}/summary:
 *   get:
 *     summary: Get cashbook summary
 *     description: Get comprehensive cashbook summary for a bank account
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: bankId
 *         required: true
 *         schema:
 *           type: string
 *         description: Bank ID
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Summary start date
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Summary end date
 *     responses:
 *       200:
 *         description: Cashbook summary retrieved successfully
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
 *                         pendingCount:
 *                           type: integer
 *                         postedCount:
 *                           type: integer
 *                         voidedCount:
 *                           type: integer
 *                         reconciledCount:
 *                           type: integer
 *                         unreconciledCount:
 *                           type: integer
 *                     entries:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Bad request - missing required parameters
 *       500:
 *         description: Internal server error
 */
router.get("/:bankId/summary", CashbookControllerEnhanced.getSummary);

/**
 * @swagger
 * /api/cashbook/{bankId}/unreconciled:
 *   get:
 *     summary: Get unreconciled entries
 *     description: Get all unreconciled cashbook entries for a bank
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: bankId
 *         required: true
 *         schema:
 *           type: string
 *         description: Bank ID
 *     responses:
 *       200:
 *         description: Unreconciled entries retrieved successfully
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
 *                       counterparty:
 *                         type: string
 *       500:
 *         description: Internal server error
 */
router.get("/:bankId/unreconciled", CashbookControllerEnhanced.getUnreconciledEntries);

/**
 * @swagger
 * /api/cashbook/reconciliation/display:
 *   get:
 *     summary: Get bank reconciliation display with running balance
 *     description: Get reconciliation display showing GL Bank Balance, Total Un-ticked Items, and Calculated Cleared Balance. Updates in real-time as items are ticked/unticked.
 *     tags: [Cashbook]
 *     parameters:
 *       - in: query
 *         name: bankId
 *         required: true
 *         schema:
 *           type: string
 *         description: Bank ID
 *       - in: query
 *         name: periodEndDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Period end date for reconciliation
 *       - in: query
 *         name: tickedEntryIds
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: Array of entry IDs that are currently ticked/checked
 *     responses:
 *       200:
 *         description: Reconciliation display retrieved successfully
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
 *                     glBankBalance:
 *                       type: number
 *                       description: GL Bank Balance (from journal entries)
 *                     totalUntickedItems:
 *                       type: number
 *                       description: Sum of all unticked transaction amounts
 *                     clearedBalance:
 *                       type: number
 *                       description: Calculated Cleared Balance (GL Balance - Total Un-ticked Items)
 *                     unreconciledEntries:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           transactionDate:
 *                             type: string
 *                             format: date-time
 *                           type:
 *                             type: string
 *                             enum: [RECEIPT, PAYMENT]
 *                           description:
 *                             type: string
 *                           reference:
 *                             type: string
 *                           amount:
 *                             type: number
 *                           signedAmount:
 *                             type: number
 *                             description: Positive for receipts, negative for payments
 *                           status:
 *                             type: string
 *                           isTicked:
 *                             type: boolean
 *                           counterpartyType:
 *                             type: string
 *                           counterparty:
 *                             type: string
 *                     bankInfo:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         accountNumber:
 *                           type: string
 *                         glAccountNo:
 *                           type: string
 *                         glAccountName:
 *                           type: string
 *       400:
 *         description: Bad request - missing required parameters
 *       500:
 *         description: Internal server error
 */
router.get("/reconciliation/display", CashbookControllerEnhanced.getReconciliationDisplay);

export default router;
