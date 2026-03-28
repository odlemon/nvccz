// @ts-nocheck
// routes/chartOfAccountsRoutes.ts

import express from "express";
import multer from "multer";
import { ChartOfAccountsController } from "../controllers/ChartOfAccountsController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

const uploadCoaCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.originalname.toLowerCase().endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are allowed"));
    }
  },
});

/**
 * @swagger
 * /api/accounting/chart-of-accounts:
 *   post:
 *     summary: Create a new chart of accounts entry
 *     description: Create a new account in the chart of accounts
 *     tags: [Accounting - Chart of Accounts]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - accountNo
 *               - accountName
 *               - accountType
 *               - financialStatement
 *             properties:
 *               accountNo:
 *                 type: string
 *                 description: Unique account number (e.g., "1000", "1010", "s5070")
 *                 example: "1000"
 *               accountName:
 *                 type: string
 *                 description: Account name
 *                 example: "Cash and Cash Equivalents"
 *               accountType:
 *                 type: string
 *                 enum: [Current Asset, Fixed Asset, Long-Term Asset, Contra-Asset, Current Liability, Long-Term Liability, Equity, Revenue, Expense, Income]
 *                 description: Type of account
 *                 example: "Current Asset"
 *               financialStatement:
 *                 type: string
 *                 enum: [Balance Sheet, Income Statement, Cash Flow / Tracking, Income Statement / Cash Flow]
 *                 description: Financial statement where this account appears
 *                 example: "Balance Sheet"
 *               notes:
 *                 type: string
 *                 description: Additional details, examples, or explanations
 *                 example: "Bank balances, petty cash"
 *               parentId:
 *                 type: string
 *                 description: ID of parent account (optional for hierarchical structure)
 *                 example: null
 *               isActive:
 *                 type: boolean
 *                 description: Whether the account is active
 *                 example: true
 *     responses:
 *       201:
 *         description: Chart of accounts entry created successfully
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
 *                   example: Chart of accounts entry created successfully
 *                 data:
 *                   $ref: '#/components/schemas/ChartOfAccounts'
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Conflict - account code already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/", authenticate, ChartOfAccountsController.createChartOfAccounts);

/**
 * @swagger
 * /api/accounting/chart-of-accounts:
 *   get:
 *     summary: Get all chart of accounts
 *     description: Retrieve all chart of accounts entries with optional filtering
 *     tags: [Accounting - Chart of Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: accountType
 *         schema:
 *           type: string
 *           enum: [ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE]
 *         description: Filter by account type
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: parentId
 *         schema:
 *           type: string
 *         description: Filter by parent account ID
 *     responses:
 *       200:
 *         description: Chart of accounts retrieved successfully
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
 *                     $ref: '#/components/schemas/ChartOfAccounts'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/", authenticate, ChartOfAccountsController.getAllChartOfAccounts);

/**
 * @swagger
 * /api/accounting/chart-of-accounts/{id}:
 *   get:
 *     summary: Get chart of accounts by ID
 *     description: Retrieve a specific chart of accounts entry by ID
 *     tags: [Accounting - Chart of Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Chart of accounts ID
 *     responses:
 *       200:
 *         description: Chart of accounts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ChartOfAccounts'
 *       404:
 *         description: Chart of accounts not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
/**
 * @swagger
 * /api/accounting/chart-of-accounts/with-journal-entries:
 *   get:
 *     summary: Get all chart of accounts with detailed journal entry lines
 *     description: Retrieve all chart of accounts entries with their associated journal entry lines, including summary statistics
 *     tags: [Accounting - Chart of Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: accountType
 *         schema:
 *           type: string
 *           enum: [Current Asset, Fixed Asset, Long-Term Asset, Contra-Asset, Current Liability, Long-Term Liability, Equity, Revenue, Expense, Income]
 *         description: Filter by account type
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: parentId
 *         schema:
 *           type: string
 *         description: Filter by parent account ID
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include inactive accounts in results
 *     responses:
 *       200:
 *         description: Chart of accounts with journal entry lines retrieved successfully
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
 *                   example: Chart of accounts with journal entry lines retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       accountNo:
 *                         type: string
 *                       accountName:
 *                         type: string
 *                       accountType:
 *                         type: string
 *                       financialStatement:
 *                         type: string
 *                       notes:
 *                         type: string
 *                       parentId:
 *                         type: string
 *                       isActive:
 *                         type: boolean
 *                       parent:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           accountNo:
 *                             type: string
 *                           accountName:
 *                             type: string
 *                           accountType:
 *                             type: string
 *                       children:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             accountNo:
 *                               type: string
 *                             accountName:
 *                               type: string
 *                             accountType:
 *                               type: string
 *                             isActive:
 *                               type: boolean
 *                       journalEntryLines:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             debitAmount:
 *                               type: string
 *                               format: decimal
 *                             creditAmount:
 *                               type: string
 *                               format: decimal
 *                             description:
 *                               type: string
 *                             vatAmount:
 *                               type: string
 *                               format: decimal
 *                             createdAt:
 *                               type: string
 *                               format: date-time
 *                             journalEntry:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: string
 *                                 referenceNumber:
 *                                   type: string
 *                                 transactionDate:
 *                                   type: string
 *                                   format: date-time
 *                                 description:
 *                                   type: string
 *                                 totalAmount:
 *                                   type: string
 *                                   format: decimal
 *                                 status:
 *                                   type: string
 *                                 currency:
 *                                   type: object
 *                                   properties:
 *                                     code:
 *                                       type: string
 *                                     symbol:
 *                                       type: string
 *                       _count:
 *                         type: object
 *                         properties:
 *                           journalEntryLines:
 *                             type: number
 *                           children:
 *                             type: number
 *                       summary:
 *                         type: object
 *                         properties:
 *                           totalDebits:
 *                             type: number
 *                           totalCredits:
 *                             type: number
 *                           netBalance:
 *                             type: number
 *                           transactionCount:
 *                             type: number
 *                           lastTransactionDate:
 *                             type: string
 *                             format: date-time
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/with-journal-entries", authenticate, ChartOfAccountsController.getAllChartOfAccountsWithJournalEntryLines);

/**
 * @swagger
 * /api/accounting/chart-of-accounts/bulk-import:
 *   post:
 *     summary: Bulk import chart of accounts from CSV
 *     description: >
 *       Upload a CSV; every row is validated (account number range vs type, required fields, duplicates in file,
 *       existing account numbers, optional parent). If any row fails, nothing is created and a row-by-row report is returned.
 *       If all rows pass, every account is created in a single database transaction.
 *     tags: [Accounting - Chart of Accounts]
 *     security:
 *       - bearerAuth: []
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
 *       201:
 *         description: All rows created — data includes createdCount and accounts
 *       400:
 *         description: Validation failed — nothing created; data includes rowErrors and reportLines
 */
router.post(
  "/bulk-import",
  authenticate,
  (req, res, next) => {
    uploadCoaCsv.single("file")(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          success: false,
          message: err.message || "Invalid file upload",
          timestamp: new Date().toISOString(),
        });
      }
      next();
    });
  },
  ChartOfAccountsController.bulkImportChartOfAccounts
);

router.get("/:id", authenticate, ChartOfAccountsController.getChartOfAccountsById);

/**
 * @swagger
 * /api/accounting/chart-of-accounts/{id}:
 *   put:
 *     summary: Update chart of accounts
 *     description: Update an existing chart of accounts entry
 *     tags: [Accounting - Chart of Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Chart of accounts ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountNo:
 *                 type: string
 *                 description: Unique account number
 *                 example: "1000"
 *               accountName:
 *                 type: string
 *                 description: Account name
 *                 example: "Cash and Cash Equivalents"
 *               accountType:
 *                 type: string
 *                 enum: [Current Asset, Fixed Asset, Long-Term Asset, Contra-Asset, Current Liability, Long-Term Liability, Equity, Revenue, Expense, Income]
 *                 description: Type of account
 *                 example: "Current Asset"
 *               financialStatement:
 *                 type: string
 *                 enum: [Balance Sheet, Income Statement, Cash Flow / Tracking, Income Statement / Cash Flow]
 *                 description: Financial statement where this account appears
 *                 example: "Balance Sheet"
 *               notes:
 *                 type: string
 *                 description: Additional details, examples, or explanations
 *                 example: "Bank balances, petty cash"
 *               parentId:
 *                 type: string
 *                 description: ID of parent account
 *                 example: null
 *               isActive:
 *                 type: boolean
 *                 description: Whether the account is active
 *                 example: true
 *               naturalBalance:
 *                 type: string
 *                 enum: [DEBIT, CREDIT]
 *                 description: Optional; must match the normal balance for the account type or request is rejected
 *     responses:
 *       200:
 *         description: Chart of accounts updated successfully
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
 *                   example: Chart of accounts updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/ChartOfAccounts'
 *       404:
 *         description: Chart of accounts not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Conflict - duplicate account number, or cannot reclassify account type / financial statement when journal lines exist
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       422:
 *         description: No updatable fields in body
 */
router.put("/:id", authenticate, ChartOfAccountsController.updateChartOfAccounts);

/**
 * @swagger
 * /api/accounting/chart-of-accounts/{id}:
 *   patch:
 *     summary: Partial update chart of accounts (same rules as PUT)
 *     description: Same validation and behaviour as PUT; use for partial edits from the UI.
 *     tags: [Accounting - Chart of Accounts]
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountNo: { type: string }
 *               accountName: { type: string }
 *               accountType:
 *                 type: string
 *                 enum: [Current Asset, Fixed Asset, Long-Term Asset, Contra-Asset, Current Liability, Long-Term Liability, Equity, Revenue, Expense, Income]
 *               financialStatement:
 *                 type: string
 *                 enum: [Balance Sheet, Income Statement, Cash Flow / Tracking, Income Statement / Cash Flow]
 *               notes: { type: string }
 *               parentId: { type: string, nullable: true }
 *               isActive: { type: boolean }
 *     responses:
 *       200:
 *         description: Updated
 *       400:
 *         description: Validation error
 *       409:
 *         description: Conflict (postings prevent reclassification, or duplicate account number)
 */
router.patch("/:id", authenticate, ChartOfAccountsController.updateChartOfAccounts);

/**
 * @swagger
 * /api/accounting/chart-of-accounts/{id}:
 *   delete:
 *     summary: Delete chart of accounts
 *     description: Delete a chart of accounts entry
 *     tags: [Accounting - Chart of Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Chart of accounts ID
 *     responses:
 *       200:
 *         description: Chart of accounts deleted successfully
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
 *                   example: Chart of accounts deleted successfully
 *       404:
 *         description: Chart of accounts not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete("/:id", authenticate, ChartOfAccountsController.deleteChartOfAccounts);

/**
 * @swagger
 * /api/accounting/chart-of-accounts/with-journal-entries:
 *   get:
 *     summary: Get all chart of accounts with detailed journal entry lines
 *     description: Retrieve all chart of accounts entries with their associated journal entry lines, including summary statistics
 *     tags: [Accounting - Chart of Accounts]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: accountType
 *         schema:
 *           type: string
 *           enum: [Current Asset, Fixed Asset, Long-Term Asset, Contra-Asset, Current Liability, Long-Term Liability, Equity, Revenue, Expense, Income]
 *         description: Filter by account type
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: parentId
 *         schema:
 *           type: string
 *         description: Filter by parent account ID
 *       - in: query
 *         name: includeInactive
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include inactive accounts in results
 *     responses:
 *       200:
 *         description: Chart of accounts with journal entry lines retrieved successfully
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
 *                   example: Chart of accounts with journal entry lines retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       accountNo:
 *                         type: string
 *                       accountName:
 *                         type: string
 *                       accountType:
 *                         type: string
 *                       financialStatement:
 *                         type: string
 *                       notes:
 *                         type: string
 *                       parentId:
 *                         type: string
 *                       isActive:
 *                         type: boolean
 *                       parent:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           accountNo:
 *                             type: string
 *                           accountName:
 *                             type: string
 *                           accountType:
 *                             type: string
 *                       children:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             accountNo:
 *                               type: string
 *                             accountName:
 *                               type: string
 *                             accountType:
 *                               type: string
 *                             isActive:
 *                               type: boolean
 *                       journalEntryLines:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             debitAmount:
 *                               type: string
 *                               format: decimal
 *                             creditAmount:
 *                               type: string
 *                               format: decimal
 *                             description:
 *                               type: string
 *                             vatAmount:
 *                               type: string
 *                               format: decimal
 *                             createdAt:
 *                               type: string
 *                               format: date-time
 *                             journalEntry:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: string
 *                                 referenceNumber:
 *                                   type: string
 *                                 transactionDate:
 *                                   type: string
 *                                   format: date-time
 *                                 description:
 *                                   type: string
 *                                 totalAmount:
 *                                   type: string
 *                                   format: decimal
 *                                 status:
 *                                   type: string
 *                                 currency:
 *                                   type: object
 *                                   properties:
 *                                     code:
 *                                       type: string
 *                                     symbol:
 *                                       type: string
 *                       _count:
 *                         type: object
 *                         properties:
 *                           journalEntryLines:
 *                             type: number
 *                           children:
 *                             type: number
 *                       summary:
 *                         type: object
 *                         properties:
 *                           totalDebits:
 *                             type: number
 *                           totalCredits:
 *                             type: number
 *                           netBalance:
 *                             type: number
 *                           transactionCount:
 *                             type: number
 *                           lastTransactionDate:
 *                             type: string
 *                             format: date-time
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
export default router; 