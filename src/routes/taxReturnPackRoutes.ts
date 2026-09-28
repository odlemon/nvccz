// @ts-nocheck
import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";
import { userHasEffectivePermission } from "../config/cfoModulePermissions";
import {
  requireTaxReturnPackApprove,
  requireTaxReturnPackCompile,
  requireTaxReturnPackView,
} from "../middleware/taxReturnPackAuth";
import { TaxReturnPackController } from "../controllers/TaxReturnPackController";

const router = Router();
const gpRoles = ["admin", "fund_manager", "cfo", "analyst"];

router.use(authenticate);
// tax returns are prepared in Accounting as well as by the fund team: either the GP roles or an accounting permission
const gpOnly = authorize(gpRoles);
const ACCOUNTING_READ = ["view_accounting", "manage_accounting", "manage_ledger", "view_financial_reports"];
router.use((req: any, res: any, next: any) => (ACCOUNTING_READ.some((k) => userHasEffectivePermission(req.user, k)) ? next() : gpOnly(req, res, next)));

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
