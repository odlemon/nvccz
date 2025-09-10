// @ts-nocheck
import express from "express";
import { ExitInterviewController } from "../controllers/ExitInterviewController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

// Exit Interview Routes
router.post("/", authenticate, authorize(["admin", "ceo", "hr_manager"]), ExitInterviewController.createExitInterview);
router.get("/", authenticate, ExitInterviewController.getAllExitInterviews);
router.get("/:id", authenticate, ExitInterviewController.getExitInterviewById);
router.put("/:id", authenticate, authorize(["admin", "ceo", "hr_manager"]), ExitInterviewController.updateExitInterview);
router.delete("/:id", authenticate, authorize(["admin", "ceo", "hr_manager"]), ExitInterviewController.deleteExitInterview);

// Turnover Analysis Routes
router.get("/analytics/turnover", authenticate, ExitInterviewController.getTurnoverAnalysis);
router.get("/analytics/summary", authenticate, ExitInterviewController.getTurnoverAnalytics);

export default router;
