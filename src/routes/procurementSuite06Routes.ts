// @ts-nocheck
import express from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import { ProcurementSuite06Controller } from "../controllers/ProcurementSuite06Controller";

const router = express.Router();
router.use(authenticate);

const uploadVendorInvoicePdf = multer({
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
 * /procurement/suite06/intakes:
 *   post:
 *     summary: Create vendor invoice intake (multipart form-data, PDF file required)
 *     description: |
 *       **Content-Type:** `multipart/form-data`.
 *       **All fields required:** `document` (PDF file), `vendorId`, `sourcePurchaseOrderId`, `goodsReceivedNoteId`.
 *       URL-only uploads (`documentUrl`) are not supported — upload the PDF using field **`document`** (max 15MB).
 *     tags: [Procurement — AI invoice intake (Suite 06)]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - document
 *               - vendorId
 *               - sourcePurchaseOrderId
 *               - goodsReceivedNoteId
 *             properties:
 *               document:
 *                 type: string
 *                 format: binary
 *                 description: PDF invoice file (field name **document**, max 15MB).
 *               vendorId:
 *                 type: string
 *                 description: Vendor id (cuid).
 *                 example: "clxxxxxxxxxxxxxxxxxxxx"
 *               sourcePurchaseOrderId:
 *                 type: string
 *                 description: Linked purchase order id (cuid).
 *               goodsReceivedNoteId:
 *                 type: string
 *                 description: Linked goods received note id (cuid).
 *           examples:
 *             full:
 *               summary: File + all ids
 *               value:
 *                 vendorId: "clvendor123"
 *                 sourcePurchaseOrderId: "clpo456"
 *                 goodsReceivedNoteId: "clgrn789"
 *     responses:
 *       201:
 *         description: Intake created (status DRAFT)
 *       400:
 *         description: Validation error
 *   get:
 *     summary: List vendor invoice intakes (paginated)
 *     description: Returns `{ success, data: { items, total, skip, take } }`.
 *     tags: [Procurement — AI invoice intake (Suite 06)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Page size (max 100)
 *       - in: query
 *         name: skip
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by intake status (e.g. DRAFT, EXTRACTED, PENDING_VERIFICATION)
 *       - in: query
 *         name: vendorId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 */
router.post(
  "/intakes",
  uploadVendorInvoicePdf.single("document"),
  ProcurementSuite06Controller.createIntake
);

router.get("/intakes", ProcurementSuite06Controller.listIntakes);

/**
 * @swagger
 * /procurement/suite06/intakes/{id}:
 *   get:
 *     summary: Get vendor invoice intake by id
 *     tags: [Procurement — AI invoice intake (Suite 06)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor invoice intake id (cuid)
 *     responses:
 *       200:
 *         description: OK
 *       404:
 *         description: Intake not found
 */
router.get("/intakes/:id", ProcurementSuite06Controller.getIntake);

/**
 * @swagger
 * /procurement/suite06/intakes/{id}/extract:
 *   post:
 *     summary: Run extraction from saved intake (no PDF re-upload)
 *     description: |
 *       Uses **`documentUrl`**, **`vendorId`**, **`sourcePurchaseOrderId`**, and **`goodsReceivedNoteId`** already stored on the intake
 *       (from **POST …/intakes**). **Body optional:** JSON to override links before parsing.
 *       To replace the PDF only, use **POST …/intakes/{id}/document** then call extract again.
 *     tags: [Procurement — AI invoice intake (Suite 06)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor invoice intake id (cuid)
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               vendorId: { type: string, description: Optional override }
 *               sourcePurchaseOrderId: { type: string, description: Optional override }
 *               goodsReceivedNoteId: { type: string, description: Optional override }
 *     responses:
 *       200:
 *         description: Intake updated (EXTRACTED or PENDING_VERIFICATION)
 *       400:
 *         description: Validation error
 *       404:
 *         description: Intake not found
 */
router.post("/intakes/:id/extract", ProcurementSuite06Controller.runExtract);

/**
 * @swagger
 * /procurement/suite06/intakes/{id}/document:
 *   post:
 *     summary: Replace PDF stored on intake
 *     description: |
 *       **multipart/form-data** — field **`document`** (PDF, max 15MB). Updates `documentUrl`; call **POST …/extract** afterward to re-parse.
 *     tags: [Procurement — AI invoice intake (Suite 06)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor invoice intake id (cuid)
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
 *                 description: PDF — field name **document**
 *     responses:
 *       200:
 *         description: OK
 *       400:
 *         description: Validation error
 *       404:
 *         description: Intake not found
 */
router.post(
  "/intakes/:id/document",
  uploadVendorInvoicePdf.single("document"),
  ProcurementSuite06Controller.replaceIntakeDocument
);

/**
 * @swagger
 * /procurement/suite06/intakes/{id}/verify:
 *   patch:
 *     summary: Mark intake as human-verified (clears verification queue)
 *     tags: [Procurement — AI invoice intake (Suite 06)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 */
router.patch("/intakes/:id/verify", ProcurementSuite06Controller.verifyIntake);

/**
 * @swagger
 * /procurement/suite06/intakes/{id}/create-draft-bill:
 *   post:
 *     summary: Create DRAFT vendor bill (purchase invoice) from extracted payload
 *     tags: [Procurement — AI invoice intake (Suite 06)]
 *     security:
 *       - bearerAuth: []
 */
router.post("/intakes/:id/create-draft-bill", ProcurementSuite06Controller.createDraftBill);

/**
 * @swagger
 * /procurement/suite06/field-corrections:
 *   post:
 *     summary: Upsert per-vendor field correction map (feeds future extractions)
 *     tags: [Procurement — AI invoice intake (Suite 06)]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [vendorId, fieldKey, correctedValue]
 *             properties:
 *               vendorId: { type: string }
 *               fieldKey: { type: string, example: "invoiceNumber" }
 *               correctedValue: { type: string, example: "INV-77821" }
 *     responses:
 *       200:
 *         description: Correction saved
 */
router.post("/field-corrections", ProcurementSuite06Controller.upsertFieldCorrection);

/**
 * @swagger
 * /procurement/suite06/purchase-invoices/{purchaseInvoiceId}/run-match:
 *   post:
 *     summary: Run 3-way match (PO vs GRN vs bill lines)
 *     tags: [Procurement — 3-way match (Suite 06)]
 *     security:
 *       - bearerAuth: []
 */
router.post(
  "/purchase-invoices/:purchaseInvoiceId/run-match",
  ProcurementSuite06Controller.runThreeWayMatch
);

/**
 * @swagger
 * /procurement/suite06/verification-queue:
 *   get:
 *     summary: List intakes pending human verification (low confidence)
 *     tags: [Procurement — AI invoice intake (Suite 06)]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: take
 *         schema:
 *           type: integer
 *           default: 50
 */
router.get("/verification-queue", ProcurementSuite06Controller.verificationQueue);

/**
 * @swagger
 * /procurement/suite06/cfo-dashboard:
 *   get:
 *     summary: CFO summary — matched vs disputed bills vs verification queue depth
 *     tags: [Procurement — Match dashboard (Suite 06)]
 *     security:
 *       - bearerAuth: []
 */
router.get("/cfo-dashboard", ProcurementSuite06Controller.cfoDashboard);

router.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (!err) {
    return res.status(500).json({ success: false, message: "Unknown error" });
  }
  if (err instanceof multer.MulterError) {
    const msg =
      err.code === "LIMIT_FILE_SIZE"
        ? "PDF is too large (max 15MB)"
        : err.message || "Upload failed";
    return res.status(400).json({ success: false, message: msg, error: err.code });
  }
  return res.status(400).json({ success: false, message: err.message || "Request failed" });
});

export default router;
