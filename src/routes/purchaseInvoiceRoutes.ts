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
 *               isTaxable:
 *                 type: boolean
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
 *         description: Bad request - only DRAFT invoices can be updated
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
 * /accounting/purchase-invoices/{id}/mark-as-credit:
 *   post:
 *     summary: Mark invoice as credit (creates Accounts Payable journal entry)
 *     description: Creates a journal entry - Dr Expense Account, Dr VAT Input (if applicable), Cr Accounts Payable (2000)
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
 *               - expenseAccountId
 *             properties:
 *               expenseAccountId:
 *                 type: string
 *                 description: The expense account to debit
 *     responses:
 *       200:
 *         description: Invoice marked as credit successfully. Journal entry created - Dr Expense Account, Dr VAT Input (if applicable), Cr Accounts Payable (2000)
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
 *                     status:
 *                       type: string
 *                       example: POSTED
 *                     paymentMethod:
 *                       type: string
 *                       example: CREDIT
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
 *         description: Bad request - invoice must be in DRAFT status
 */
router.post(
  "/:id/mark-as-credit",
  authenticate,
  PurchaseInvoiceController.markAsCredit
);

/**
 * @swagger
 * /accounting/purchase-invoices/{id}/pay:
 *   post:
 *     summary: Pay invoice (creates cashbook payment entry)
 *     description: Creates a cashbook payment entry which automatically creates a journal entry - Dr Accounts Payable, Cr Bank Account
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
 *               - bankId
 *               - paymentDate
 *             properties:
 *               bankId:
 *                 type: string
 *               paymentDate:
 *                 type: string
 *                 format: date-time
 *               paymentReference:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Invoice paid successfully. Cashbook payment entry created which automatically creates journal entry - Dr Accounts Payable, Cr Bank Account
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
 *         description: Bad request - invoice must be marked as credit first
 */
router.post(
  "/:id/pay",
  authenticate,
  PurchaseInvoiceController.payInvoice
);

export default router;

