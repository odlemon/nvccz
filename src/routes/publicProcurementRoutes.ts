// @ts-nocheck
import { Router } from "express";
import { PublicProcurementController } from "../controllers/PublicProcurementController";

const router = Router();

router.get("/procurement/rfqs", PublicProcurementController.listPublicRfqs);
router.post(
  "/purchase-orders/:token/acknowledge",
  PublicProcurementController.acknowledgePurchaseOrder
);

export default router;
