// @ts-nocheck
import express from "express";
import { ResearchReportController } from "../controllers/ResearchReportController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

// Research Report Routes
router.post("/", authenticate, authorize(["admin", "ceo", "fund_manager"]), ResearchReportController.createResearchReport);
router.get("/", authenticate, ResearchReportController.getAllResearchReports);
router.get("/:id", authenticate, ResearchReportController.getResearchReportById);
router.put("/:id", authenticate, ResearchReportController.updateResearchReport);
router.delete("/:id", authenticate, authorize(["admin", "ceo", "fund_manager"]), ResearchReportController.deleteResearchReport);

// Research Report Activity Routes
router.post("/:id/activities", authenticate, ResearchReportController.createResearchReportActivity);
router.get("/:id/activities", authenticate, ResearchReportController.getResearchReportActivities);

// Research Report Summary Routes
router.get("/summary/quarterly", authenticate, ResearchReportController.getQuarterlyReportSummary);

export default router;
