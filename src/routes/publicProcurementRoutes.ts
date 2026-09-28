// @ts-nocheck
import { Router } from "express";
import { vendorPortalReadLimiter, vendorPortalWriteLimiter } from "../middleware/vendorPortalRateLimit";
import { PublicProcurementController } from "../controllers/PublicProcurementController";

const router = Router();

router.get("/procurement/rfqs", vendorPortalReadLimiter, PublicProcurementController.listPublicRfqs);
router.post(
  "/purchase-orders/:token/acknowledge",
  vendorPortalWriteLimiter,
  PublicProcurementController.acknowledgePurchaseOrder
);

export default router;
