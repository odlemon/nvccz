// @ts-nocheck
import express from "express";
import { PerformanceFpaIntegrationController } from "../controllers/PerformanceFpaIntegrationController";
import { authenticate } from "../middleware/authenticate";
import { requireInternalStaffUser } from "../middleware/permissionAuth";
import { methodGuard } from "../middleware/methodGuard";

const router = express.Router();
// External LP/investee portal accounts have no legitimate reason to reach
// this integration surface — same fix pattern as fpaRoutes.ts.
router.use(authenticate, requireInternalStaffUser());

const READ_KEYS = ["performance.goals.view", "performance.goals.manage"];
const WRITE_KEYS = ["performance.goals.manage"];
const guard = methodGuard(READ_KEYS, WRITE_KEYS);

// Target Mapping (SRD-4 §22, direction 1)
router.get("/target-mappings", guard, PerformanceFpaIntegrationController.listTargetMappings);
router.post("/target-mappings", guard, PerformanceFpaIntegrationController.createTargetMapping);
router.put("/target-mappings/:id/active", guard, PerformanceFpaIntegrationController.setTargetMappingActive);
router.delete("/target-mappings/:id", guard, PerformanceFpaIntegrationController.deleteTargetMapping);

// Driver Mapping (SRD-4 §22, direction 2)
router.get("/driver-mappings", guard, PerformanceFpaIntegrationController.listDriverMappings);
router.post("/driver-mappings", guard, PerformanceFpaIntegrationController.createDriverMapping);
router.put("/driver-mappings/:id/active", guard, PerformanceFpaIntegrationController.setDriverMappingActive);
router.delete("/driver-mappings/:id", guard, PerformanceFpaIntegrationController.deleteDriverMapping);

// Forecast Review Trigger queue (SRD-4 §22, direction 2 — human review only)
router.get("/review-triggers", guard, PerformanceFpaIntegrationController.listReviewTriggers);
router.get("/review-triggers/:id", guard, PerformanceFpaIntegrationController.getReviewTrigger);
router.post("/review-triggers/:id/claim", guard, PerformanceFpaIntegrationController.claimReviewTrigger);
router.post("/review-triggers/:id/decide", guard, PerformanceFpaIntegrationController.decideReviewTrigger);

export default router;
