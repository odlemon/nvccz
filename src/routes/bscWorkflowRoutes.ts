// @ts-nocheck
import express from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import { BscWorkflowController } from "../controllers/BscWorkflowController";

const router = express.Router();
const uploadBscStatutorySubmissionEvidence = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

/** SRD Flow 6 / Flow 3 follow-ups — authenticate only (no permission matrix). */
router.post(
  "/budget-variance-reports",
  authenticate,
  BscWorkflowController.postBudgetVarianceReport
);
router.get(
  "/budget-variance-reports/by-goal/:goalId",
  authenticate,
  BscWorkflowController.getBudgetVarianceReportsByGoal
);
router.post(
  "/statutory-submissions",
  authenticate,
  uploadBscStatutorySubmissionEvidence.single("evidenceFile"),
  BscWorkflowController.postStatutorySubmissionBundle
);
router.post(
  "/statutory-submissions/:id/manager-sign-off",
  authenticate,
  BscWorkflowController.postStatutoryManagerSignOff
);
router.get(
  "/statutory-submissions/by-goal/:goalId",
  authenticate,
  BscWorkflowController.getStatutorySubmissionsByGoal
);
router.post(
  "/training-certificate-recorded",
  authenticate,
  BscWorkflowController.postTrainingCertificateRecorded
);

export default router;
