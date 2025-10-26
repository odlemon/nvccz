// @ts-nocheck
import express from "express";
import { OpenItemMatchingController } from "../controllers/OpenItemMatchingController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * /api/cashbook/open-items/customers/{customerId}:
 *   get:
 *     summary: Get open invoices for customer
 *     description: Get all open invoices for a specific customer that can be matched with payments
 *     tags: [Cashbook - Open Item Matching]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: Open invoices retrieved successfully
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
 *                       customerId:
 *                         type: string
 *                       invoiceNumber:
 *                         type: string
 *                       invoiceDate:
 *                         type: string
 *                         format: date
 *                       dueDate:
 *                         type: string
 *                         format: date
 *                       originalAmount:
 *                         type: number
 *                       outstandingAmount:
 *                         type: number
 *                       currency:
 *                         type: string
 *                       description:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [OPEN, PARTIALLY_PAID, FULLY_PAID, OVERDUE]
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/customers/:customerId", OpenItemMatchingController.getCustomerOpenItems);

/**
 * @swagger
 * /api/cashbook/open-items/suppliers/{supplierId}:
 *   get:
 *     summary: Get open invoices for supplier
 *     description: Get all open invoices for a specific supplier that can be matched with payments
 *     tags: [Cashbook - Open Item Matching]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: supplierId
 *         required: true
 *         schema:
 *           type: string
 *         description: Supplier ID
 *     responses:
 *       200:
 *         description: Open invoices retrieved successfully
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
 *                       supplierId:
 *                         type: string
 *                       invoiceNumber:
 *                         type: string
 *                       invoiceDate:
 *                         type: string
 *                         format: date
 *                       dueDate:
 *                         type: string
 *                         format: date
 *                       originalAmount:
 *                         type: number
 *                       outstandingAmount:
 *                         type: number
 *                       currency:
 *                         type: string
 *                       description:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [OPEN, PARTIALLY_PAID, FULLY_PAID, OVERDUE]
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/suppliers/:supplierId", OpenItemMatchingController.getSupplierOpenItems);

/**
 * @swagger
 * /api/cashbook/open-items/match:
 *   post:
 *     summary: Match payment to invoices
 *     description: Match a payment to specific invoices with allocation amounts
 *     tags: [Cashbook - Open Item Matching]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - allocations
 *             properties:
 *               allocations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - openItemId
 *                     - allocatedAmount
 *                   properties:
 *                     openItemId:
 *                       type: string
 *                       description: Invoice ID to allocate payment to
 *                     allocatedAmount:
 *                       type: number
 *                       description: Amount to allocate to this invoice
 *                     discountAmount:
 *                       type: number
 *                       description: Discount amount applied
 *                     description:
 *                       type: string
 *                       description: Allocation description
 *     responses:
 *       200:
 *         description: Payment matched successfully
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
 *                     paymentId:
 *                       type: string
 *                     allocations:
 *                       type: array
 *                       items:
 *                         type: object
 *                     totalAllocated:
 *                       type: number
 *                     remainingAmount:
 *                       type: number
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/match/:paymentId", OpenItemMatchingController.matchPaymentToInvoices);

/**
 * @swagger
 * /api/cashbook/open-items/unmatch:
 *   post:
 *     summary: Unmatch payment from invoices
 *     description: Remove payment allocations from specific invoices
 *     tags: [Cashbook - Open Item Matching]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - paymentId
 *               - allocationIds
 *             properties:
 *               paymentId:
 *                 type: string
 *                 description: Payment ID
 *               allocationIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of allocation IDs to remove
 *     responses:
 *       200:
 *         description: Payment unmatched successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/unmatch", OpenItemMatchingController.unmatchPaymentFromInvoices);

/**
 * @swagger
 * /api/cashbook/open-items/allocations/{paymentId}:
 *   get:
 *     summary: Get payment allocations
 *     description: Get all payment allocations for a specific payment
 *     tags: [Cashbook - Open Item Matching]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *         description: Payment ID
 *     responses:
 *       200:
 *         description: Payment allocations retrieved successfully
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
 *                       paymentId:
 *                         type: string
 *                       invoiceId:
 *                         type: string
 *                       allocatedAmount:
 *                         type: number
 *                       discountAmount:
 *                         type: number
 *                       description:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       invoice:
 *                         type: object
 *                         properties:
 *                           invoiceNumber:
 *                             type: string
 *                           customer:
 *                             type: object
 *                           supplier:
 *                             type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/allocations/:paymentId", OpenItemMatchingController.getPaymentAllocations);

/**
 * @swagger
 * /api/cashbook/open-items/summary:
 *   get:
 *     summary: Get matching summary
 *     description: Get summary of open items and matching statistics
 *     tags: [Cashbook - Open Item Matching]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Filter by customer ID
 *       - in: query
 *         name: supplierId
 *         schema:
 *           type: string
 *         description: Filter by supplier ID
 *     responses:
 *       200:
 *         description: Matching summary retrieved successfully
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
 *                     totalOpenInvoices:
 *                       type: number
 *                     totalOutstanding:
 *                       type: number
 *                     overdueCount:
 *                       type: number
 *                     overdueAmount:
 *                       type: number
 *                     currency:
 *                       type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/summary", OpenItemMatchingController.getMatchingSummary);

export default router;
