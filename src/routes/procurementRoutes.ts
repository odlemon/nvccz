// @ts-nocheck
import express from "express";
import { ProcurementController } from "../controllers/ProcurementController";
import { ProcurementAccessController } from "../controllers/ProcurementAccessController";
import { authenticate } from "../middleware/authenticate";
import { requireAnyPermission, requireInternalStaffUser } from "../middleware/permissionAuth";
import { PROCUREMENT_PERMISSIONS as PROC_PERMS } from "../config/procurementPermissions";
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

const uploadPublicVendorInvoicePdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok =
      file.mimetype === "application/pdf" || /\.pdf$/i.test(String(file.originalname || ""));
    cb(ok ? null : new Error("Only PDF files are allowed"), ok);
  },
});

/**
 * @swagger
 * /procurement/invoices/upload-document:
 *   post:
 *     summary: Upload invoice PDF (PUBLIC — vendors, no JWT)
 *     description: |
 *       Multipart field **`document`** (PDF, max 15MB). Optional form field **`vendorId`** scopes storage paths.
 *       Returns **`documentUrl`** — use that value as **`documentPath`** (or URL) when calling **`POST /procurement/invoices`**.
 *     tags: [Procurement - Invoices]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - document
 *             properties:
 *               document:
 *                 type: string
 *                 format: binary
 *               vendorId:
 *                 type: string
 *                 description: Optional vendor id for upload path grouping
 *     responses:
 *       201:
 *         description: Upload succeeded — use data.documentUrl on invoice create
 *       400:
 *         description: Missing file or invalid type
 */
router.post(
  "/invoices/upload-document",
  uploadPublicVendorInvoicePdf.single("document"),
  ProcurementController.uploadVendorInvoiceDocument
);

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
 *               - items
 *             properties:
 *               vendorPortalToken:
 *                 type: string
 *                 description: >
 *                   Required for **unauthenticated** vendor submits. Signed token from the PO email
 *                   (`PO_VENDOR_INVOICE`); embeds `vendorId` and `purchaseOrderId`. Alias body field `token`.
 *               token:
 *                 type: string
 *                 description: Alias of `vendorPortalToken`.
 *               purchaseOrderId:
 *                 type: string
 *                 description: Required unless `vendorPortalToken` supplies it (must match token when both sent).
 *               vendorId:
 *                 type: string
 *                 description: Required for **staff** (authenticated) creates; for vendor self-serve, derived from token.
 *               invoiceDate:
 *                 type: string
 *                 format: date-time
 *                 description: >
 *                   Staff only. Vendor portal submits ignore this and use the server date at create time.
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
// PUBLIC for vendors, and the capture path for accounts payable. With no Authorization header
// this is a vendor's submission and the controller requires its signed vendorPortalToken. With
// one, it is staff capturing a supplier invoice: authenticate the token and hold it to internal
// staff with the capture grant, and the controller's staff branch applies. Before this,
// `authenticate` never ran here, req.user was never set, and every staff capture was refused
// for want of a vendor token (PROC-FINDING-004).
const staffCaptureWhenAuthenticated = (req, res, next) => {
  if (!req.headers.authorization) return next();
  return authenticate(req, res, () =>
    requireInternalStaffUser()(req, res, () =>
      requireAnyPermission([PROC_PERMS.intakeManage])(req, res, next),
    ),
  );
};
router.post("/invoices", staffCaptureWhenAuthenticated, ProcurementController.createProcurementInvoice);

// All routes below require authentication
router.use(authenticate);
// Internal staff only. Every route below is staff procurement data or a staff action;
// `authenticate` alone let LP and investee portal accounts read vendor master data and
// create internal requisitions. Vendors never reach these: their flows use signed
// vendorPortalToken links on the public routes declared above this line.
router.use(requireInternalStaffUser());

// The caller's effective procurement grants, which the V23 workspace gates its controls on.
router.get("/me/access", ProcurementAccessController.getMyAccess);

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
 *     description: **Required Role:** Department HEAD, DEPUTY, or PROC_MGR. Returns requisitions for the user's department only. Requisitions are filtered by the department they target. **Draft (unsubmitted) requisitions are never returned** unless you filter by another status; `status=DRAFT` is rejected — use `GET /procurement/requisitions/my` for your own drafts.
 *     tags: [Procurement - Requisitions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [PENDING_APPROVAL, APPROVED, REJECTED, CONVERTED_TO_PO, PENDING_VC_EXECUTIVE_REVIEW]
 *         description: Filter by status (DRAFT not supported — drafts excluded from this list by default)
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
router.get(
  "/requisitions/investee/sla-breached",
  ProcurementController.listInvesteePrsPendingVcSlaBreached
);
router.get(
  "/requisitions/investee",
  ProcurementController.listInvesteePurchaseRequisitionsForVc
);
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
 *     description: **Required Role:** Department HEAD or DEPUTY for the department that owns the requisition. Sets status **REJECTED**, stores a content fingerprint, and notifies the submitter. The requester may **PUT** `/api/procurement/requisitions/{id}` to edit while rejected, then **PUT** `/submit` again only after line/header details change from the rejected snapshot.
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
 *         description: Requisition rejected successfully. Response body includes `rejectionReason`, `rejectionContentFingerprint`, and full requisition row.
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
 * /procurement/requisitions/{id}:
 *   put:
 *     summary: Update own purchase requisition (DRAFT or REJECTED)
 *     description: Requester only. After rejection, edit here so the content fingerprint differs, then call submit again.
 *     tags:
 *       - Procurement
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               department: { type: string }
 *               priority: { type: string }
 *               justification: { type: string }
 *               sourcingCategory: { type: string }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Updated
 *       400:
 *         description: Validation error
 */
router.put("/requisitions/:id", ProcurementController.updatePurchaseRequisition);

router.post("/purchase-orders", requireAnyPermission([PROC_PERMS.ordersManage]), ProcurementController.createPurchaseOrder);
router.get("/purchase-orders", requireAnyPermission([PROC_PERMS.ordersView]), ProcurementController.getAllPurchaseOrders);
/** Must be before /purchase-orders/:id or "verify" is captured as an id (Suite 04 PDF verification). */
router.get("/purchase-orders/verify", ProcurementController.verifyPurchaseOrderToken);
router.get("/purchase-orders/:id", requireAnyPermission([PROC_PERMS.ordersView]), ProcurementController.getPurchaseOrderById);
router.post("/purchase-orders/:id/send", requireAnyPermission([PROC_PERMS.ordersSend]), ProcurementController.sendPurchaseOrder);
router.post("/purchase-orders/:id/convert-to-bill", requireAnyPermission([PROC_PERMS.ordersManage, PROC_PERMS.invoicesPay]), ProcurementController.convertPOToBill);

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
 *             properties:
 *               requisitionId:
 *                 type: string
 *                 description: Link to approved requisition. When set, items may be omitted — PR line items are copied.
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
 *                 description: Omit when requisitionId is set — line items are copied from the approved PR
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
router.post("/rfq", requireAnyPermission([PROC_PERMS.rfqManage]), ProcurementController.createAndSendRFQ);

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
router.get("/rfq", requireAnyPermission([PROC_PERMS.rfqView]), ProcurementController.getAllRFQs);

/**
 * @swagger
 * /procurement/rfqs/{id}/comparison-matrix:
 *   get:
 *     summary: RFQ comparison matrix
 *     description: |
 *       **Required Role:** PROC_MGR, PROC_OFF, or BUYER.
 *       Compare all vendor quotations for a procurement RFQ (`procurement_rfqs.id`).
 *       Returns full quotation detail, FX-normalized totals, weighted scores, and UI-friendly highlights (vendor names and amounts).
 *       Not gated on RFQ closing time.
 *     tags: [Procurement - RFQ, Procurement — RFQ & Bidding (Suite 03)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Procurement RFQ id
 *     responses:
 *       200:
 *         description: Comparison matrix retrieved successfully
 *       400:
 *         description: RFQ not found
 *       401:
 *         description: Unauthorized
 */
router.get("/rfqs/:id/comparison-matrix", requireAnyPermission([PROC_PERMS.rfqView]), ProcurementController.getRfqComparisonMatrix);

/**
 * @swagger
 * /procurement/rfqs/{id}/award:
 *   post:
 *     summary: "[Deprecated] Award RFQ"
 *     description: |
 *       **410 Gone** — use `POST /api/vendor-quotations/{id}/accept` for the winning quotation
 *       and `POST /api/vendor-quotations/{id}/reject` for others.
 *     tags: [Procurement - RFQ, Procurement — RFQ & Bidding (Suite 03)]
 *     deprecated: true
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       410:
 *         description: Use vendor-quotations accept/reject instead
 */
router.post("/rfqs/:id/award", ProcurementController.awardRfq);
router.patch("/rfqs/:id/closing", requireAnyPermission([PROC_PERMS.rfqManage]), ProcurementController.patchRfqExtend);
/**
 * @swagger
 * /procurement/rfqs/{id}/clarifications:
 *   post:
 *     summary: Post RFQ clarification (staff)
 *     description: |
 *       **Required Role:** PROC_MGR, PROC_OFF, or BUYER.
 *       Clarification text is stored in one `body` field. Send **`body`**, or **`answer`**, or **`question`** + **`answer`** (formatted as Q/A).
 *       Staff rows use **`userId`** (vendorId is null). Invited vendors are emailed (RFQ-style template + portal link).
 *     tags: [Procurement - RFQ, Procurement — RFQ & Bidding (Suite 03)]
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
 *               body:
 *                 type: string
 *               question:
 *                 type: string
 *               answer:
 *                 type: string
 *               attachmentUrl:
 *                 type: string
 *           example:
 *             answer: "Yes, delivery to multiple sites is allowed."
 *     responses:
 *       201:
 *         description: Clarification created
 *       400:
 *         description: Missing clarification text
 *   get:
 *     summary: List RFQ clarifications
 *     tags: [Procurement - RFQ, Procurement — RFQ & Bidding (Suite 03)]
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
 *         description: Clarifications list
 */
router.post("/rfqs/:id/clarifications", requireAnyPermission([PROC_PERMS.rfqManage]), ProcurementController.postRfqClarification);
router.get("/rfqs/:id/clarifications", requireAnyPermission([PROC_PERMS.rfqView]), ProcurementController.getRfqClarifications);

router.get("/purchase-orders/:id/pdf", requireAnyPermission([PROC_PERMS.ordersView]), ProcurementController.getPurchaseOrderPdf);
router.patch(
  "/purchase-orders/:poId/lines/:lineId/cancel", requireAnyPermission([PROC_PERMS.ordersManage]),
  ProcurementController.cancelPurchaseOrderLine
);

/**
 * @swagger
 * /procurement/grn-return-to-vendor:
 *   post:
 *     summary: Record a return-to-vendor (RTV) against a GRN line (Suite 05.9)
 *     description: |
 *       **Required Role:** PROCUREMENT staff (same as GRN creation). Creates a `GrnReturnToVendor` row.
 *       Quantity cannot exceed remaining received on that GRN line (received minus prior RTVs on the same GRN + PO line).
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
 *               - goodsReceivedNoteId
 *               - purchaseOrderItemId
 *               - quantity
 *             properties:
 *               goodsReceivedNoteId:
 *                 type: string
 *                 description: GRN id
 *               purchaseOrderItemId:
 *                 type: string
 *                 description: PO line id (must appear on the GRN)
 *               quantity:
 *                 type: number
 *                 description: Units to return (positive; capped by remaining received on line)
 *               reason:
 *                 type: string
 *                 description: Optional RTV reason
 *           example:
 *             goodsReceivedNoteId: clxxxxxxxxxxxxxxxxxxxxxxxx
 *             purchaseOrderItemId: clyyyyyyyyyyyyyyyyyyyyyyyy
 *             quantity: 2
 *             reason: Damaged in transit — vendor collection arranged
 *     responses:
 *       201:
 *         description: RTV record created
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 */
router.post("/grn-return-to-vendor", requireAnyPermission([PROC_PERMS.receivingManage]), ProcurementController.createGrnReturnToVendor);

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
 *                 description: Whether the invoice is taxable. If true, VAT will be calculated automatically using the standard VAT rate (15.5%). If false, tax amount will be set to 0. If not provided, existing invoice tax amounts will be kept.
 *                 example: true
 *           examples:
 *             taxable:
 *               summary: Taxable invoice (VAT calculated automatically at 15.5%)
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
router.put("/invoices/:id/approve", requireAnyPermission([PROC_PERMS.invoicesApprove]), ProcurementController.approveProcurementInvoice);

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
router.post("/invoices/:id/payment", requireAnyPermission([PROC_PERMS.invoicesPay]), uploadProofOfPayment.single('proofOfPayment'), ProcurementController.payProcurementInvoice);

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
router.get("/invoices", requireAnyPermission([PROC_PERMS.invoicesView]), ProcurementController.getAllProcurementInvoices);

/**
 * @swagger
 * /procurement/goods-received-notes:
 *   get:
 *     summary: List goods received notes
 *     description: |
 *       **Required Role:** Authenticated procurement user. Filter by PO, vendor, status, etc.
 *       Returns GRNs with PO, vendor, lines, and RTV records (same shape as create response).
 *     tags: [Procurement - GRN]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: purchaseOrderId
 *         schema:
 *           type: string
 *         description: Filter by purchase order id
 *       - in: query
 *         name: vendorId
 *         schema:
 *           type: string
 *         description: Filter by PO vendor id
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: GRN header status (e.g. RECEIVED, PENDING_GP_REVIEW)
 *       - in: query
 *         name: qualityStatus
 *         schema:
 *           type: string
 *         description: GRN quality rollup (e.g. PENDING, PASSED)
 *       - in: query
 *         name: submittedByInvestee
 *         schema:
 *           type: boolean
 *         description: When true, only investee-submitted GRNs
 *       - in: query
 *         name: grnNumber
 *         schema:
 *           type: string
 *         description: Partial match on GRN number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Page size (max 200)
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Paginated list
 *       401:
 *         description: Unauthorized
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
 *               receivedDate:
 *                 type: string
 *                 format: date-time
 *                 description: Optional. Actual receipt time for lead-time vs PO expectedDeliveryDate (vendor rating). Defaults to now if omitted.
 *               attachmentUrls:
 *                 description: Optional JSON array of delivery note / waybill URLs (Suite 05)
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               geoCapturedAt:
 *                 type: string
 *                 format: date-time
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
router.get("/goods-received-notes", requireAnyPermission([PROC_PERMS.receivingView]), ProcurementController.getGoodsReceivedNotes);
/**
 * @swagger
 * /procurement/goods-received-notes/{id}:
 *   get:
 *     summary: Get goods received note by id
 *     description: **Required Role:** Authenticated procurement user. Full detail including PO, items, RTVs.
 *     tags: [Procurement - GRN]
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
 *         description: GRN detail
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
router.get("/goods-received-notes/:id", requireAnyPermission([PROC_PERMS.receivingView]), ProcurementController.getGoodsReceivedNoteById);
router.post("/goods-received-notes", requireAnyPermission([PROC_PERMS.receivingManage]), ProcurementController.createGoodsReceivedNote);

/**
 * @swagger
 * /procurement/goods-received-notes/{id}/approve:
 *   put:
 *     summary: QC-approve a goods received note
 *     description: |
 *       **Required Role:** Authenticated procurement user (PROC_MGR, PROC_OFF, BUYER, etc.).
 *       Sets the GRN header **`qualityStatus`** and every line **`qualityStatus`** to **`PASSED`**,
 *       records **`approvedById`** / **`approvedAt`**, and promotes header **`status`** from
 *       `RECEIVED` or `PENDING_GP_REVIEW` to **`APPROVED`** when applicable.
 *       Optional body **`qualityNotes`** is stored on the GRN header.
 *       Does not email the vendor. PO delivery status is unchanged (set at GRN create).
 *     tags: [Procurement - GRN]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Goods received note id
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               qualityNotes:
 *                 type: string
 *                 description: Optional overall QC notes (header)
 *           example:
 *             qualityNotes: "All items inspected and accepted"
 *     responses:
 *       200:
 *         description: GRN approved; qualityStatus PASSED on header and lines
 *       400:
 *         description: Bad request (e.g. GRN rejected)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: GRN not found
 */
router.put("/goods-received-notes/:id/approve", requireAnyPermission([PROC_PERMS.receivingApprove]), ProcurementController.approveGoodsReceivedNote);

/**
 * @swagger
 * /procurement/goods-received-notes/{id}/reject:
 *   put:
 *     summary: QC-reject a goods received note
 *     description: |
 *       **Required Role:** Authenticated procurement user.
 *       Sets the GRN header **`qualityStatus`** and every line **`qualityStatus`** to **`FAILED`**,
 *       sets header **`status`** to **`REJECTED`**, and persists **`rejectionReason`** (required) plus
 *       **`rejectionContentFingerprint`**. Clears **`approvedById`** / **`approvedAt`** if set.
 *       Optional alias: body field **`qualityNotes`** is accepted as the rejection reason when
 *       **`rejectionReason`** is omitted.
 *       Does not reverse PO receipt quantities or PO delivery status.
 *     tags: [Procurement - GRN]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Goods received note id
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
 *                 description: Why the GRN failed QC (required)
 *               qualityNotes:
 *                 type: string
 *                 description: Alias for rejectionReason
 *           example:
 *             rejectionReason: "Damaged packaging; 5 units short"
 *     responses:
 *       200:
 *         description: GRN rejected; qualityStatus FAILED on header and lines
 *       400:
 *         description: Bad request (missing reason or already rejected)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: GRN not found
 */
router.put("/goods-received-notes/:id/reject", requireAnyPermission([PROC_PERMS.receivingApprove]), ProcurementController.rejectGoodsReceivedNote);

/**
 * @swagger
 * /procurement/dashboard:
 *   get:
 *     summary: Get procurement dashboard data with detailed information
 *     description: **Required Role:** ANY user in Procurement department (PROC_MGR, PROC_OFF, BUYER, PROC_COORD, PROC_MEM). Returns detailed data for requisitions, invoices, RFQs, quotations, payments, and vendors. Excludes GRN and Purchase Orders.
 *     tags: [Procurement - Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully. Returns detailed statistics, recent items, and analytics.
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
 *                         summary:
 *                           type: object
 *                           properties:
 *                             total: { type: number }
 *                             pending: { type: number }
 *                             approved: { type: number }
 *                             rejected: { type: number }
 *                             draft: { type: number }
 *                         byStatus:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               status: { type: string }
 *                               count: { type: number }
 *                               totalAmount: { type: number }
 *                         recent:
 *                           type: array
 *                           items: { type: object }
 *                     invoices:
 *                       type: object
 *                       properties:
 *                         summary:
 *                           type: object
 *                           properties:
 *                             total: { type: number }
 *                             pending: { type: number }
 *                             approved: { type: number }
 *                             paid: { type: number }
 *                             partiallyPaid: { type: number }
 *                         amounts:
 *                           type: object
 *                           properties:
 *                             totalSubtotal: { type: number }
 *                             totalTax: { type: number }
 *                             totalAmount: { type: number }
 *                             averageAmount: { type: number }
 *                             paidAmount: { type: number }
 *                             pendingPaymentAmount: { type: number }
 *                         byStatus:
 *                           type: array
 *                           items: { type: object }
 *                         byPaymentStatus:
 *                           type: array
 *                           items: { type: object }
 *                         recent:
 *                           type: array
 *                           items: { type: object }
 *                     rfqs:
 *                       type: object
 *                       properties:
 *                         summary:
 *                           type: object
 *                           properties:
 *                             total: { type: number }
 *                             active: { type: number }
 *                         recent:
 *                           type: array
 *                           items: { type: object }
 *                     quotations:
 *                       type: object
 *                       properties:
 *                         summary:
 *                           type: object
 *                           properties:
 *                             total: { type: number }
 *                             pending: { type: number }
 *                             accepted: { type: number }
 *                             rejected: { type: number }
 *                         byStatus:
 *                           type: array
 *                           items: { type: object }
 *                         recent:
 *                           type: array
 *                           items: { type: object }
 *                     payments:
 *                       type: object
 *                       properties:
 *                         recent:
 *                           type: array
 *                           items: { type: object }
 *                     vendors:
 *                       type: object
 *                       properties:
 *                         topVendors:
 *                           type: array
 *                           items: { type: object }
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 */
router.get("/dashboard", requireAnyPermission([PROC_PERMS.dashboardView]), ProcurementController.getProcurementDashboard);

/**
 * @swagger
 * /procurement/payments:
 *   get:
 *     summary: Get all procurement invoice payments
 *     description: **Required Role:** ANY user in Procurement or Finance department. Returns all paid and partially paid invoices with payment details including journal entries.
 *     tags: [Procurement - Invoices]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *           enum: [PAID, PARTIALLY_PAID]
 *         description: Filter by payment status
 *       - in: query
 *         name: vendorId
 *         schema:
 *           type: string
 *         description: Filter by vendor ID
 *       - in: query
 *         name: paymentMethod
 *         schema:
 *           type: string
 *           enum: [BANK, CASH]
 *         description: Filter by payment method (BANK or CASH)
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter payments from this date (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter payments until this date (YYYY-MM-DD)
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
 *         description: Payments retrieved successfully
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
 *                     payments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           invoiceNumber:
 *                             type: string
 *                           vendor:
 *                             type: object
 *                           subtotal:
 *                             type: number
 *                           taxAmount:
 *                             type: number
 *                           totalAmount:
 *                             type: number
 *                           currency:
 *                             type: object
 *                           paymentStatus:
 *                             type: string
 *                             enum: [PAID, PARTIALLY_PAID]
 *                           paymentDate:
 *                             type: string
 *                             format: date-time
 *                           paymentReference:
 *                             type: string
 *                           journalEntry:
 *                             type: object
 *                     total:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     offset:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/payments", requireAnyPermission([PROC_PERMS.invoicesView]), ProcurementController.getAllPayments);

export default router;
