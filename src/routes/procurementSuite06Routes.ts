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
 */
router.post(
  "/intakes",
  uploadVendorInvoicePdf.single("document"),
  ProcurementSuite06Controller.createIntake
);

/**
 * @swagger
 * /procurement/suite06/intakes/{id}:
 *   get:
 *     summary: Get vendor invoice intake by id
 *     tags: [Procurement — AI invoice intake (Suite 06)]
 *     security:
 *       - bearerAuth: []
 */
router.get("/intakes/:id", ProcurementSuite06Controller.getIntake);

/**
 * @swagger
 * /procurement/suite06/intakes/{id}/extract:
 *   post:
 *     summary: Run PDF text extraction + LLM structured parse
 *     description: |
 *       **Content-Type:** `multipart/form-data`** — same required fields as **POST …/intakes**:
 *       **`document`** (PDF), **`vendorId`**, **`sourcePurchaseOrderId`**, **`goodsReceivedNoteId`**.
 *       The file is uploaded, the intake row `{id}` is updated with the new URL and ids, then extraction runs.
 *       URL-only (`documentUrl`) is not supported.
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
 *               - vendorId
 *               - sourcePurchaseOrderId
 *               - goodsReceivedNoteId
 *             properties:
 *               document:
 *                 type: string
 *                 format: binary
 *                 description: PDF invoice file (field **document**, max 15MB).
 *               vendorId:
 *                 type: string
 *                 description: Vendor id (cuid).
 *               sourcePurchaseOrderId:
 *                 type: string
 *                 description: Linked purchase order id (cuid).
 *               goodsReceivedNoteId:
 *                 type: string
 *                 description: Linked goods received note id (cuid).
 *     responses:
 *       200:
 *         description: Intake updated (EXTRACTED or PENDING_VERIFICATION)
 *       400:
 *         description: Validation error
 *       404:
 *         description: Intake not found
 */
router.post(
  "/intakes/:id/extract",
  uploadVendorInvoicePdf.single("document"),
  ProcurementSuite06Controller.runExtract
);

// Ensure multer + route errors return JSON (otherwise clients can hang waiting on a response).
router.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (!err) {
    return res.status(500).json({ success: false, message: "Unknown error" });
  }
  // Multer file size / parsing errors
  if (err instanceof multer.MulterError) {
    const msg =
      err.code === "LIMIT_FILE_SIZE"
        ? "PDF is too large (max 15MB)"
        : err.message || "Upload failed";
    return res.status(400).json({ success: false, message: msg, error: err.code });
  }
  // fileFilter / other thrown errors
  return res.status(400).json({ success: false, message: err.message || "Request failed" });
});

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

export default router;
