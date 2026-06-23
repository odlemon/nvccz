// @ts-nocheck
import { Router } from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import {
  requireLpPortalAccess,
  requireLpManager,
  requireGpAdmin,
  requireSysAdmin,
} from "../middleware/lpPortalAuth";
import { LpPortalController } from "../controllers/LpPortalController";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

router.use(authenticate);

router.get("/dashboard", requireLpPortalAccess, LpPortalController.getDashboard);
router.get("/ledger", requireLpPortalAccess, LpPortalController.listLedger);
router.get("/ledger/:entryId", requireLpPortalAccess, LpPortalController.getLedgerEntry);
router.get("/vault", requireLpPortalAccess, LpPortalController.listVault);
router.get("/vault/:documentId/download", requireLpPortalAccess, LpPortalController.downloadVaultDoc);
router.get("/vault/:documentId/verify", requireLpPortalAccess, LpPortalController.verifyVaultDoc);
router.get("/reports", requireLpPortalAccess, LpPortalController.listReports);
router.get("/reports/:jobId/download", requireLpPortalAccess, LpPortalController.downloadReport);

router.get("/colleagues", requireLpPortalAccess, requireLpManager, LpPortalController.listColleagues);
router.post("/colleagues", requireLpPortalAccess, requireLpManager, LpPortalController.inviteColleague);
router.patch(
  "/colleagues/:membershipId/revoke",
  requireLpPortalAccess,
  requireLpManager,
  LpPortalController.revokeColleague
);

router.get("/admin/memberships", requireGpAdmin, LpPortalController.listAdminMemberships);
router.post("/admin/memberships", requireGpAdmin, LpPortalController.createAdminMembership);
router.patch("/admin/memberships/:membershipId/revoke", requireGpAdmin, LpPortalController.revokeAdminMembership);
router.post(
  "/admin/documents",
  requireGpAdmin,
  upload.single("file"),
  LpPortalController.publishAdminDocument
);
router.get("/admin/mfa-policy", requireSysAdmin, LpPortalController.getMfaPolicy);
router.put("/admin/mfa-policy", requireSysAdmin, LpPortalController.updateMfaPolicy);

export default router;
