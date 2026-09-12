// @ts-nocheck
import express from "express";
import { RiskAssessmentController } from "../controllers/RiskAssessmentController";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard"
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();
const READ_KEYS = ["performance.risks.view", "performance.risks.manage"]
const WRITE_KEYS = ["performance.risks.manage"]
const guard = methodGuard(READ_KEYS, WRITE_KEYS)

// Risk Assessment Routes
router.post("/", authenticate, guard, authorize(["admin", "ceo", "fund_manager"]), RiskAssessmentController.createRiskAssessment);
router.get("/", authenticate, guard, RiskAssessmentController.getAllRiskAssessments);
router.get("/:id", authenticate, guard, RiskAssessmentController.getRiskAssessmentById);
router.put("/:id", authenticate, guard, RiskAssessmentController.updateRiskAssessment);
router.delete("/:id", authenticate, guard, authorize(["admin", "ceo", "fund_manager"]), RiskAssessmentController.deleteRiskAssessment);

// Risk Assessment Sub-task Routes
router.post("/:id/sub-tasks", authenticate, guard, RiskAssessmentController.createRiskAssessmentSubTask);
router.put("/sub-tasks/:id", authenticate, guard, RiskAssessmentController.updateRiskAssessmentSubTask);
router.get("/:id/sub-tasks", authenticate, guard, RiskAssessmentController.getRiskAssessmentSubTasks);

// Risk Assessment History Routes
router.post("/:id/history", authenticate, guard, RiskAssessmentController.addRiskAssessmentHistory);
router.get("/:id/history", authenticate, guard, RiskAssessmentController.getRiskAssessmentHistory);

// Risk Assessment Analytics Routes
router.get("/analytics/summary", authenticate, guard, RiskAssessmentController.getRiskAssessmentAnalytics);

export default router;
