// @ts-nocheck
import express from "express";
import { vendorPortalReadLimiter, vendorPortalWriteLimiter } from "../middleware/vendorPortalRateLimit";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import { VendorDocumentAttachmentController } from "../controllers/VendorDocumentAttachmentController";

const router = express.Router();

const uploadDocument = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = String(file.mimetype || "").toLowerCase();
    const name = String(file.originalname || "").toLowerCase();
    const ok =
      mime === "application/pdf" ||
      name.endsWith(".pdf") ||
      mime === "application/octet-stream";
    cb(ok ? null : new Error("Only PDF uploads are accepted on this route"), ok);
  }
});

router.get("/settings/public", VendorDocumentAttachmentController.getPublicSettings);

router.get("/settings", authenticate, VendorDocumentAttachmentController.getSettings);
router.put("/settings", authenticate, VendorDocumentAttachmentController.updateSettings);

router.post(
  "/portal/upload",
  vendorPortalWriteLimiter,
  uploadDocument.single("document"),
  VendorDocumentAttachmentController.portalUpload
);
router.get("/portal/:attachmentId/download", vendorPortalReadLimiter, VendorDocumentAttachmentController.portalDownload);
router.delete("/portal/:attachmentId", VendorDocumentAttachmentController.portalRemove);

router.post(
  "/quotations/:quotationId/attachments",
  authenticate,
  uploadDocument.single("document"),
  VendorDocumentAttachmentController.staffUploadToQuotation
);
router.post(
  "/procurement-invoices/:invoiceId/attachments",
  authenticate,
  uploadDocument.single("document"),
  VendorDocumentAttachmentController.staffUploadToProcurementInvoice
);
router.post(
  "/purchase-invoices/:invoiceId/attachments",
  authenticate,
  uploadDocument.single("document"),
  VendorDocumentAttachmentController.staffUploadToPurchaseInvoice
);

router.get(
  "/by-entity/:entityType/:entityId",
  authenticate,
  VendorDocumentAttachmentController.listByEntity
);

router.get(
  "/:attachmentId/download",
  authenticate,
  VendorDocumentAttachmentController.staffDownload
);
router.put(
  "/:attachmentId/replace",
  authenticate,
  uploadDocument.single("document"),
  VendorDocumentAttachmentController.replace
);
router.delete("/:attachmentId", authenticate, VendorDocumentAttachmentController.remove);

export default router;
