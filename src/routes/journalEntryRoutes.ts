// @ts-nocheck
import express from "express";
import JournalEntryController from "../controllers/JournalEntryController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * /api/accounting/journal-entries:
 *   get:
 *     summary: Get all journal entries
 *     description: Retrieve journal entries with optional status filtering. Defaults to showing POSTED and PENDING entries only (excludes VOID entries). Results are sorted by **transaction date** (newest first), then by **createdAt** for the same date — not by when rows were inserted into the database alone.
 *     tags: [Journal Entries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [POSTED, PENDING, VOID, ALL, POSTED_AND_PENDING]
 *           default: POSTED_AND_PENDING
 *         description: Filter by journal entry status. Defaults to POSTED_AND_PENDING if not specified.
 *       - in: query
 *         name: currencyId
 *         schema:
 *           type: string
 *         description: If set, only journal entries whose header currency matches this ID (not converted from other currencies).
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Optional YYYY-MM-DD; if set, endDate is required. UTC calendar-day range (aligned with date-only storage).
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Optional YYYY-MM-DD; if set, startDate is required.
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 500
 *         description: Optional page size. When set, response uses `ResponseHelper.paginated` with `data` + `pagination` (total, page, limit, …). Omit for full list (same filters; can be large).
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           minimum: 0
 *         description: Optional skip for pagination (use with `limit`). Default 0.
 *     responses:
 *       200:
 *         description: Journal entries retrieved successfully
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
 *                   example: "Journal entries retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       transactionDate:
 *                         type: string
 *                         format: date-time
 *                       referenceNumber:
 *                         type: string
 *                       description:
 *                         type: string
 *                       totalAmount:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [POSTED, PENDING, VOID]
 *                       journalEntryLines:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             debitAmount:
 *                               type: string
 *                             creditAmount:
 *                               type: string
 *                             description:
 *                               type: string
 *                             chartOfAccount:
 *                               type: object
 *                               properties:
 *                                 accountNo:
 *                                   type: string
 *                                 accountName:
 *                                   type: string
 *                                 accountType:
 *                                   type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/", JournalEntryController.getJournalEntries);

// Create manual journal entry
router.post("/", JournalEntryController.createJournalEntry);

// Get journal entries by date range
router.get("/by-date-range", JournalEntryController.getJournalEntriesByDateRange);

// Audit trail sequential integrity (must be before /:id)
router.get("/audit-trail/last-entries", JournalEntryController.getLastAuditTrailEntries);
router.get("/audit-trail/verify-sequential", JournalEntryController.verifySequentialIntegrity);

// Get a specific journal entry by ID
router.get("/:id", JournalEntryController.getJournalEntry);

// Post a journal entry (change status from PENDING to POSTED)
router.patch("/:id/post", JournalEntryController.postJournalEntry);

// Void a journal entry (change status to VOID)
router.patch("/:id/void", JournalEntryController.voidJournalEntry);

// Update journal entry (PENDING only; posted/voided → 409 — ledger immutability)
router.patch("/:id", JournalEntryController.updateJournalEntry);

export default router; 