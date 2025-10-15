// @ts-nocheck
import express from "express";
import { ProcurementController } from "../controllers/ProcurementController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/procurement/requisitions:
 *   post:
 *     summary: Create a new purchase requisition
 *     tags: [Procurement]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - items
 *             properties:
 *               title:
 *                 type: string
 *                 description: Requisition title
 *               description:
 *                 type: string
 *                 description: Requisition description
 *               department:
 *                 type: string
 *                 enum: [Finance, Operations, Procurement, "Human Resources", Marketing, Legal, IT]
 *                 description: Department (hardcoded values)
 *               priority:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH, URGENT]
 *                 description: Priority level
 *               justification:
 *                 type: string
 *                 description: Business justification
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - itemName
 *                     - quantity
 *                   properties:
 *                     itemName:
 *                       type: string
 *                     description:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     unit:
 *                       type: string
 *                     specifications:
 *                       type: object
 *     responses:
 *       201:
 *         description: Purchase requisition created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/requisitions", ProcurementController.createPurchaseRequisition);

/**
 * @swagger
 * /api/procurement/requisitions:
 *   get:
 *     summary: Get all purchase requisitions
 *     tags: [Procurement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, PENDING_APPROVAL, APPROVED, REJECTED, CONVERTED_TO_PO]
 *         description: Filter by status
 *       - in: query
 *         name: departmentId
 *         schema:
 *           type: string
 *         description: Filter by department
 *       - in: query
 *         name: requestedById
 *         schema:
 *           type: string
 *         description: Filter by requester
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [LOW, MEDIUM, HIGH, URGENT]
 *         description: Filter by priority
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of items to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of items to skip
 *     responses:
 *       200:
 *         description: List of purchase requisitions
 *       401:
 *         description: Unauthorized
 */
// Note: More specific routes must come BEFORE general routes

/**
 * @swagger
 * /api/procurement/requisitions/my:
 *   get:
 *     summary: Get my purchase requisitions (created by logged-in user)
 *     tags: [Procurement]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of purchase requisitions created by the logged-in user
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
 *                 count:
 *                   type: number
 *       401:
 *         description: Unauthorized
 */
router.get("/requisitions/my", ProcurementController.getMyPurchaseRequisitions);

/**
 * @swagger
 * /api/procurement/requisitions/pending-approval:
 *   get:
 *     summary: Get pending requisitions for department head approval (their department only)
 *     tags: [Procurement]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending requisitions for the department head's department
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
 *                 count:
 *                   type: number
 *       401:
 *         description: Unauthorized or user is not a department head
 */
router.get("/requisitions/pending-approval", ProcurementController.getPendingRequisitionsForDepartmentHead);
router.get("/requisitions", ProcurementController.getAllPurchaseRequisitions);

/**
 * @swagger
 * /api/procurement/requisitions/{id}:
 *   get:
 *     summary: Get purchase requisition by ID
 *     tags: [Procurement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Requisition ID
 *     responses:
 *       200:
 *         description: Purchase requisition details
 *       404:
 *         description: Requisition not found
 *       401:
 *         description: Unauthorized
 */
router.get("/requisitions/:id", ProcurementController.getPurchaseRequisitionById);

/**
 * @swagger
 * /api/procurement/requisitions/{id}/submit:
 *   put:
 *     summary: Submit a purchase requisition for approval
 *     tags: [Procurement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Requisition ID
 *     responses:
 *       200:
 *         description: Requisition submitted for approval
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.put("/requisitions/:id/submit", ProcurementController.submitPurchaseRequisition);

/**
 * @swagger
 * /api/procurement/requisitions/{id}/approve:
 *   put:
 *     summary: Approve a purchase requisition
 *     tags: [Procurement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Requisition ID
 *     responses:
 *       200:
 *         description: Requisition approved successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.put("/requisitions/:id/approve", ProcurementController.approvePurchaseRequisition);

/**
 * @swagger
 * /api/procurement/purchase-orders:
 *   post:
 *     summary: Create a new purchase order
 *     tags: [Procurement]
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
 *               - items
 *             properties:
 *               requisitionId:
 *                 type: string
 *                 description: Source requisition ID
 *               vendorId:
 *                 type: string
 *                 description: Vendor ID
 *               priority:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH, URGENT]
 *                 description: Priority level
 *               currencyId:
 *                 type: string
 *                 description: Currency ID
 *               expectedDeliveryDate:
 *                 type: string
 *                 format: date-time
 *                 description: Expected delivery date
 *               shippingAddress:
 *                 type: string
 *                 description: Shipping address
 *               paymentTerms:
 *                 type: string
 *                 description: Payment terms
 *               deliveryTerms:
 *                 type: string
 *                 description: Delivery terms
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - itemName
 *                     - quantity
 *                     - unitPrice
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
 *                     specifications:
 *                       type: object
 *     responses:
 *       201:
 *         description: Purchase order created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/purchase-orders", ProcurementController.createPurchaseOrder);

/**
 * @swagger
 * /api/procurement/purchase-orders:
 *   get:
 *     summary: Get all purchase orders
 *     tags: [Procurement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, SENT, ACKNOWLEDGED, PARTIALLY_RECEIVED, RECEIVED, CANCELLED]
 *         description: Filter by status
 *       - in: query
 *         name: vendorId
 *         schema:
 *           type: string
 *         description: Filter by vendor
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [LOW, MEDIUM, HIGH, URGENT]
 *         description: Filter by priority
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of items to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of items to skip
 *     responses:
 *       200:
 *         description: List of purchase orders
 *       401:
 *         description: Unauthorized
 */
router.get("/purchase-orders", ProcurementController.getAllPurchaseOrders);

/**
 * @swagger
 * /api/procurement/purchase-orders/{id}/send:
 *   post:
 *     summary: Send purchase order to vendor via email
 *     tags: [Procurement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Purchase Order ID
 *     responses:
 *       200:
 *         description: Purchase order sent successfully
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
 *                   example: "Purchase order sent to vendor successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     poNumber:
 *                       type: string
 *                       example: "PO-2025-001"
 *                     status:
 *                       type: string
 *                       example: "SENT"
 *                     sentAt:
 *                       type: string
 *                       format: date-time
 *                     vendor:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *       400:
 *         description: Bad request (PO already sent, vendor email missing, etc.)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Purchase order not found
 */
router.post("/purchase-orders/:id/send", ProcurementController.sendPurchaseOrder);

/**
 * @swagger
 * /api/procurement/rfq:
 *   post:
 *     summary: Create and send RFQ to multiple vendors
 *     tags: [Procurement]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - vendorIds
 *               - items
 *             properties:
 *               requisitionId:
 *                 type: string
 *                 description: Link to approved requisition
 *               title:
 *                 type: string
 *                 description: RFQ title
 *                 example: "Office Supplies RFQ"
 *               description:
 *                 type: string
 *                 description: Detailed description
 *               vendorIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of vendor IDs to send RFQ to
 *                 example: ["vendor-id-1", "vendor-id-2"]
 *               priority:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH, URGENT]
 *               expectedDeliveryDate:
 *                 type: string
 *                 format: date
 *               deliveryAddress:
 *                 type: string
 *               rfqDeadline:
 *                 type: string
 *                 format: date
 *                 description: Deadline for vendors to respond
 *               specialRequirements:
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
 *                     unit:
 *                       type: string
 *                     specifications:
 *                       type: object
 *     responses:
 *       201:
 *         description: RFQ created and sent successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/rfq", ProcurementController.createAndSendRFQ);

/**
 * @swagger
 * /api/procurement/invoices:
 *   post:
 *     summary: Create a new procurement invoice
 *     tags: [Procurement]
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
 *               - items
 *             properties:
 *               purchaseOrderId:
 *                 type: string
 *                 description: Related purchase order ID
 *               vendorId:
 *                 type: string
 *                 description: Vendor ID
 *               invoiceDate:
 *                 type: string
 *                 format: date-time
 *                 description: Invoice date
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *                 description: Due date
 *               currencyId:
 *                 type: string
 *                 description: Currency ID
 *               documentPath:
 *                 type: string
 *                 description: Path to uploaded document
 *               documentType:
 *                 type: string
 *                 description: Document type (PDF, IMAGE, etc.)
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - itemName
 *                     - quantity
 *                     - unitPrice
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
 *     responses:
 *       201:
 *         description: Procurement invoice created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/invoices", ProcurementController.createProcurementInvoice);

/**
 * @swagger
 * /api/procurement/invoices/{invoiceId}/ocr:
 *   post:
 *     summary: Process OCR data for invoice
 *     tags: [Procurement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invoiceId
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
 *             required:
 *               - invoiceNumber
 *               - invoiceDate
 *               - vendorName
 *               - subtotal
 *               - taxAmount
 *               - totalAmount
 *               - items
 *             properties:
 *               invoiceNumber:
 *                 type: string
 *               invoiceDate:
 *                 type: string
 *               vendorName:
 *                 type: string
 *               vendorAddress:
 *                 type: string
 *               subtotal:
 *                 type: number
 *               taxAmount:
 *                 type: number
 *               totalAmount:
 *                 type: number
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
 *                     totalPrice:
 *                       type: number
 *                     unit:
 *                       type: string
 *     responses:
 *       200:
 *         description: OCR data processed successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/invoices/:invoiceId/ocr", ProcurementController.processOCRData);

/**
 * @swagger
 * /api/procurement/invoices/{invoiceId}/ai-matching:
 *   post:
 *     summary: Perform AI matching for invoice
 *     tags: [Procurement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: invoiceId
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
 *             required:
 *               - matched
 *               - matchScore
 *               - discrepancies
 *             properties:
 *               matched:
 *                 type: boolean
 *                 description: Whether the invoice matches the PO
 *               matchScore:
 *                 type: number
 *                 description: Match score (0-100)
 *               discrepancies:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                     description:
 *                       type: string
 *                     severity:
 *                       type: string
 *                       enum: [LOW, MEDIUM, HIGH]
 *     responses:
 *       200:
 *         description: AI matching completed successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/invoices/:invoiceId/ai-matching", ProcurementController.performAIMatching);

/**
 * @swagger
 * /api/procurement/invoices/{id}/approve:
 *   put:
 *     summary: Approve a procurement invoice
 *     tags: [Procurement]
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
 *         description: Invoice approved successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.put("/invoices/:id/approve", ProcurementController.approveProcurementInvoice);

/**
 * @swagger
 * /api/procurement/invoices/{id}/payment:
 *   post:
 *     summary: Process payment for an approved procurement invoice
 *     tags: [Procurement]
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
 *             required:
 *               - paymentAmount
 *               - paymentMethod
 *             properties:
 *               paymentAmount:
 *                 type: number
 *                 description: Amount to pay (can be partial or full)
 *                 example: 5725.00
 *               paymentDate:
 *                 type: string
 *                 format: date-time
 *                 description: Date of payment (defaults to current date)
 *                 example: "2025-10-14T10:00:00Z"
 *               paymentMethod:
 *                 type: string
 *                 enum: [CASH, BANK]
 *                 description: Payment method
 *                 example: BANK
 *               bankAccountId:
 *                 type: string
 *                 description: Specific bank account ID (e.g., ZIG account). If not provided, uses default.
 *                 example: "cmg97iy320003ung8aau6zqbv"
 *               paymentReference:
 *                 type: string
 *                 description: Bank transaction reference number
 *                 example: "TXN-12345-2025"
 *               notes:
 *                 type: string
 *                 description: Additional payment notes
 *                 example: "Paid via CBZ Bank"
 *           examples:
 *             fullPayment:
 *               summary: Full Payment via Bank
 *               value:
 *                 paymentAmount: 5725.00
 *                 paymentMethod: "BANK"
 *                 bankAccountId: "cmg97iy320003ung8aau6zqbv"
 *                 paymentReference: "TXN-12345"
 *                 notes: "Payment via ZIG account"
 *             partialPayment:
 *               summary: Partial Payment
 *               value:
 *                 paymentAmount: 3000.00
 *                 paymentMethod: "BANK"
 *                 paymentReference: "TXN-67890"
 *                 notes: "Partial payment - balance to follow"
 *             cashPayment:
 *               summary: Cash Payment
 *               value:
 *                 paymentAmount: 5725.00
 *                 paymentMethod: "CASH"
 *                 notes: "Cash payment from petty cash"
 *     responses:
 *       200:
 *         description: Payment processed successfully
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
 *                   example: "Payment processed successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     invoice:
 *                       type: object
 *                       description: Updated invoice details
 *                     journalEntry:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         referenceNumber:
 *                           type: string
 *                           example: "VENDOR-PAY-INV-12345"
 *                         totalAmount:
 *                           type: string
 *                     payment:
 *                       type: object
 *                       properties:
 *                         amount:
 *                           type: number
 *                           example: 5725.00
 *                         remainingBalance:
 *                           type: number
 *                           example: 0
 *                         status:
 *                           type: string
 *                           enum: [PAID, PARTIALLY_PAID]
 *                           example: "PAID"
 *       400:
 *         description: Bad request (invalid amount, already paid, etc.)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Invoice not found
 */
router.post("/invoices/:id/payment", ProcurementController.payProcurementInvoice);

/**
 * @swagger
 * /api/procurement/invoices:
 *   get:
 *     summary: Get all procurement invoices
 *     tags: [Procurement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [RECEIVED, PROCESSING, MATCHED, DISCREPANCY, APPROVED, PAID, REJECTED]
 *         description: Filter by status
 *       - in: query
 *         name: vendorId
 *         schema:
 *           type: string
 *         description: Filter by vendor
 *       - in: query
 *         name: matchingStatus
 *         schema:
 *           type: string
 *           enum: [PENDING, MATCHED, DISCREPANCY, MANUAL_REVIEW]
 *         description: Filter by matching status
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Number of items to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of items to skip
 *     responses:
 *       200:
 *         description: List of procurement invoices
 *       401:
 *         description: Unauthorized
 */
router.get("/invoices", ProcurementController.getAllProcurementInvoices);

/**
 * @swagger
 * /api/procurement/goods-received-notes:
 *   post:
 *     summary: Create a goods received note
 *     tags: [Procurement]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - purchaseOrderId
 *               - items
 *             properties:
 *               purchaseOrderId:
 *                 type: string
 *                 description: Purchase order ID
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - purchaseOrderItemId
 *                     - quantityReceived
 *                     - quantityAccepted
 *                     - quantityRejected
 *                     - qualityStatus
 *                   properties:
 *                     purchaseOrderItemId:
 *                       type: string
 *                     quantityReceived:
 *                       type: number
 *                     quantityAccepted:
 *                       type: number
 *                     quantityRejected:
 *                       type: number
 *                     qualityStatus:
 *                       type: string
 *                       enum: [PENDING, PASSED, FAILED, CONDITIONAL]
 *                     qualityNotes:
 *                       type: string
 *     responses:
 *       201:
 *         description: Goods received note created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/goods-received-notes", ProcurementController.createGoodsReceivedNote);

/**
 * @swagger
 * /api/procurement/dashboard:
 *   get:
 *     summary: Get procurement dashboard data
 *     tags: [Procurement]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
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
 *                     requisitions:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         pending:
 *                           type: number
 *                         approved:
 *                           type: number
 *                     purchaseOrders:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         pending:
 *                           type: number
 *                         received:
 *                           type: number
 *                     invoices:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         pending:
 *                           type: number
 *                         approved:
 *                           type: number
 *                     grns:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         pending:
 *                           type: number
 *       401:
 *         description: Unauthorized
 */
router.get("/dashboard", ProcurementController.getProcurementDashboard);

export default router;
