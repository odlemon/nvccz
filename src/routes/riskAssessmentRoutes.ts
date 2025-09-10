// @ts-nocheck
import express from "express";
import { RiskAssessmentController } from "../controllers/RiskAssessmentController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

// Risk Assessment Routes
router.post("/", authenticate, authorize(["admin", "ceo", "fund_manager"]), RiskAssessmentController.createRiskAssessment);
router.get("/", authenticate, RiskAssessmentController.getAllRiskAssessments);
router.get("/:id", authenticate, RiskAssessmentController.getRiskAssessmentById);
router.put("/:id", authenticate, RiskAssessmentController.updateRiskAssessment);
router.delete("/:id", authenticate, authorize(["admin", "ceo", "fund_manager"]), RiskAssessmentController.deleteRiskAssessment);

// Risk Assessment Sub-task Routes
router.post("/:id/sub-tasks", authenticate, RiskAssessmentController.createRiskAssessmentSubTask);
router.put("/sub-tasks/:id", authenticate, RiskAssessmentController.updateRiskAssessmentSubTask);
router.get("/:id/sub-tasks", authenticate, RiskAssessmentController.getRiskAssessmentSubTasks);

// Risk Assessment History Routes
router.post("/:id/history", authenticate, RiskAssessmentController.addRiskAssessmentHistory);
router.get("/:id/history", authenticate, RiskAssessmentController.getRiskAssessmentHistory);

// Risk Assessment Analytics Routes
router.get("/analytics/summary", authenticate, RiskAssessmentController.getRiskAssessmentAnalytics);

export default router;
