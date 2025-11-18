// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { PurchaseInvoiceController } from "../controllers/PurchaseInvoiceController";

const router = express.Router();

/**
 * @swagger
 * /accounting/purchase-invoices:
 *   post:
 *     summary: Create a new purchase invoice
 *     tags: [Accounts Payables]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - vendorId
 *               - invoiceDate
 *               - currencyId
 *               - items
 *             properties:
 *               vendorId:
 *                 type: string
 *               invoiceDate:
 *                 type: string
 *                 format: date-time
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *               currencyId:
 *                 type: string
 *               description:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     itemName:
 *                       type: string
 *                     description:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     unitPrice:
 *                       type: number
 *                     unit:
 *                       type: string
 *                     vatRate:
 *                       type: number
 *               isTaxable:
 *                 type: boolean
 *               invoiceNumber:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Purchase invoice created successfully
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
 *                     id:
 *                       type: string
 *                     invoiceNumber:
 *                       type: string
 *                       example: PINV-2025-001
 *                     vendorId:
 *                       type: string
 *                     subtotal:
 *                       type: number
 *                       example: 1650.00
 *                     vatAmount:
 *                       type: number
 *                       example: 247.50
 *                     totalAmount:
 *                       type: number
 *                       example: 1897.50
 *                     status:
 *                       type: string
 *                       example: DRAFT
 *                     paymentStatus:
 *                       type: string
 *                       example: PENDING
 *       400:
 *         description: Bad request - validation errors
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/",
  authenticate,
  PurchaseInvoiceController.createPurchaseInvoice
);

/**
 * @swagger
 * /accounting/purchase-invoices:
 *   get:
 *     summary: Get all purchase invoices
 *     tags: [Accounts Payables]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *         description: Filter by payment status
 *     responses:
 *       200:
 *         description: Purchase invoices retrieved successfully
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
 *                     invoices:
 *                       type: array
 *                       items:
 *                         type: object
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 */
router.get(
  "/",
  authenticate,
  PurchaseInvoiceController.getAllPurchaseInvoices
);

/**
 * @swagger
 * /accounting/purchase-invoices/expense-accounts:
 *   get:
 *     summary: Get expense accounts
 *     description: Retrieve all active expense accounts from chart of accounts. Use these account IDs when submitting purchase invoices.
 *     tags: [Accounts Payables]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Expense accounts retrieved successfully
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
 *                   example: Expense accounts retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: Expense account ID (use this in expenseAccountId field)
 *                         example: expense-account-id-here
 *                       accountNo:
 *                         type: string
 *                         description: Account number
 *                         example: "5010"
 *                       accountName:
 *                         type: string
 *                         description: Account name
 *                         example: "Office Supplies Expense"
 *                       accountType:
 *                         type: string
 *                         example: "Expense"
 *                       financialStatement:
 *                         type: string
 *                         example: "Income Statement"
 *                       notes:
 *                         type: string
 *                         example: "Office supplies and materials"
 *                       isActive:
 *                         type: boolean
 *                         example: true
 *             example:
 *               success: true
 *               message: Expense accounts retrieved successfully
 *               data:
 *                 - id: "expense-account-id-1"
 *                   accountNo: "5000"
 *                   accountName: "Rent Expense"
 *                   accountType: "Expense"
 *                   financialStatement: "Income Statement"
 *                   notes: "Office lease"
 *                   isActive: true
 *                 - id: "expense-account-id-2"
 *                   accountNo: "5010"
 *                   accountName: "Office Supplies Expense"
 *                   accountType: "Expense"
 *                   financialStatement: "Income Statement"
 *                   notes: "Office supplies and materials"
 *                   isActive: true
 *       401:
 *         description: Unauthorized
 */
router.get(
  "/expense-accounts",
  authenticate,
  PurchaseInvoiceController.getExpenseAccounts
);

/**
 * @swagger
 * /accounting/purchase-invoices/{id}:
 *   get:
 *     summary: Get purchase invoice by ID
 *     tags: [Accounts Payables]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Purchase invoice retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       404:
 *         description: Purchase invoice not found
 */
router.get(
  "/:id",
  authenticate,
  PurchaseInvoiceController.getPurchaseInvoiceById
);

/**
 * @swagger
 * /accounting/purchase-invoices/{id}:
 *   put:
 *     summary: Update purchase invoice
 *     description: Update a purchase invoice. Only DRAFT invoices can be updated. Currency cannot be changed after invoice creation.
 *     tags: [Accounts Payables]
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
 *               vendorId:
 *                 type: string
 *                 description: Vendor ID (can be changed)
 *               invoiceDate:
 *                 type: string
 *                 format: date-time
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *               description:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     itemName:
 *                       type: string
 *                     description:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     unitPrice:
 *                       type: number
 *                     unit:
 *                       type: string
 *                     vatRate:
 *                       type: number
 *               isTaxable:
 *                 type: boolean
 *                 description: If true, VAT will be calculated (15% default if not specified in items)
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Purchase invoice updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request - only DRAFT invoices can be updated, or currency cannot be changed
 */
router.put(
  "/:id",
  authenticate,
  PurchaseInvoiceController.updatePurchaseInvoice
);

/**
 * @swagger
 * /accounting/purchase-invoices/{id}:
 *   delete:
 *     summary: Delete purchase invoice
 *     tags: [Accounts Payables]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Purchase invoice deleted successfully
 */
router.delete(
  "/:id",
  authenticate,
  PurchaseInvoiceController.deletePurchaseInvoice
);

/**
 * @swagger
 * /accounting/purchase-invoices/{id}/submit:
 *   post:
 *     summary: Submit invoice (creates journal entries based on payment method)
 *     description: |
 *       Submits a DRAFT invoice and creates journal entries based on payment method:
 *       - BANK: Dr Expense Account, Dr VAT Input (if applicable), Cr Bank Account (bankId required)
 *       - CASH: Dr Expense Account, Dr VAT Input (if applicable), Cr Petty Cash (1030)
 *       - CREDIT: Dr Expense Account, Dr VAT Input (if applicable), Cr Accounts Payable (2000)
 *     tags: [Accounts Payables]
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
 *             required:
 *               - paymentMethod
 *               - expenseAccountId
 *             properties:
 *               paymentMethod:
 *                 type: string
 *                 enum: [BANK, CASH, CREDIT]
 *                 description: Payment method for the invoice (dropdown selection)
 *                 example: CREDIT
 *                 x-enum-varnames: [BANK, CASH, CREDIT]
 *               expenseAccountId:
 *                 type: string
 *                 description: The expense account to debit (e.g., Rent Expense, Office Supplies)
 *                 example: expense-account-id-here
 *               bankId:
 *                 type: string
 *                 description: Bank ID (REQUIRED when paymentMethod is BANK, ignored for CASH/CREDIT)
 *                 example: bank-id-here
 *           examples:
 *             bankPayment:
 *               summary: Bank Payment Example
 *               value:
 *                 paymentMethod: BANK
 *                 expenseAccountId: expense-account-id-here
 *                 bankId: bank-id-here
 *             cashPayment:
 *               summary: Cash Payment Example
 *               value:
 *                 paymentMethod: CASH
 *                 expenseAccountId: expense-account-id-here
 *             creditPayment:
 *               summary: Credit Payment Example
 *               value:
 *                 paymentMethod: CREDIT
 *                 expenseAccountId: expense-account-id-here
 *     responses:
 *       200:
 *         description: Invoice submitted successfully. Journal entry created based on payment method.
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
 *                   example: Invoice submitted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       example: POSTED
 *                     paymentMethod:
 *                       type: string
 *                       example: CREDIT
 *                     paymentStatus:
 *                       type: string
 *                       example: PENDING
 *                     journalEntry:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         referenceNumber:
 *                           type: string
 *                         status:
 *                           type: string
 *       400:
 *         description: Bad request - invoice must be in DRAFT status, or bankId required when paymentMethod is BANK
 */
router.post(
  "/:id/submit",
  authenticate,
  PurchaseInvoiceController.submitInvoice
);

/**
 * @swagger
 * /accounting/purchase-invoices/{id}/pay:
 *   post:
 *     summary: Pay invoice (creates cashbook payment entry for CREDIT invoices only)
 *     description: |
 *       Pays a CREDIT invoice by creating a cashbook payment entry which automatically creates a journal entry:
 *       - BANK: Dr Accounts Payable, Cr Bank Account
 *       - CASH: Dr Accounts Payable, Cr Cash Account
 *       Only invoices submitted with CREDIT payment method can be paid.
 *     tags: [Accounts Payables]
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
 *             required:
 *               - paymentMethod
 *               - paymentDate
 *             properties:
 *               paymentMethod:
 *                 type: string
 *                 enum: [BANK, CASH]
 *                 description: Payment method for paying the invoice
 *               bankId:
 *                 type: string
 *                 description: Bank ID (required if paymentMethod is BANK)
 *               paymentDate:
 *                 type: string
 *                 format: date-time
 *               paymentReference:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Invoice paid successfully. Cashbook payment entry created which automatically creates journal entry - Dr Accounts Payable, Cr Bank/Cash Account
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
 *                     id:
 *                       type: string
 *                     paymentStatus:
 *                       type: string
 *                       example: PAID
 *                     paidAmount:
 *                       type: number
 *                     outstandingAmount:
 *                       type: number
 *                     cashbookEntryId:
 *                       type: string
 *       400:
 *         description: Bad request - invoice must be submitted as CREDIT first
 */
router.post(
  "/:id/pay",
  authenticate,
  PurchaseInvoiceController.payInvoice
);

export default router;

