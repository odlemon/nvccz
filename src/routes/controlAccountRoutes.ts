import { Router } from 'express';
import ControlAccountController from '../controllers/ControlAccountController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// Apply authentication middleware to all routes
router.use(authenticateToken);

/**
 * @swagger
 * /api/cashbook/customers/{customerId}/payment-summary:
 *   get:
 *     summary: Get customer payment summary
 *     tags: [Control Account Integration]
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
 *         description: Customer payment summary retrieved successfully
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
 *                     totalOutstanding:
 *                       type: number
 *                     invoiceCount:
 *                       type: number
 *                     oldestInvoice:
 *                       type: string
 *                       format: date-time
 *                     newestInvoice:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/customers/:customerId/payment-summary', ControlAccountController.getCustomerPaymentSummary);

/**
 * @swagger
 * /api/cashbook/suppliers/{vendorId}/payment-summary:
 *   get:
 *     summary: Get supplier payment summary
 *     tags: [Control Account Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: vendorId
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
 *     responses:
 *       200:
 *         description: Supplier payment summary retrieved successfully
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
 *                     totalOutstanding:
 *                       type: number
 *                     invoiceCount:
 *                       type: number
 *                     oldestInvoice:
 *                       type: string
 *                       format: date-time
 *                     newestInvoice:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/suppliers/:vendorId/payment-summary', ControlAccountController.getSupplierPaymentSummary);

/**
 * @swagger
 * /api/cashbook/customers/{customerId}/apply-payment:
 *   post:
 *     summary: Apply customer payment to invoices
 *     tags: [Control Account Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cashbookEntryId
 *               - amount
 *             properties:
 *               cashbookEntryId:
 *                 type: string
 *                 description: Cashbook entry ID
 *               amount:
 *                 type: number
 *                 description: Payment amount
 *               autoAllocate:
 *                 type: boolean
 *                 description: Whether to auto-allocate to oldest invoices
 *                 default: false
 *     responses:
 *       200:
 *         description: Payment applied successfully
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
 *                     success:
 *                       type: boolean
 *                     message:
 *                       type: string
 *                     allocations:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/customers/:customerId/apply-payment', ControlAccountController.applyCustomerPayment);

/**
 * @swagger
 * /api/cashbook/suppliers/{vendorId}/apply-payment:
 *   post:
 *     summary: Apply supplier payment to bills
 *     tags: [Control Account Integration]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: vendorId
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cashbookEntryId
 *               - amount
 *             properties:
 *               cashbookEntryId:
 *                 type: string
 *                 description: Cashbook entry ID
 *               amount:
 *                 type: number
 *                 description: Payment amount
 *               autoAllocate:
 *                 type: boolean
 *                 description: Whether to auto-allocate to oldest invoices
 *                 default: false
 *     responses:
 *       200:
 *         description: Payment applied successfully
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
 *                     success:
 *                       type: boolean
 *                     message:
 *                       type: string
 *                     allocations:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/suppliers/:vendorId/apply-payment', ControlAccountController.applySupplierPayment);

export default router;
