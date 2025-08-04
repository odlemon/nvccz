// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import JournalEntryController from "../controllers/JournalEntryController";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * /api/accounting/journal-entries:
 *   get:
 *     summary: Get all journal entries
 *     description: Retrieve all journal entries with optional date filtering
 *     tags: [Accounting - Journal Entries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
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
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for filtering
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for filtering
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
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/JournalEntry'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/", JournalEntryController.getJournalEntries);

/**
 * @swagger
 * /api/accounting/journal-entries/{id}:
 *   get:
 *     summary: Get journal entry by ID
 *     description: Retrieve a specific journal entry with all its lines
 *     tags: [Accounting - Journal Entries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Journal entry ID
 *     responses:
 *       200:
 *         description: Journal entry retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     journalEntry:
 *                       $ref: '#/components/schemas/JournalEntry'
 *                     journalEntryLines:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/JournalEntryLine'
 *       404:
 *         description: Journal entry not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/:id", JournalEntryController.getJournalEntryById);

/**
 * @swagger
 * /api/accounting/journal-entries/{id}/validate:
 *   get:
 *     summary: Validate journal entry balance by ID
 *     description: Validate that a specific journal entry is balanced (debits = credits)
 *     tags: [Accounting - Journal Entries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Journal entry ID
 *     responses:
 *       200:
 *         description: Validation completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     isBalanced:
 *                       type: boolean
 *                       description: Whether the journal entry is balanced
 *                     totalDebits:
 *                       type: number
 *                       description: Total debit amount
 *                     totalCredits:
 *                       type: number
 *                       description: Total credit amount
 *                     difference:
 *                       type: number
 *                       description: Difference between debits and credits
 *                     message:
 *                       type: string
 *                       description: Validation message
 *       404:
 *         description: Journal entry not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/:id/validate", JournalEntryController.validateJournalEntryById);

/**
 * @swagger
 * /api/accounting/journal-entries/validate:
 *   post:
 *     summary: Validate journal entry balance
 *     description: Check if a journal entry is balanced (debits equal credits)
 *     tags: [Accounting - Journal Entries]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               journalEntryLines:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     debitAmount:
 *                       type: number
 *                     creditAmount:
 *                       type: number
 *     responses:
 *       200:
 *         description: Validation completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     isValid:
 *                       type: boolean
 *                     message:
 *                       type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/validate", JournalEntryController.validateBalance);

export default router; 