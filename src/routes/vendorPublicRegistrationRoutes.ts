// @ts-nocheck
import express from "express";
import multer from "multer";
import { VendorPublicRegistrationController } from "../controllers/VendorPublicRegistrationController";

const router = express.Router();

/**
 * @swagger
 * /public/vendor-registration:
 *   post:
 *     summary: Vendor self-registration (Suite 01 — portal, no login)
 *     description: |
 *       Creates a pending vendor and returns `kycUploadToken` / URL for follow-up KYC uploads.
 *       Duplicate BP/VAT checks apply per server validation.
 *     tags: [Vendor Master, Compliance & KYC (Suite 01)]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Registration payload (company details, tax, contacts — see controller)
 *     responses:
 *       201:
 *         description: Registered; token for KYC upload returned in body
 *       400:
 *         description: Validation error (e.g. duplicate BP/VAT)
 */
router.post("/vendor-registration", VendorPublicRegistrationController.registerFull);

const uploadKyc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 15 },
});

/**
 * @swagger
 * /public/vendor-registration/{token}/kyc-requirements:
 *   get:
 *     summary: KYC slot requirements for this registration token
 *     tags: [Vendor Master, Compliance & KYC (Suite 01)]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Required document types and completion status
 */
router.get(
  "/vendor-registration/:token/kyc-requirements",
  VendorPublicRegistrationController.getKycRequirements
);

/**
 * @swagger
 * /public/vendor-registration/{token}/kyc-documents/{documentId}/download:
 *   get:
 *     summary: Download uploaded KYC file (token auth)
 *     tags: [Vendor Master, Compliance & KYC (Suite 01)]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: documentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: File
 */
router.get(
  "/vendor-registration/:token/kyc-documents/:documentId/download",
  VendorPublicRegistrationController.downloadKyc
);

/**
 * @swagger
 * /public/vendor-registration/{token}/kyc-documents:
 *   post:
 *     summary: Upload KYC documents (multipart; CR14, bank letter, ITF263, etc.)
 *     tags: [Vendor Master, Compliance & KYC (Suite 01)]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               documentType:
 *                 type: string
 *                 description: e.g. CR14, BANK_LETTER, ITF263
 *   get:
 *     summary: List uploaded KYC documents for this token
 *     tags: [Vendor Master, Compliance & KYC (Suite 01)]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 */
router.post(
  "/vendor-registration/:token/kyc-documents",
  uploadKyc.any(),
  VendorPublicRegistrationController.uploadKyc
);
router.get("/vendor-registration/:token/kyc-documents", VendorPublicRegistrationController.listKyc);

/**
 * @swagger
 * /public/vendor-registration/{token}:
 *   get:
 *     summary: Get registration status by token
 *     tags: [Vendor Master, Compliance & KYC (Suite 01)]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: OK
 *   post:
 *     summary: Submit / update registration step (token auth)
 *     tags: [Vendor Master, Compliance & KYC (Suite 01)]
 *     security: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: OK
 */
router.get("/vendor-registration/:token", VendorPublicRegistrationController.getByToken);
router.post("/vendor-registration/:token", VendorPublicRegistrationController.submit);

export default router;
