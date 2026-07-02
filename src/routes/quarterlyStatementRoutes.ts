// @ts-nocheck
import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";
import {
  requireQuarterlyStatementView,
  requireQuarterlyStatementCompile,
  requireQuarterlyStatementApprove,
} from "../middleware/quarterlyStatementAuth";
import { QuarterlyStatementController } from "../controllers/QuarterlyStatementController";

const router = Router();
const gpRoles = ["admin", "fund_manager", "cfo"];

router.use(authenticate);
router.use(authorize(gpRoles));

router.get("/runs", QuarterlyStatementController.listRuns);
router.post("/runs", requireQuarterlyStatementCompile, QuarterlyStatementController.createRun);
router.get("/runs/:runId", requireQuarterlyStatementView, QuarterlyStatementController.getRun);
router.get("/runs/:runId/dashboard", requireQuarterlyStatementView, QuarterlyStatementController.getDashboard);
router.post(
  "/runs/:runId/compile",
  requireQuarterlyStatementView,
  requireQuarterlyStatementCompile,
  QuarterlyStatementController.compile
);
router.get(
  "/runs/:runId/recipients",
  requireQuarterlyStatementView,
  QuarterlyStatementController.listRecipients
);
router.get(
  "/runs/:runId/recipients/:clientId/preview",
  requireQuarterlyStatementView,
  QuarterlyStatementController.getPreview
);
router.post(
  "/runs/:runId/recipients/:clientId/recompute",
  requireQuarterlyStatementView,
  requireQuarterlyStatementCompile,
  QuarterlyStatementController.recompute
);
router.post(
  "/runs/:runId/submit-review",
  requireQuarterlyStatementView,
  requireQuarterlyStatementCompile,
  QuarterlyStatementController.submitReview
);
router.post(
  "/runs/:runId/approve",
  requireQuarterlyStatementView,
  requireQuarterlyStatementApprove,
  QuarterlyStatementController.approve
);

export default router;
