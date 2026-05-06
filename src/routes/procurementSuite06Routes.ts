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
 *     summary: Create vendor invoice intake (multipart form-data or URL)
 *     tags: [Procurement — AI invoice intake (Suite 06)]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [vendorId]
 *             properties:
 *               document:
 *                 type: string
 *                 format: binary
 *                 description: PDF invoice (max 15MB). If provided, server uploads and uses resulting documentUrl.
 *               documentUrl:
 *                 type: string
 *                 format: uri
 *                 description: Optional alternative to file upload (must be server-downloadable).
 *               vendorId:
 *                 type: string
 *                 example: "clxxxxxxxxxxxxxxxxxxxx"
 *               sourcePurchaseOrderId:
 *                 type: string
 *                 nullable: true
 *               goodsReceivedNoteId:
 *                 type: string
 *                 nullable: true
 *           examples:
 *             withFile:
 *               value:
 *                 vendorId: "clvendor123"
 *             withUrl:
 *               value:
 *                 documentUrl: "https://storage.example.com/invoices/acme-2026-001.pdf"
 *                 vendorId: "clvendor123"
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
 *     tags: [Procurement — AI invoice intake (Suite 06)]
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
 *         description: Intake updated (EXTRACTED or PENDING_VERIFICATION)
 */
router.post("/intakes/:id/extract", ProcurementSuite06Controller.runExtract);

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
