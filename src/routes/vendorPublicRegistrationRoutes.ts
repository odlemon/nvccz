// @ts-nocheck
import express from "express";
import multer from "multer";
import { VendorPublicRegistrationController } from "../controllers/VendorPublicRegistrationController";

const router = express.Router();

router.post("/vendor-registration", VendorPublicRegistrationController.registerFull);

const uploadKyc = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 15 },
});

// Vendor portal KYC (token auth — must be registered before less-specific :token routes)
router.get(
  "/vendor-registration/:token/kyc-requirements",
  VendorPublicRegistrationController.getKycRequirements
);
router.get(
  "/vendor-registration/:token/kyc-documents/:documentId/download",
  VendorPublicRegistrationController.downloadKyc
);
router.post(
  "/vendor-registration/:token/kyc-documents",
  uploadKyc.any(),
  VendorPublicRegistrationController.uploadKyc
);
router.get("/vendor-registration/:token/kyc-documents", VendorPublicRegistrationController.listKyc);

router.get("/vendor-registration/:token", VendorPublicRegistrationController.getByToken);
router.post("/vendor-registration/:token", VendorPublicRegistrationController.submit);

export default router;
