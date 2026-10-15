// @ts-nocheck
import { normalizeAccessProfile } from "../config/userMasterAccess";
import { vendorPortalReadLimiter, vendorPortalWriteLimiter } from "../middleware/vendorPortalRateLimit";
import express from "express";
import { ProcurementController } from "../controllers/ProcurementController";
import { ProcurementAccessController } from "../controllers/ProcurementAccessController";
import { ProcurementApprovalMatrixController } from "../controllers/ProcurementApprovalMatrixController";
import { ProcurementRequisitionFlowController as Flow } from "../controllers/ProcurementRequisitionFlowController";
import { SourcingController as Src } from "../controllers/SourcingController";
import { P2pController as P2p } from "../controllers/P2pController";
import { ProcurementAuditController } from "../controllers/ProcurementAuditController";
import { ProcurementInsightsController as Insights } from "../controllers/ProcurementInsightsController";
import procurementRegistersRoutes from "./procurementRegistersRoutes";
import { authenticate } from "../middleware/authenticate";
import { requireAnyPermission, requireCeoOrAdmin, requireInternalStaffUser } from "../middleware/permissionAuth";
import { PROCUREMENT_PERMISSIONS as PROC_PERMS } from "../config/procurementPermissions";
import multer from "multer";

const quotationCaptureUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 20 } });
const requisitionUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 10 } });
const router = express.Router();

// SRD §11 requisition Attachments: same shape as the Document Vault upload (procurementRegistersRoutes),
// plus a type restriction the Document Vault route itself does not have -- SRD §32 (supported formats:
// PDF/DOCX/XLSX/XLS/CSV/JPG/JPEG/PNG) and §43 (file-upload restrictions, file-type verification).
// Legacy .doc is also accepted, matching the form's own <input accept> list.
const REQUISITION_ATTACHMENT_ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".csv", ".jpg", ".jpeg", ".png"];
const REQUISITION_ATTACHMENT_ALLOWED_MIMES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "application/csv",
  "image/jpeg",
  "image/png",
]);
const uploadRequisitionAttachment = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || "").toLowerCase();
    const mime = String(file.mimetype || "").toLowerCase();
    const extOk = REQUISITION_ATTACHMENT_ALLOWED_EXTENSIONS.some((ext) => name.endsWith(ext));
    const mimeOk = REQUISITION_ATTACHMENT_ALLOWED_MIMES.has(mime);
    // A browser can send a generic octet-stream mimetype for a real file of an allowed type (older
    // Office formats in particular); the extension check alone still gates that case.
    const ok = extOk && (mimeOk || mime === "application/octet-stream" || mime === "");
    cb(ok ? null : new Error("Only PDF, Word, Excel, CSV, JPG or PNG files are accepted here."), ok);
  },
});

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
  // A PDF, or a scan or photo of the invoice: every invoice document is read by the LLM, OCR first for images.
  fileFilter: (_req, file, cb) => {
    const ok =
      /^(application\/pdf|image\/(png|jpe?g|webp|tiff))$/i.test(String(file.mimetype || "")) ||
      /\.(pdf|png|jpe?g|webp|tiff?)$/i.test(String(file.originalname || ""));
    cb(ok ? null : new Error("Upload the invoice as a PDF, or as a scan or photo (PNG, JPEG, WEBP or TIFF)"), ok);
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
  vendorPortalWriteLimiter,
  // A refused file type or an oversized file is the uploader's mistake, said as a 400; it reached Express's default
  // handler and answered 500.
  (req, res, next) =>
    uploadPublicVendorInvoicePdf.single("document")(req, res, (err: any) => {
      if (!err) return next();
      const message =
        err?.code === "LIMIT_FILE_SIZE" ? "The invoice file is too large (max 15MB)" : err?.message || "The invoice file could not be uploaded";
      return res.status(400).json({ success: false, message });
    }),
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
router.post("/invoices", vendorPortalWriteLimiter, staffCaptureWhenAuthenticated, ProcurementController.createProcurementInvoice);

// PUBLIC, token-scoped: the PO behind a vendor's emailed invoice link, so the vendor invoice form
// can show the order and prefill its lines. `?token=` is the signed PO_VENDOR_INVOICE token.
router.get("/vendor-portal/purchase-order", vendorPortalReadLimiter, ProcurementController.getVendorPortalPurchaseOrder);

// PUBLIC, token-scoped: the RFQ behind a vendor's emailed quotation link, so the quotation form can show what is
// being bought and prefill the lines and the vendor's own details. `?token=` is the signed RFQ_SUBMIT token.
router.get("/vendor-portal/rfq", vendorPortalReadLimiter, ProcurementController.getVendorPortalRfq);

// PUBLIC, token-scoped clarifications: a supplier sees only what was sent to every invitee or to them, plus their own
// questions (never another supplier's), and can ask a question while the event is open.
router.get("/vendor-portal/clarifications", vendorPortalReadLimiter, ProcurementController.getVendorPortalClarifications);
router.post("/vendor-portal/clarifications", vendorPortalWriteLimiter, ProcurementController.postVendorPortalClarification);

// PUBLIC: Suite 04.3 — scan the PO PDF QR (or open the email verification link) without a staff session.
// Must sit above `authenticate` or phone scans get 401. Token is `po_pdf_verification_token`.
router.get("/purchase-orders/verify", ProcurementController.verifyPurchaseOrderToken);

// All routes below require authentication
router.use(authenticate);
// Internal staff only. Every route below is staff procurement data or a staff action;
// `authenticate` alone let LP and investee portal accounts read vendor master data and
// create internal requisitions. Vendors never reach these: their flows use signed
// vendorPortalToken links on the public routes declared above this line.
router.use(requireInternalStaffUser());
// User Master access profile: a READ_ONLY person can look at procurement but every write is refused, including the
// requisition and approval routes that carry no permission of their own.
router.use((req: any, res: any, next: any) => {
  const isRead = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
  if (!isRead && normalizeAccessProfile(req.user?.accessProfile) === "READ_ONLY") {
    return res.status(403).json({
      success: false,
      code: "ACCESS_PROFILE_READ_ONLY",
      message: "Your access profile is read-only in Procurement.",
    });
  }
  next();
});

// The caller's effective procurement grants, which the V23 workspace gates its controls on.
router.get("/me/access", ProcurementAccessController.getMyAccess);

// Bank payment file from vendors' own banking details (declared before any "/invoices/:id" route).
router.get("/invoices/payment-file", requireAnyPermission([PROC_PERMS.invoicesPay]), ProcurementController.exportPaymentBankFile);

const { ProcurementNtsRemainingController } = require("../controllers/ProcurementNtsRemainingController");
router.get("/settings", requireCeoOrAdmin(), ProcurementNtsRemainingController.getSettings);
router.put("/settings", requireAnyPermission([PROC_PERMS.auditView]), ProcurementNtsRemainingController.putSettings);
router.post(
  "/compliance-reminders/run",
  requireAnyPermission([PROC_PERMS.vendorsManage, PROC_PERMS.vendorsApprove]),
  ProcurementNtsRemainingController.runComplianceReminders
);
router.get("/rpa-jobs", requireAnyPermission([PROC_PERMS.auditView]), ProcurementNtsRemainingController.listRpaJobs);
router.post("/rpa-jobs", requireAnyPermission([PROC_PERMS.auditView]), ProcurementNtsRemainingController.enqueueRpaJob);
router.get("/ai-usage", requireAnyPermission([PROC_PERMS.auditView]), ProcurementNtsRemainingController.aiUsageSummary);
// Retired: a procurement officer typing committee members' declarations for them proved nothing. Each member declares for
// themselves from the configured wording (POST /rfqs/:id/evaluation/declaration).
router.post("/rfqs/:id/conflict-declarations", Src.gone("Declarations are made by each committee member: POST /procurement/rfqs/:id/evaluation/declaration."));
router.get("/authz/dept-isolation-probe", ProcurementNtsRemainingController.deptIsolationProbe);
router.get("/consolidation-fx", requireAnyPermission([PROC_PERMS.ordersView, PROC_PERMS.rfqView]), ProcurementNtsRemainingController.consolidationFx);

// The requisition approval matrix: who decides a requisition, step by step. Staff read it; an administrator or the
// CFO changes it (the service refuses anyone else).
router.get("/approval-matrix", ProcurementApprovalMatrixController.getMatrix);
router.put("/approval-matrix", ProcurementApprovalMatrixController.saveMatrix);
// Whether an exactly matching invoice is approved without a person (SRD §6.6); read with the matrix.
router.put("/invoice-auto-approval", ProcurementApprovalMatrixController.saveInvoiceAutoApproval);

// What a requester needs to fill in a requisition: the projects it can be charged to (every employee raises
// requisitions, so no procurement grant is required).
router.get("/requisition-projects", ProcurementController.listRequisitionProjects);
router.get("/currencies", requireAnyPermission([PROC_PERMS.rfqManage, PROC_PERMS.rfqView]), ProcurementController.listRfqCurrencies);

// The procurement audit trail, newest first, from the audit_logs rows the services write.
router.get("/audit-events", requireAnyPermission([PROC_PERMS.auditView]), ProcurementAuditController.listEvents);
router.get("/audit-events/facets", requireAnyPermission([PROC_PERMS.auditView]), ProcurementAuditController.facets);
router.get("/audit-events/export", requireAnyPermission([PROC_PERMS.auditView]), ProcurementAuditController.exportCsv);
router.get("/audit-events/:id", requireAnyPermission([PROC_PERMS.auditView]), ProcurementAuditController.getEvent);

// SRD §34-§40: notification rules and log, numbering formats, currency and exchange rates, reports and their exports, dashboards, statuses.
const settingsRead = requireAnyPermission([PROC_PERMS.auditView, PROC_PERMS.rfqView, PROC_PERMS.ordersView]);
const settingsWrite = requireAnyPermission([PROC_PERMS.auditView]);
router.get("/notification-rules", settingsRead, Insights.getRules);
router.put("/notification-rules", settingsWrite, Insights.putRules);
router.get("/notification-log", requireAnyPermission([PROC_PERMS.auditView]), Insights.notificationLog);
router.post("/notification-jobs/run", settingsWrite, Insights.runJobs);
router.get("/numbering", settingsRead, Insights.getNumbering);
router.put("/numbering", settingsWrite, Insights.putNumbering);
router.get("/fx", settingsRead, Insights.getFx);
router.put("/fx", settingsWrite, Insights.putFx);
router.get("/fx/rates", settingsRead, Insights.listRates);
router.post("/fx/rates", settingsWrite, Insights.saveRate);
router.delete("/fx/rates/:id", settingsWrite, Insights.deleteRate);
router.get("/fx/convert", settingsRead, Insights.convertPreview);
router.get("/reports", requireAnyPermission([PROC_PERMS.reportsView]), Insights.reports);
router.get("/reports/:key/export", requireAnyPermission([PROC_PERMS.reportsExport]), Insights.exportReport);
router.get("/reports/:key", requireAnyPermission([PROC_PERMS.reportsView]), Insights.report);
router.get("/dashboards/me", Insights.myDashboard);
router.get("/dashboards/procurement", requireAnyPermission([PROC_PERMS.dashboardView]), Insights.dashboard);
router.get("/dashboards/executive", requireAnyPermission([PROC_PERMS.dashboardExecutive]), Insights.executive);
router.get("/statuses", Insights.statuses);
router.put("/requisitions/:id/cancel", Insights.cancelRequisition);
router.put("/requisitions/:id/close", requireAnyPermission([PROC_PERMS.rfqManage, PROC_PERMS.ordersManage]), Insights.closeRequisition);
router.post("/rfqs/:id/approve", requireAnyPermission([PROC_PERMS.rfqAward, PROC_PERMS.rfqManage]), Insights.approveRfq);
router.post("/rfqs/:id/publish", requireAnyPermission([PROC_PERMS.rfqManage]), Insights.publishRfq);
router.post("/rfqs/:id/close", requireAnyPermission([PROC_PERMS.rfqManage]), Insights.closeRfq);
router.post("/rfqs/:id/cancel", requireAnyPermission([PROC_PERMS.rfqManage]), Insights.cancelRfq);
router.put("/purchase-orders/:id/cancel", requireAnyPermission([PROC_PERMS.ordersManage]), Insights.cancelPurchaseOrder);
router.put("/purchase-orders/:id/close", requireAnyPermission([PROC_PERMS.ordersManage]), Insights.closePurchaseOrder);
router.get("/status-history", requireAnyPermission([PROC_PERMS.auditView, PROC_PERMS.rfqView, PROC_PERMS.ordersView]), Insights.statusHistory);

// Plans, contracts and the document vault (staff-only by the guards above; each route has its own grant).
router.use(procurementRegistersRoutes);

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
// Items bought before (last price, vendors) as a requisition line is typed; ahead of /requisitions/:id.
router.get("/requisitions/line-suggestions", ProcurementController.requisitionLineSuggestions);
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

// SRD §11/§12: return for amendment, comments, delegation, decision history, position, attachments.
router.post("/requisitions/context", Flow.context);
router.put("/requisitions/:id/return", Flow.returnForAmendment);
router.post("/requisitions/:id/comments", Flow.comment);
router.post("/requisitions/:id/delegate", Flow.delegate);
router.get("/requisitions/:id/delegate-candidates", Flow.delegateCandidates);
router.get("/requisitions/:id/decisions", Flow.decisions);
router.get("/requisitions/:id/position", Flow.position);
router.get("/requisitions/:id/attachments", Flow.attachments);
router.post("/requisitions/:id/attachments", requisitionUpload.array("files", 10), Flow.addAttachment);
router.delete("/requisitions/:id/attachments/:attachmentId", Flow.removeAttachment);
// Budget master, requisition policy and the form's vocabulary.
router.get("/budgets", Flow.budgets);
router.post("/budgets", Flow.saveBudget);
router.put("/budgets/:id", Flow.saveBudget);
router.get("/requisition-options", Flow.options);
router.get("/requisition-policy", Flow.policy);
router.put("/requisition-policy", Flow.savePolicy);

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

// SRD §11 "Attachments". Ownership-gated in the controller rather than procurement.documents.manage,
// which a requester does not hold; any authenticated staff user can list (mirrors GET /requisitions/:id).
router.post(
  "/requisitions/:id/attachments",
  uploadRequisitionAttachment.array("files", 10),
  ProcurementController.uploadRequisitionAttachments
);
router.get("/requisitions/:id/attachments", ProcurementController.listRequisitionAttachments);

router.post("/purchase-orders", requireAnyPermission([PROC_PERMS.ordersManage]), ProcurementController.createPurchaseOrder);
router.get("/purchase-orders", requireAnyPermission([PROC_PERMS.ordersView]), ProcurementController.getAllPurchaseOrders);
/** Public verify is registered above `authenticate` (Suite 04.3). Keep this path free of `:id` traps. */
// §21 the PO's own approval. The queue and the decision are open to any signed-in approver: the server checks they hold the step.
router.get("/purchase-orders/approval-queue", P2p.poApprovalQueue);
router.post("/purchase-orders/:id/submit-for-approval", requireAnyPermission([PROC_PERMS.ordersManage, PROC_PERMS.ordersSend]), P2p.poSubmitForApproval);
router.post("/purchase-orders/:id/approval/decide", P2p.poDecide);
router.get("/purchase-orders/:id/approvals", requireAnyPermission([PROC_PERMS.ordersView]), P2p.poApprovals);
router.get("/p2p/config", P2p.config);

// §29-§31 the optional AI layer. Every route is gated in the service by the organisation's switch, groups, types and limits.
router.get("/ai/status", P2p.aiStatus);
router.get("/ai/usage", requireAnyPermission([PROC_PERMS.auditView]), P2p.aiUsage);
router.get("/ai/extractions", requireAnyPermission([PROC_PERMS.aiUse]), P2p.aiList);
router.post("/ai/extract", requireAnyPermission([PROC_PERMS.aiUse]), requisitionUpload.single("document"), P2p.aiExtract);
router.get("/ai/extractions/:id", requireAnyPermission([PROC_PERMS.aiUse]), P2p.aiGet);
router.get("/ai/extractions/:id/source", requireAnyPermission([PROC_PERMS.aiUse]), P2p.aiSource);
router.put("/ai/extractions/:id/fields/:key", requireAnyPermission([PROC_PERMS.aiUse]), P2p.aiDecide);
router.post("/ai/extractions/:id/complete", requireAnyPermission([PROC_PERMS.aiUse]), P2p.aiComplete);
router.get("/ai/extractions/:id/confirmed", requireAnyPermission([PROC_PERMS.aiUse]), P2p.aiConfirmed);
router.post("/ai/extractions/:id/discard", requireAnyPermission([PROC_PERMS.aiUse]), P2p.aiDiscard);
router.get("/purchase-orders/:id", requireAnyPermission([PROC_PERMS.ordersView]), ProcurementController.getPurchaseOrderById);
router.post("/purchase-orders/:id/send", requireAnyPermission([PROC_PERMS.ordersSend]), ProcurementController.sendPurchaseOrder);
router.post(
  "/purchase-orders/:id/amend",
  requireAnyPermission([PROC_PERMS.ordersManage]),
  ProcurementController.amendPurchaseOrder
);
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
/**
 * The event register: procurement staff with the view grant, and evaluation committee members, who hold no procurement role but
 * must be able to find the events they sit on. The controller narrows a committee member's list to those events.
 */
async function rfqListAccess(req: any, res: any, next: any) {
  try {
    const { userHasEffectivePermission, isModulePrivilegedUser } = await import("../config/cfoModulePermissions");
    if (isModulePrivilegedUser(req.user) || userHasEffectivePermission(req.user, PROC_PERMS.rfqView)) return next();
    const { prisma } = await import("../utils/database");
    if (req.user?.id && (await prisma.rfqEvaluationMember.count({ where: { userId: req.user.id } })) > 0) return next();
  } catch {
    /* fall through to the refusal */
  }
  return res.status(403).json({ success: false, message: "Insufficient permissions. Required one of: procurement.rfq.view" });
}
router.get("/rfq", rfqListAccess, ProcurementController.getAllRFQs);

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
router.get("/rfqs/:id/comparison-matrix", Src.comparison);

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
router.post("/rfqs/:id/open-bids", Src.open);
router.put("/rfqs/:id/scoring-config", Src.gone("Evaluation criteria are set with PUT /procurement/rfqs/:id/evaluation/criteria."));

// SRD §15-§20 (sourcing, opening, evaluation, award). Access to submissions is decided server-side in SourcingAccessService.
router.get("/rfqs/award-queue", Src.awardQueue);
router.get("/rfqs/:id/sourcing", Src.state);
router.get("/rfqs/:id/opening", Src.opening);
router.get("/rfqs/:id/opening/verify", Src.verifyOpening);
router.post("/rfqs/:id/open", Src.open);
router.put("/rfqs/:id/fx-rate", Src.setFxRate);
router.post(
  "/rfqs/:id/quotations/capture",
  quotationCaptureUpload.fields([{ name: "documents", maxCount: 10 }, { name: "technicalDocuments", maxCount: 10 }]),
  Src.capture
);
router.get("/rfqs/:id/quotations/:qid/verify", Src.verifyQuotation);
router.put("/rfqs/:id/evaluation/criteria", Src.setCriteria);
router.post("/rfqs/:id/evaluation/criteria/default", Src.applyDefaultCriteria);
router.put("/rfqs/:id/evaluation/committee", Src.setCommittee);
router.post("/rfqs/:id/evaluation/declaration", Src.declare);
router.put("/rfqs/:id/evaluation/scores", Src.saveScores);
router.get("/rfqs/:id/evaluation/my-scorecard", Src.myScorecard);
router.post("/rfqs/:id/evaluation/scorecard/submit", Src.submitScorecard);
router.get("/rfqs/:id/evaluation/consolidation", Src.consolidation);
router.get("/evaluation-declaration-options", Src.declarationOptions);
router.post("/evaluation-declaration-options", Src.saveDeclarationOption);
router.put("/evaluation-declaration-options/:id", Src.saveDeclarationOption);
router.get("/rfqs/:id/recommendation", Src.recommendation);
router.post("/rfqs/:id/recommendation", Src.prepareRecommendation);
router.post("/rfqs/:id/recommendation/submit", Src.submitRecommendation);
router.post("/rfqs/:id/recommendation/decide", Src.decideRecommendation);
router.patch("/rfqs/:id/closing", requireAnyPermission([PROC_PERMS.rfqManage]), ProcurementController.patchRfqExtend);
// Formal reopen after the deadline: reason required, audited, recorded in rfq_reopen_events.
router.post("/rfqs/:id/reopen", requireAnyPermission([PROC_PERMS.rfqManage]), ProcurementController.postRfqReopen);
router.get("/rfqs/:id/reopen-events", requireAnyPermission([PROC_PERMS.rfqView]), ProcurementController.getRfqReopenEvents);
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

// Reject an invoice awaiting approval, with a reason; the approver's grant decides both outcomes.
router.put("/invoices/:id/reject", requireAnyPermission([PROC_PERMS.invoicesApprove]), ProcurementController.rejectProcurementInvoice);
router.patch(
  "/invoices/:id/finance-handoff",
  requireAnyPermission([PROC_PERMS.invoicesApprove, PROC_PERMS.invoicesPay]),
  ProcurementController.patchInvoiceFinanceHandoff
);
router.post("/invoices/:id/finance-handoff", requireAnyPermission([PROC_PERMS.invoicesApprove, PROC_PERMS.invoicesPay]), ProcurementController.patchInvoiceFinanceHandoff);
router.get("/invoices/:id/finance-handoff", requireAnyPermission([PROC_PERMS.invoicesView]), ProcurementController.getInvoiceFinanceHandoff);

// Re-run the three-way match. It also runs on its own when an invoice is created and when a GRN
// on the same PO is recorded, approved or rejected; this is for an approver who wants it now.
router.post("/invoices/:id/match", requireAnyPermission([PROC_PERMS.invoicesApprove, PROC_PERMS.intakeManage]), ProcurementController.matchProcurementInvoice);

// Read the invoice's supplier document with the LLM now and compare it with the captured invoice. Invoices that arrive
// with a document are read on their own; this re-reads one (older, or its reading failed) for an approver or AP.
router.post("/invoices/:id/read", requireAnyPermission([PROC_PERMS.invoicesApprove, PROC_PERMS.intakeManage]), ProcurementController.readProcurementInvoice);

// SRD §7 Invoice Processing "Flag for Review": an open invoice marked for review with why; its reviewers are alerted.
router.post("/invoices/:id/flag", requireAnyPermission([PROC_PERMS.invoicesApprove, PROC_PERMS.intakeManage]), ProcurementController.flagProcurementInvoice);

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
router.post("/goods-received-notes/upload", requireAnyPermission([PROC_PERMS.receivingManage]), requisitionUpload.array("files", 10), P2p.uploadReceiptFiles);
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
