// @ts-nocheck
import express from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard"
import { BscDigitalEntryController } from "../controllers/BscDigitalEntryController";

const router = express.Router();
const READ_KEYS = ["performance.bsc.view", "performance.bsc.manage"]
const WRITE_KEYS = ["performance.bsc.manage"]
const guard = methodGuard(READ_KEYS, WRITE_KEYS)
const uploadBscMou = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});
const uploadBscCharterEvidence = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});
const uploadBscStatutoryEvidence = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

/**
 * BSC digital data entry — requirement-named paths (no numbered “flow” segments).
 * `authenticate` only; no role/permission gates. Optional body `responsibleUserId` for audit.
 */
router.post(
  "/financial-outcome-roi",
  authenticate,
  guard,
  BscDigitalEntryController.financialOutcomeRoi
);
router.post(
  "/internal-process-funding-rate",
  authenticate,
  guard,
  BscDigitalEntryController.internalProcessFundingRate
);
router.post("/stakeholder-survey", authenticate, guard, BscDigitalEntryController.stakeholderSurvey);
router.post(
  "/partnerships-signed",
  authenticate,
  guard,
  uploadBscMou.single("mouFile"),
  BscDigitalEntryController.partnershipsSigned
);
router.post(
  "/service-delivery-customer-charter",
  authenticate,
  guard,
  uploadBscCharterEvidence.array("supportingDocuments", 10),
  BscDigitalEntryController.serviceDeliveryCustomerCharter
);
router.post(
  "/jobs-created-aggregate",
  authenticate,
  guard,
  BscDigitalEntryController.jobsCreatedAggregate
);
router.post(
  "/resource-budget-alignment",
  authenticate,
  guard,
  BscDigitalEntryController.resourceBudgetAlignment
);
router.post(
  "/inclusion-diversity-reporting",
  authenticate,
  guard,
  BscDigitalEntryController.inclusionDiversityReporting
);
router.post(
  "/accounting-period-from-gl",
  authenticate,
  guard,
  BscDigitalEntryController.accountingPeriodFromGl
);
router.post(
  "/statutory-reports-output",
  authenticate,
  guard,
  uploadBscStatutoryEvidence.single("evidenceFile"),
  BscDigitalEntryController.statutoryReportsOutput
);
router.post(
  "/governance-checklist-score",
  authenticate,
  guard,
  BscDigitalEntryController.governanceChecklistScore
);
router.post(
  "/procurement-plan-compliance",
  authenticate,
  guard,
  BscDigitalEntryController.procurementPlanCompliance
);
router.post(
  "/ease-of-doing-business-progress",
  authenticate,
  guard,
  BscDigitalEntryController.easeOfDoingBusinessProgress
);
router.post(
  "/skills-development-progress",
  authenticate,
  guard,
  BscDigitalEntryController.skillsDevelopmentProgress
);
router.post(
  "/csr-participation-rate",
  authenticate,
  guard,
  BscDigitalEntryController.csrParticipationRate
);

export default router;
