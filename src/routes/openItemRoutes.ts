// @ts-nocheck
// Open Item Routes
// Handles Open Item matching endpoints

import express from "express";
import OpenItemController from "../controllers/OpenItemController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * /api/cashbook/customers/{customerId}/invoices:
 *   get:
 *     summary: Get customer invoices for Open Item matching
 *     description: Get open invoices for a customer to enable payment allocation
 *     tags: [Open Items]
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: Customer invoices retrieved successfully
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
 *                       invoiceNumber:
 *                         type: string
 *                       invoiceDate:
 *                         type: string
 *                         format: date
 *                       dueDate:
 *                         type: string
 *                         format: date
 *                       totalAmount:
 *                         type: number
 *                       paidAmount:
 *                         type: number
 *                       outstandingAmount:
 *                         type: number
 *                       status:
 *                         type: string
 *                       currency:
 *                         type: string
 */
router.get("/customers/:customerId/invoices", OpenItemController.getCustomerInvoices);

/**
 * @swagger
 * /api/cashbook/vendors/{vendorId}/invoices:
 *   get:
 *     summary: Get vendor invoices for Open Item matching
 *     description: Get open invoices for a vendor to enable payment allocation
 *     tags: [Open Items]
 *     parameters:
 *       - in: path
 *         name: vendorId
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
 *     responses:
 *       200:
 *         description: Vendor invoices retrieved successfully
 */
router.get("/vendors/:vendorId/invoices", OpenItemController.getVendorInvoices);

/**
 * @swagger
 * /api/cashbook/receipts/{id}/allocate:
 *   post:
 *     summary: Allocate receipt payment to invoices
 *     description: Allocate a receipt payment to specific customer invoices
 *     tags: [Open Items]
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
 *               - allocations
 *             properties:
 *               allocations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - invoiceId
 *                     - allocatedAmount
 *                   properties:
 *                     invoiceId:
 *                       type: string
 *                     allocatedAmount:
 *                       type: number
 *                     discountAmount:
 *                       type: number
 *                     notes:
 *                       type: string
 *     responses:
 *       200:
 *         description: Payment allocated successfully
 */
router.post("/receipts/:id/allocate", OpenItemController.allocatePayment);

/**
 * @swagger
 * /api/cashbook/payments/{id}/allocate:
 *   post:
 *     summary: Allocate payment to vendor invoices
 *     description: Allocate a payment to specific vendor invoices
 *     tags: [Open Items]
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
 *               - allocations
 *             properties:
 *               allocations:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - invoiceId
 *                     - allocatedAmount
 *                   properties:
 *                     invoiceId:
 *                       type: string
 *                     allocatedAmount:
 *                       type: number
 *                     discountAmount:
 *                       type: number
 *                     notes:
 *                       type: string
 *     responses:
 *       200:
 *         description: Payment allocated successfully
 */
router.post("/payments/:id/allocate", OpenItemController.allocatePayment);

/**
 * @swagger
 * /api/cashbook/receipts/{id}/allocations:
 *   get:
 *     summary: Get receipt payment allocations
 *     description: Get payment allocations for a receipt
 *     tags: [Open Items]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Cashbook entry ID
 *     responses:
 *       200:
 *         description: Payment allocations retrieved successfully
 */
router.get("/receipts/:id/allocations", OpenItemController.getPaymentAllocations);

/**
 * @swagger
 * /api/cashbook/payments/{id}/allocations:
 *   get:
 *     summary: Get payment allocations
 *     description: Get payment allocations for a payment
 *     tags: [Open Items]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Cashbook entry ID
 *     responses:
 *       200:
 *         description: Payment allocations retrieved successfully
 */
router.get("/payments/:id/allocations", OpenItemController.getPaymentAllocations);

/**
 * @swagger
 * /api/cashbook/open-items/aging:
 *   get:
 *     summary: Get Open Item aging report
 *     description: Get aging report for all open items (customer and vendor invoices)
 *     tags: [Open Items]
 *     responses:
 *       200:
 *         description: Open Item aging report retrieved successfully
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
 *                     customers:
 *                       type: object
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           current:
 *                             type: number
 *                           days30:
 *                             type: number
 *                           days60:
 *                             type: number
 *                           days90:
 *                             type: number
 *                           over90:
 *                             type: number
 *                           total:
 *                             type: number
 *                     vendors:
 *                       type: object
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           current:
 *                             type: number
 *                           days30:
 *                             type: number
 *                           days60:
 *                             type: number
 *                           days90:
 *                             type: number
 *                           over90:
 *                             type: number
 *                           total:
 *                             type: number
 */
router.get("/open-items/aging", OpenItemController.getOpenItemAging);

/**
 * @swagger
 * /api/cashbook/customers/{customerId}/open-items:
 *   get:
 *     summary: Get customer Open Items summary
 *     description: Get Open Items summary for a specific customer
 *     tags: [Open Items]
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: Customer Open Items retrieved successfully
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
 *                       format: date
 *                     newestInvoice:
 *                       type: string
 *                       format: date
 */
router.get("/customers/:customerId/open-items", OpenItemController.getCustomerOpenItems);

/**
 * @swagger
 * /api/cashbook/allocations/{allocationId}:
 *   delete:
 *     summary: Remove payment allocation
 *     description: Remove a payment allocation
 *     tags: [Open Items]
 *     parameters:
 *       - in: path
 *         name: allocationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Allocation ID
 *     responses:
 *       200:
 *         description: Payment allocation removed successfully
 */
router.delete("/allocations/:allocationId", OpenItemController.removePaymentAllocation);

export default router;


