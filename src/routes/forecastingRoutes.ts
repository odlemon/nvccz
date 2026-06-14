// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { ForecastingController } from "../controllers/ForecastingController";

const router = express.Router();

router.use(authenticate);

router.post("/scenarios", ForecastingController.createScenario);
router.get("/scenarios", ForecastingController.listScenarios);
router.get("/scenarios/counts", ForecastingController.scenarioCounts);
router.get("/scenarios/:id", ForecastingController.getScenario);
router.patch("/scenarios/:id", ForecastingController.patchScenario);
router.get("/scenarios/:id/summary", ForecastingController.getSummary);
router.get("/scenarios/:id/grid", ForecastingController.getGrid);
router.put("/scenarios/:id/drivers", ForecastingController.putDrivers);
router.patch("/scenarios/:id/cells", ForecastingController.patchCell);
router.patch("/scenarios/:id/cells/batch", ForecastingController.patchCellBatch);
router.delete("/scenarios/:id/cells/override", ForecastingController.clearOverride);
router.post("/scenarios/:id/lock", ForecastingController.lockScenario);
router.get("/scenarios/:id/versions", ForecastingController.listVersions);
router.get("/scenarios/:id/versions/compare", ForecastingController.compareVersions);
router.get("/scenarios/:id/versions/:versionId", ForecastingController.getVersion);
router.post("/scenarios/:id/versions/:versionId/duplicate", ForecastingController.duplicateVersion);
router.get("/scenarios/:id/audit", ForecastingController.scenarioAudit);
router.get("/scenarios/:id/goal-links", ForecastingController.listGoalLinks);
router.post("/scenarios/:id/goal-links", ForecastingController.createGoalLink);
router.delete("/scenarios/:id/goal-links/:linkId", ForecastingController.deleteGoalLink);

router.get("/audit", ForecastingController.adminAudit);
router.get("/audit/high-priority", ForecastingController.highPriorityAudit);

// Entity routes
router.get("/entities", ForecastingController.listEntities);
router.post("/entities", ForecastingController.createEntity);
router.get("/entities/:id", ForecastingController.getEntity);
router.get("/entities/:id/chart-of-accounts", ForecastingController.listEntityAccounts);
router.post("/entities/:id/resync-coa", ForecastingController.resyncEntityCoa);

export default router;
