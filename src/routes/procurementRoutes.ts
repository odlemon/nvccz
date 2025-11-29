// @ts-nocheck
import express from "express";
import { ProcurementController } from "../controllers/ProcurementController";
import { authenticate } from "../middleware/authenticate";
import multer from "multer";

const router = express.Router();

// Configure multer for proof of payment file uploads (PDF or images)
const uploadProofOfPayment = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept PDF and image files
    const allowedMimes = [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp'
    ];
    if (allowedMimes.includes(file.mimetype) || file.originalname.match(/\.(pdf|jpg|jpeg|png|gif|webp)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF and image files (JPG, PNG, GIF, WEBP) are allowed'), false);
    }
  }
});

/**
 * @swagger
 * /procurement/invoices:
 *   post:
 *     summary: Create a new procurement invoice (PUBLIC - vendors submit invoices)
 *     description: **PUBLIC ENDPOINT** - Vendors submit invoices without authentication. This is the vendor's way to submit invoices.
 *     tags: [Procurement - Invoices]
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
 */
// PUBLIC: Vendors submit invoices without authentication
router.post("/invoices", ProcurementController.createProcurementInvoice);

// All routes below require authentication
router.use(authenticate);

/**
 * @swagger
 * /procurement/requisitions:
 *   post:
 *     summary: Create a new purchase requisition
 *     description: **Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM)
 *     tags: [Procurement - Requisitions]
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
 * /procurement/requisitions:
 *   get:
 *     summary: Get all purchase requisitions (filtered by user's department)
 *     description: **Required Role:** Department HEAD, DEPUTY, or PROC_MGR. Returns requisitions for the user's department only. Requisitions are filtered by the department they target.
 *     tags: [Procurement - Requisitions]
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
 *         description: List of purchase requisitions for the user's department
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - Only department HEAD, DEPUTY, or PROC_MGR can view requisitions
 */
// Note: More specific routes must come BEFORE general routes

/**
 * @swagger
 * /procurement/requisitions/my:
 *   get:
 *     summary: Get my purchase requisitions (created by logged-in user)
 *     description: **Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM)
 *     tags: [Procurement - Requisitions]
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
 * /procurement/requisitions/pending-approval:
 *   get:
 *     summary: Get pending requisitions for department head approval (their department only)
 *     description: **Required Role:** Department HEAD or DEPUTY (departmentRole: HEAD or DEPUTY) - Can view pending requisitions from their department only
 *     tags: [Procurement - Requisitions]
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
 * /procurement/requisitions/{id}:
 *   get:
 *     summary: Get purchase requisition by ID
 *     description: **Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM)
 *     tags: [Procurement - Requisitions]
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
 * /procurement/requisitions/{id}/submit:
 *   put:
 *     summary: Submit a purchase requisition for approval
 *     description: **Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM). ⚠️ Once submitted, status becomes PENDING_APPROVAL and cannot be modified
 *     tags: [Procurement - Requisitions]
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
 * /procurement/requisitions/{id}/approve:
 *   put:
 *     summary: Approve a purchase requisition
 *     description: **Required Role:** User's roleCode must match approval config roleCode (e.g., PROC_MGR, FIN_MGR) OR user must be department HEAD/DEPUTY for their department's requisitions. ⚠️ Once approved, status becomes APPROVED and cannot be modified
 *     tags: [Procurement - Requisitions]
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
 * /procurement/requisitions/{id}/reject:
 *   put:
 *     summary: Reject a purchase requisition
 *     description: **Required Role:** Department HEAD or DEPUTY for the department that owns the requisition. ⚠️ Once rejected, status becomes REJECTED and cannot be modified
 *     tags: [Procurement - Requisitions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Requisition ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - rejectionReason
 *             properties:
 *               rejectionReason:
 *                 type: string
 *                 description: Reason for rejecting the requisition
 *                 example: "Budget no longer available"
 *     responses:
 *       200:
 *         description: Requisition rejected successfully
 *       400:
 *         description: Bad request (missing reason or invalid state)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not department head/deputy)
 */
router.put("/requisitions/:id/reject", ProcurementController.rejectPurchaseRequisition);

/**
 * @swagger
 router.post("/purchase-orders", ProcurementController.createPurchaseOrder);

/**
 * @swagger
 router.get("/purchase-orders", ProcurementController.getAllPurchaseOrders);

/**
 * @swagger
 router.post("/purchase-orders/:id/send", ProcurementController.sendPurchaseOrder);

/**
 * @swagger
 router.post("/purchase-orders/:id/convert-to-bill", ProcurementController.convertPOToBill);

/**
 * @swagger
 * /procurement/rfq:
 *   post:
 *     summary: Create and send RFQ to multiple vendors
 *     description: **Required Role:** PROC_MGR, PROC_OFF, or BUYER. Sends RFQ emails to all specified vendors with public quotation submission link
 *     tags: [Procurement - RFQ]
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
 * /procurement/rfq:
 *   get:
 *     summary: Get all RFQs
 *     description: **Required Role:** PROC_MGR, PROC_OFF, or BUYER. Retrieve all RFQs from the system
 *     tags: [Procurement - RFQ]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: rfqNumber
 *         schema:
 *           type: string
 *         description: Filter by RFQ number
 *       - in: query
 *         name: requisitionId
 *         schema:
 *           type: string
 *         description: Filter by requisition ID
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
 *         description: RFQs retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/rfq", ProcurementController.getAllRFQs);


/**
 * @swagger
 * /procurement/invoices/{id}/approve:
 *   put:
 *     summary: Approve a procurement invoice
 *     description: **Required Role:** User's roleCode must match approval config roleCode (e.g., FIN_MGR, PROC_MGR). ⚠️ Once approved, status becomes APPROVED and cannot be modified. Accounting entries created on payment, not approval. **Use this endpoint to set taxable status and tax rate/amount.**
 *     tags: [Procurement - Invoices]
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
 *               isTaxable:
 *                 type: boolean
 *                 description: Whether the invoice is taxable. If true, VAT will be calculated automatically using the standard VAT rate (14.5%). If false, tax amount will be set to 0. If not provided, existing invoice tax amounts will be kept.
 *                 example: true
 *           examples:
 *             taxable:
 *               summary: Taxable invoice (VAT calculated automatically at 14.5%)
 *               value:
 *                 isTaxable: true
 *             nonTaxable:
 *               summary: Non-taxable invoice
 *               value:
 *                 isTaxable: false
 *     responses:
 *       200:
 *         description: Invoice approved successfully
 *       400:
 *         description: Bad request (invalid tax rate/amount, missing required fields, etc.)
 *       401:
 *         description: Unauthorized
 */
router.put("/invoices/:id/approve", ProcurementController.approveProcurementInvoice);

/**
 * @swagger
 * /procurement/invoices/{id}/payment:
 *   post:
 *     summary: Process payment for an approved procurement invoice
 *     description: **Required Role:** FIN_MGR, PROC_MGR, or ACCOUNTANT. Creates accounting entries: Expense Recognition (Dr. Expense, Dr. VAT if taxable, Cr. AP) and Payment Processing (Dr. AP, Cr. Bank/Cash). Supports full and partial payments. Taxable status is automatically determined from invoice tax amount.
 *     tags: [Procurement - Payments]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - paymentAmount
 *               - paymentMethod
 *               - proofOfPayment
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
 *               proofOfPayment:
 *                 type: string
 *                 format: binary
 *                 description: Proof of payment document (PDF or image: JPG, PNG, GIF, WEBP). Required. Max size: 10MB.
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
router.post("/invoices/:id/payment", uploadProofOfPayment.single('proofOfPayment'), ProcurementController.payProcurementInvoice);

/**
 * @swagger
 * /procurement/invoices:
 *   get:
 *     summary: Get all procurement invoices
 *     description: **Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM)
 *     tags: [Procurement - Invoices]
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
 * /procurement/goods-received-notes:
 *   post:
 *     summary: Create a goods received note
 *     description: **Required Role:** PROC_MGR, PROC_OFF, BUYER, or WAREHOUSE_MANAGER. Records received quantities, accepted quantities, and rejected quantities. Updates PO item quantities.
 *     tags: [Procurement - GRN]
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
 * /procurement/dashboard:
 *   get:
 *     summary: Get procurement dashboard data
 *     description: **Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM)
 *     tags: [Procurement - Dashboard]
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
