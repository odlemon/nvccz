// @ts-nocheck
import express from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard"
import { BscWorkflowController } from "../controllers/BscWorkflowController";

const router = express.Router();
const READ_KEYS = ["performance.bsc.view", "performance.bsc.manage"]
const WRITE_KEYS = ["performance.bsc.manage"]
const guard = methodGuard(READ_KEYS, WRITE_KEYS)
const uploadBscStatutorySubmissionEvidence = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

/** SRD Flow 6 / Flow 3 follow-ups — authenticate only (no permission matrix). */
router.post(
  "/budget-variance-reports",
  authenticate,
  guard,
  BscWorkflowController.postBudgetVarianceReport
);
router.get(
  "/budget-variance-reports/by-goal/:goalId",
  authenticate,
  guard,
  BscWorkflowController.getBudgetVarianceReportsByGoal
);
router.post(
  "/statutory-submissions",
  authenticate,
  guard,
  uploadBscStatutorySubmissionEvidence.single("evidenceFile"),
  BscWorkflowController.postStatutorySubmissionBundle
);
router.post(
  "/statutory-submissions/:id/manager-sign-off",
  authenticate,
  guard,
  BscWorkflowController.postStatutoryManagerSignOff
);
router.get(
  "/statutory-submissions/by-goal/:goalId",
  authenticate,
  guard,
  BscWorkflowController.getStatutorySubmissionsByGoal
);
router.post(
  "/training-certificate-recorded",
  authenticate,
  guard,
  BscWorkflowController.postTrainingCertificateRecorded
);

export default router;
