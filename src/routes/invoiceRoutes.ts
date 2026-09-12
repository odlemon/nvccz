// @ts-nocheck
import express from "express";
import { InvoiceController } from "../controllers/InvoiceController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * /api/accounting/invoices:
 *   post:
 *     summary: Create a new invoice
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customerId
 *               - amount
 *               - currencyId
 *               - transactionDate
 *               - description
 *             properties:
 *               customerId:
 *                 type: string
 *                 description: ID of the customer
 *                 example: clx1234567890abcdef
 *               amount:
 *                 type: number
 *                 description: Invoice base amount (before VAT)
 *                 example: 1000.00
 *               currencyId:
 *                 type: string
 *                 description: ID of the currency
 *                 example: clx1234567890abcdef
 *               transactionDate:
 *                 type: string
 *                 format: date
 *                 description: Transaction date
 *                 example: "2025-08-05"
 *               description:
 *                 type: string
 *                 description: Invoice description
 *                 example: "Management Fees Q4 2024"
 *               invoiceNumber:
 *                 type: string
 *                 description: Custom invoice number (optional, auto-generated if not provided)
 *                 example: "INV_20260115_0001"
 *               isTaxable:
 *                 type: boolean
 *                 description: Whether the invoice is taxable (15.5% VAT in Zimbabwe)
 *                 example: true
 *               items:
 *                 type: array
 *                 description: Array of invoice line items
 *                 items:
 *                   type: object
 *                   properties:
 *                     description:
 *                       type: string
 *                       example: "Management Fee Q4 2024"
 *                     amount:
 *                       type: number
 *                       example: 1000.00
 *                     category:
 *                       type: string
 *                       example: "Management Fees"
 *     responses:
 *       201:
 *         description: Invoice created successfully
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
 *                   example: "Invoice created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Invoice'
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/", InvoiceController.createInvoice);

/**
 * @swagger
 * /api/accounting/invoices:
 *   get:
 *     summary: Get invoices with filtering and pagination
 *     tags: [Invoices]
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
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Filter by customer ID
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
 *         description: Invoices retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/", InvoiceController.getInvoices);

/**
 * @swagger
 * /api/accounting/invoices/debtors-age-analysis:
 *   get:
 *     summary: Debtors age analysis (open receivables by bucket)
 *     description: Buckets outstanding SENT/PARTIALLY_PAID invoices using dueDate when set, else transactionDate. Short column titles follow common layouts (31–60 → "60 Days", 61–90 → "90 Days").
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: asOfDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Report date (UTC day); defaults to today
 *     responses:
 *       200:
 *         description: Report payload
 *       401:
 *         description: Unauthorized
 */
router.get("/debtors-age-analysis", InvoiceController.getDebtorsAgeAnalysis);

/**
 * @swagger
 * /api/accounting/invoices/{id}:
 *   get:
 *     summary: Get invoice by ID
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invoice ID
 *     responses:
 *       200:
 *         description: Invoice retrieved successfully
 *       404:
 *         description: Invoice not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/:id", InvoiceController.getInvoiceById);

/**
 * @swagger
 * /api/accounting/invoices/{id}:
 *   put:
 *     summary: Update an invoice
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invoice ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               customerId:
 *                 type: string
 *                 description: ID of the customer
 *               categoryId:
 *                 type: string
 *                 description: ID of the invoice category
 *               amount:
 *                 type: number
 *                 description: Invoice amount
 *               currencyId:
 *                 type: string
 *                 description: ID of the currency
 *               transactionDate:
 *                 type: string
 *                 format: date
 *                 description: Transaction date
 *               description:
 *                 type: string
 *                 description: Invoice description
 *               invoiceNumber:
 *                 type: string
 *                 description: Custom invoice number
 *               isTaxable:
 *                 type: boolean
 *                 description: Whether the invoice is taxable
 *     responses:
 *       200:
 *         description: Invoice updated successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Invoice not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put("/:id", InvoiceController.updateInvoice);

/**
 * @swagger
 * /api/accounting/invoices/{id}:
 *   delete:
 *     summary: Delete an invoice
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invoice ID
 *     responses:
 *       200:
 *         description: Invoice deleted successfully
 *       404:
 *         description: Invoice not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete("/:id", InvoiceController.deleteInvoice);

/**
 * @swagger
 * /api/accounting/invoices/summary:
 *   get:
 *     summary: Get invoice summary statistics
 *     tags: [Invoices]
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
 *         description: Invoice summary retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/summary", InvoiceController.getInvoiceSummary);

/**
 * @swagger
 * /api/accounting/invoices/{id}/send:
 *   patch:
 *     summary: Send invoice to customer (DRAFT -> SENT)
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invoice ID
 *     responses:
 *       200:
 *         description: Invoice sent successfully
 *       400:
 *         description: Bad request - invoice not in DRAFT status
 *       404:
 *         description: Invoice not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.patch("/:id/send", InvoiceController.sendInvoice);

/**
 * @swagger
 * /api/accounting/invoices/{id}/mark-as-paid:
 *   patch:
 *     summary: Record payment (SENT or PARTIALLY_PAID -> PAID or PARTIALLY_PAID)
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invoice ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               paymentMethod:
 *                 type: string
 *                 enum: [CASH, BANK, CREDIT]
 *                 default: BANK
 *                 description: Payment method used
 *               paymentAmount:
 *                 type: number
 *                 description: Amount received in invoice currency (ZiG/ZWL). If less than outstanding, invoice stays PARTIALLY_PAID; omit to pay remaining balance in full.
 *               paymentCurrencyId:
 *                 type: string
 *                 description: Optional; must match invoice currency for partial payments (same-currency path).
 *     responses:
 *       200:
 *         description: Payment recorded; status PAID or PARTIALLY_PAID
 *       400:
 *         description: Bad request - invoice cannot accept payment in current status
 *       404:
 *         description: Invoice not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.patch("/:id/mark-as-paid", InvoiceController.markAsPaid);

/**
 * @swagger
 * /api/accounting/invoices/{id}/void:
 *   patch:
 *     summary: Void invoice (any status -> VOID)
 *     tags: [Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Invoice ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Optional reason for voiding the invoice
 *     responses:
 *       200:
 *         description: Invoice voided successfully
 *       400:
 *         description: Bad request - invoice already voided
 *       404:
 *         description: Invoice not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.patch("/:id/void", InvoiceController.voidInvoice);



export default router; 