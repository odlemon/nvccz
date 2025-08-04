// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { expenseController } from "../controllers/ExpenseController";

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     CreateExpenseRequest:
 *       type: object
 *       required:
 *         - vendorId
 *         - categoryId
 *         - amount
 *         - currencyId
 *         - transactionDate
 *         - description
 *       properties:
 *         vendorId:
 *           type: string
 *           description: ID of the vendor
 *         categoryId:
 *           type: string
 *           description: ID of the expense category
 *         amount:
 *           type: number
 *           description: Base amount (excluding VAT)
 *         currencyId:
 *           type: string
 *           description: ID of the currency
 *         transactionDate:
 *           type: string
 *           format: date
 *           description: Date of the transaction
 *         description:
 *           type: string
 *           description: Description of the expense
 *         receiptNumber:
 *           type: string
 *           description: Receipt number (optional)
 *         isTaxable:
 *           type: boolean
 *           default: false
 *           description: Whether the expense is subject to VAT
 *     Expense:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         vendorId:
 *           type: string
 *         categoryId:
 *           type: string
 *         amount:
 *           type: number
 *         vatAmount:
 *           type: number
 *         totalAmount:
 *           type: number
 *         currencyId:
 *           type: string
 *         transactionDate:
 *           type: string
 *           format: date
 *         description:
 *           type: string
 *         receiptNumber:
 *           type: string
 *         isTaxable:
 *           type: boolean
 *         status:
 *           type: string
 *         journalEntryId:
 *           type: string
 *         createdById:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         vendor:
 *           $ref: '#/components/schemas/Vendor'
 *         category:
 *           $ref: '#/components/schemas/ExpenseCategory'
 *         currency:
 *           $ref: '#/components/schemas/Currency'
 *         journalEntry:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             referenceNumber:
 *               type: string
 *             status:
 *               type: string
 *     VATCalculationRequest:
 *       type: object
 *       required:
 *         - amount
 *       properties:
 *         amount:
 *           type: number
 *           description: Base amount to calculate VAT for
 *         isTaxable:
 *           type: boolean
 *           default: false
 *           description: Whether the amount is subject to VAT
 *     VATCalculationResponse:
 *       type: object
 *       properties:
 *         baseAmount:
 *           type: number
 *         vatAmount:
 *           type: number
 *         totalAmount:
 *           type: number
 *         vatRate:
 *           type: number
 *         isTaxable:
 *           type: boolean
 */

/**
 * @swagger
 * /api/accounting/expenses:
 *   post:
 *     summary: Create a new expense
 *     tags: [Accounting - Expenses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateExpenseRequest'
 *     responses:
 *       201:
 *         description: Expense created successfully
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
 *                   $ref: '#/components/schemas/Expense'
 *       400:
 *         description: Bad request - missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/", authenticate, expenseController.createExpense);

/**
 * @swagger
 * /api/accounting/expenses:
 *   get:
 *     summary: Get all expenses with filtering and pagination
 *     tags: [Accounting - Expenses]
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
 *         name: vendorId
 *         schema:
 *           type: string
 *         description: Filter by vendor ID
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *         description: Filter by category ID
 *       - in: query
 *         name: currencyId
 *         schema:
 *           type: string
 *         description: Filter by currency ID
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by start date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by end date
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: List of expenses
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Expense'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/", authenticate, expenseController.getExpenses);

/**
 * @swagger
 * /api/accounting/expenses/{id}:
 *   get:
 *     summary: Get expense by ID
 *     tags: [Accounting - Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Expense ID
 *     responses:
 *       200:
 *         description: Expense details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Expense'
 *       404:
 *         description: Expense not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/:id", authenticate, expenseController.getExpenseById);

/**
 * @swagger
 * /api/accounting/expenses/{id}:
 *   put:
 *     summary: Update an expense
 *     tags: [Accounting - Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Expense ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateExpenseRequest'
 *     responses:
 *       200:
 *         description: Expense updated successfully
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
 *                   $ref: '#/components/schemas/Expense'
 *       404:
 *         description: Expense not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put("/:id", authenticate, expenseController.updateExpense);

/**
 * @swagger
 * /api/accounting/expenses/{id}:
 *   delete:
 *     summary: Delete an expense (soft delete)
 *     tags: [Accounting - Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Expense ID
 *     responses:
 *       200:
 *         description: Expense deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Expense not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete("/:id", authenticate, expenseController.deleteExpense);

/**
 * @swagger
 * /api/accounting/expenses/summary:
 *   get:
 *     summary: Get expense summary statistics
 *     tags: [Accounting - Expenses]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for summary
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for summary
 *       - in: query
 *         name: currencyId
 *         schema:
 *           type: string
 *         description: Filter by currency ID
 *     responses:
 *       200:
 *         description: Expense summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalExpenses:
 *                       type: number
 *                     totalVAT:
 *                       type: number
 *                     averageExpense:
 *                       type: number
 *                     expenseCount:
 *                       type: integer
 *                     byCategory:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           categoryName:
 *                             type: string
 *                           total:
 *                             type: number
 *                           count:
 *                             type: integer
 *                     byVendor:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           vendorName:
 *                             type: string
 *                           total:
 *                             type: number
 *                           count:
 *                             type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/summary", authenticate, expenseController.getExpenseSummary);

/**
 * @swagger
 * /api/accounting/expenses/calculate-vat:
 *   post:
 *     summary: Calculate VAT for a given amount
 *     tags: [Accounting - Expenses]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VATCalculationRequest'
 *     responses:
 *       200:
 *         description: VAT calculation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/VATCalculationResponse'
 *       400:
 *         description: Bad request - amount is required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/calculate-vat", authenticate, expenseController.calculateVAT);

export default router; 