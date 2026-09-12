// @ts-nocheck
import { Router } from "express";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";
import { FundReportingController } from "../controllers/FundReportingController";
import { FundReportingWebhookController } from "../controllers/FundReportingWebhookController";

const router = Router();
const gpRoles = ["admin", "fund_manager", "cfo"];

router.get("/download/:token", FundReportingController.downloadByToken);
router.post("/webhooks/email-delivery", FundReportingWebhookController.emailDelivery);

router.get("/templates", authenticate, authorize(gpRoles), FundReportingController.listTemplates);
router.post("/templates", authenticate, authorize(gpRoles), FundReportingController.createTemplate);
router.put("/templates/:id", authenticate, authorize(gpRoles), FundReportingController.updateTemplate);
router.delete("/templates/:id", authenticate, authorize(gpRoles), FundReportingController.deleteTemplate);

router.get("/schedules", authenticate, authorize(gpRoles), FundReportingController.listSchedules);
router.post("/schedules", authenticate, authorize(gpRoles), FundReportingController.createSchedule);
router.put("/schedules/:id", authenticate, authorize(gpRoles), FundReportingController.updateSchedule);
router.delete("/schedules/:id", authenticate, authorize(gpRoles), FundReportingController.deleteSchedule);

router.get(
  "/distribution-lists",
  authenticate,
  authorize(gpRoles),
  FundReportingController.listDistributionLists
);
router.post(
  "/distribution-lists",
  authenticate,
  authorize(gpRoles),
  FundReportingController.createDistributionList
);
router.put(
  "/distribution-lists/:id",
  authenticate,
  authorize(gpRoles),
  FundReportingController.updateDistributionList
);
router.delete(
  "/distribution-lists/:id",
  authenticate,
  authorize(gpRoles),
  FundReportingController.deleteDistributionList
);

router.get("/runs", authenticate, authorize(gpRoles), FundReportingController.listRuns);
router.post("/runs", authenticate, authorize(gpRoles), FundReportingController.createRun);
router.get("/runs/:runId", authenticate, authorize(gpRoles), FundReportingController.getRun);
router.get("/runs/:runId/logs", authenticate, authorize(gpRoles), FundReportingController.getRunLogs);
router.get(
  "/runs/:runId/recipients",
  authenticate,
  authorize(gpRoles),
  FundReportingController.getRunRecipients
);
router.get("/audit", authenticate, authorize(gpRoles), FundReportingController.getAuditTrail);

export default router;
