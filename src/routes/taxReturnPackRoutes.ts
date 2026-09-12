// @ts-nocheck
import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";
import {
  requireTaxReturnPackApprove,
  requireTaxReturnPackCompile,
  requireTaxReturnPackView,
} from "../middleware/taxReturnPackAuth";
import { TaxReturnPackController } from "../controllers/TaxReturnPackController";

const router = Router();
const gpRoles = ["admin", "fund_manager", "cfo", "analyst"];

router.use(authenticate);
router.use(authorize(gpRoles));

router.get("/", TaxReturnPackController.list);
router.post("/", requireTaxReturnPackCompile, TaxReturnPackController.create);

router.get("/:packId", requireTaxReturnPackView, TaxReturnPackController.get);
router.get("/:packId/dashboard", requireTaxReturnPackView, TaxReturnPackController.dashboard);
router.post("/:packId/compile", requireTaxReturnPackView, requireTaxReturnPackCompile, TaxReturnPackController.compile);
router.get("/:packId/reconciliation", requireTaxReturnPackView, TaxReturnPackController.reconciliation);
router.patch(
  "/:packId/reconciliation/:lineId",
  requireTaxReturnPackView,
  requireTaxReturnPackCompile,
  TaxReturnPackController.patchReconciliationLine
);
router.get("/:packId/cgt", requireTaxReturnPackView, TaxReturnPackController.cgt);
router.post("/:packId/submit-review", requireTaxReturnPackView, requireTaxReturnPackCompile, TaxReturnPackController.submitReview);
router.post(
  "/:packId/sign-off",
  requireTaxReturnPackView,
  requireTaxReturnPackApprove,
  TaxReturnPackController.signOff
);
router.get("/:packId/pdf", requireTaxReturnPackView, TaxReturnPackController.pdf);
router.get("/:packId/audit", requireTaxReturnPackView, TaxReturnPackController.audit);

export default router;
