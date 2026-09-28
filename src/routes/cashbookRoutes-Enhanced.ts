// @ts-nocheck
// Enhanced Cashbook Routes with missing critical features
// Extends the existing cashbook routes with void, edit, batch posting, and reconciliation endpoints

import express from "express";
import multer from "multer";
import CashbookController from "../controllers/CashbookController";
import { CashbookControllerEnhanced } from "../controllers/CashbookController-Enhanced";
import { CashbookReconciliationSessionController } from "../controllers/CashbookReconciliationSessionController";
import { BankReconciliationWorkbenchController as RecW } from "../controllers/BankReconciliationWorkbenchController";
import { CashbookPositionController } from "../controllers/CashbookPositionController";
import { authenticate } from "../middleware/authenticate";
import { ResponseHelper } from "../utils/responseHelper";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/** Receipt PDF/images — same multer memory pattern as procurement proof-of-payment; upload via RemoteUploadService. */
const uploadCashbookReceipt = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      "application/pdf",
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (allowedMimes.includes(file.mimetype) || /\.(pdf|jpe?g|png|gif|webp)$/i.test(file.originalname || "")) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF and image files (JPG, PNG, GIF, WEBP) are allowed"));
    }
  },
});

// Enhanced routes only - core routes are handled by cashbookRoutes.ts

// Enhanced routes (new functionality)

/**
 * @swagger
 * /api/cashbook/entries/{id}/receipt-attachment:
 *   post:
 *     summary: Upload receipt scan (PDF/image) for a cashbook entry
 *     description: Stores file on cloud storage (same remote upload as cashbook batch imports) and saves the download URL on the entry.
 *     tags: [Cashbook]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Attachment saved; entry includes receiptAttachmentUrl
 *       400:
 *         description: Missing file or invalid type
 *       404:
 *         description: Entry not found
 */
router.post(
  "/entries/:id/receipt-attachment",
  (req, res, next) => {
    uploadCashbookReceipt.single("file")(req, res, (err) => {
      if (err) {
        return ResponseHelper.badRequest(res, err.message || "Invalid file upload");
      }
      next();
    });
  },
  CashbookControllerEnhanced.uploadReceiptAttachment
);

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
 *         description: Filter from date (start of day). Alias of dateFrom.
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter to date (end of day inclusive). Alias of dateTo.
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Same as startDate if startDate omitted
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Same as endDate if endDate omitted
 *       - in: query
 *         name: transactionType
 *         schema:
 *           type: string
 *           enum: [RECEIPT, PAYMENT]
 *         description: Same as type if type omitted
 *       - in: query
 *         name: minAmount
 *         schema:
 *           type: number
 *         description: Minimum transaction amount (inclusive)
 *       - in: query
 *         name: maxAmount
 *         schema:
 *           type: number
 *         description: Maximum transaction amount (inclusive)
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Substring match on description or reference (case-insensitive under typical MySQL utf8mb4_unicode_ci collation)
 *       - in: query
 *         name: currencyId
 *         schema:
 *           type: string
 *         description: Bank currency or recorded currency on the entry (ZiG filter for UAT)
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
 *     summary: Export month cashbook for tax audit (CSV by default)
 *     description: >
 *       CSV (default) or Excel (.xlsx) with columns Date, Payee, Reference, Amount, Tax; title rows and totals row.
 *       UTF-8 BOM on CSV for Excel. Query format=xlsx for legacy spreadsheet download.
 *       POSTED lines only; optional bankId. Totals row = sum of Amount and Tax on the export.
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
 *       - in: query
 *         name: format
 *         schema: { type: string, enum: [csv, xlsx] }
 *         description: Response format; default csv
 *     responses:
 *       200:
 *         description: CSV or Excel attachment
 *         content:
 *           text/csv:
 *             schema: { type: string, format: binary }
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

// Cashbook bank reconciliation sessions (Sage-style draft → finish). Register before /:bankId/* routes.
router.get(
  "/reconciliation/banks/:bankId/entries",
  CashbookReconciliationSessionController.listEntries
);
router.get(
  "/reconciliation/banks/:bankId/sessions",
  CashbookReconciliationSessionController.listSessions
);
router.post(
  "/reconciliation/banks/:bankId/sessions",
  CashbookReconciliationSessionController.createDraft
);
router.get(
  "/reconciliation/sessions/:sessionId",
  CashbookReconciliationSessionController.getById
);
router.patch(
  "/reconciliation/sessions/:sessionId",
  CashbookReconciliationSessionController.updateDraft
);
router.post(
  "/reconciliation/sessions/:sessionId/finish",
  CashbookReconciliationSessionController.finish
);
router.post(
  "/reconciliation/sessions/:sessionId/discard",
  CashbookReconciliationSessionController.discard
);
// the workbench: statement import, matching, booking bank-only lines, ticking, reopening (BankReconciliationWorkbenchService)
const uploadStatement = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
router.get("/reconciliation/status", RecW.status);
router.get("/position", CashbookPositionController.position);
router.get("/reconciliation/sessions/:sessionId/workbench", RecW.workbench);
router.post("/reconciliation/sessions/:sessionId/statement", uploadStatement.single("file"), RecW.importStatement);
router.post("/reconciliation/sessions/:sessionId/auto-match", RecW.autoMatch);
router.post("/reconciliation/sessions/:sessionId/tick", RecW.tick);
router.post("/reconciliation/sessions/:sessionId/lines/:itemId/match", RecW.match);
router.post("/reconciliation/sessions/:sessionId/lines/:itemId/unmatch", RecW.unmatch);
router.post("/reconciliation/sessions/:sessionId/lines/:itemId/book", RecW.book);
router.post("/reconciliation/sessions/:sessionId/reopen", RecW.reopen);

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
 *                       isReconciled:
 *                         type: boolean
 *                       reconciliationStatus:
 *                         type: string
 *                         enum: ['N', 'Y']
 *                         description: N = unreconciled, Y = reconciled (derived from isReconciled)
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
/**
 * @swagger
 * /api/cashbook/reconciliation/seed-five-unreconciled:
 *   post:
 *     summary: Seed five posted unreconciled cashbook lines (reconciliationStatus N)
 *     description: Creates 3 receipts and 2 payments for Bank Recon "Unreconciled" tab testing.
 *     tags: [Cashbook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [bankId]
 *             properties:
 *               bankId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Five entries created
 *       400:
 *         description: Missing bankId
 *       500:
 *         description: Internal server error
 */
// test data only: off unless ALLOW_TEST_SEEDS=on (it creates posted cashbook lines)
router.post(
  "/reconciliation/seed-five-unreconciled",
  (req, res, next) => (process.env.ALLOW_TEST_SEEDS === "on" ? next() : res.status(404).json({ success: false, message: "Not found" })),
  CashbookControllerEnhanced.seedFiveUnreconciledEntries
);

router.get("/reconciliation/display", CashbookControllerEnhanced.getReconciliationDisplay);

export default router;
