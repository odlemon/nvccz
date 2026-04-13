// @ts-nocheck
import express from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import { BscDigitalEntryController } from "../controllers/BscDigitalEntryController";

const router = express.Router();
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
  BscDigitalEntryController.financialOutcomeRoi
);
router.post(
  "/internal-process-funding-rate",
  authenticate,
  BscDigitalEntryController.internalProcessFundingRate
);
router.post("/stakeholder-survey", authenticate, BscDigitalEntryController.stakeholderSurvey);
router.post(
  "/partnerships-signed",
  authenticate,
  uploadBscMou.single("mouFile"),
  BscDigitalEntryController.partnershipsSigned
);
router.post(
  "/service-delivery-customer-charter",
  authenticate,
  uploadBscCharterEvidence.array("supportingDocuments", 10),
  BscDigitalEntryController.serviceDeliveryCustomerCharter
);
router.post(
  "/jobs-created-aggregate",
  authenticate,
  BscDigitalEntryController.jobsCreatedAggregate
);
router.post(
  "/resource-budget-alignment",
  authenticate,
  BscDigitalEntryController.resourceBudgetAlignment
);
router.post(
  "/inclusion-diversity-reporting",
  authenticate,
  BscDigitalEntryController.inclusionDiversityReporting
);
router.post(
  "/accounting-period-from-gl",
  authenticate,
  BscDigitalEntryController.accountingPeriodFromGl
);
router.post(
  "/statutory-reports-output",
  authenticate,
  uploadBscStatutoryEvidence.single("evidenceFile"),
  BscDigitalEntryController.statutoryReportsOutput
);
router.post(
  "/governance-checklist-score",
  authenticate,
  BscDigitalEntryController.governanceChecklistScore
);
router.post(
  "/procurement-plan-compliance",
  authenticate,
  BscDigitalEntryController.procurementPlanCompliance
);
router.post(
  "/ease-of-doing-business-progress",
  authenticate,
  BscDigitalEntryController.easeOfDoingBusinessProgress
);
router.post(
  "/skills-development-progress",
  authenticate,
  BscDigitalEntryController.skillsDevelopmentProgress
);
router.post(
  "/csr-participation-rate",
  authenticate,
  BscDigitalEntryController.csrParticipationRate
);

export default router;
