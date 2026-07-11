// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { FpaController } from "../controllers/FpaController";

const router = express.Router();
router.use(authenticate);

// Models
router.post("/models", FpaController.createModel);
router.get("/models", FpaController.listModels);
router.get("/models/:modelId", FpaController.getModel);
router.put("/models/:modelId", FpaController.updateModel);
router.post("/models/:modelId/archive", FpaController.archiveModel);

// Grid / cells
router.get("/models/:modelId/grid", FpaController.getGrid);
router.post("/models/:modelId/cells/update", FpaController.updateCell);
router.post("/models/:modelId/cells/bulk-update", FpaController.bulkUpdate);
router.post("/models/:modelId/cells/spread", FpaController.spread);
router.post("/models/:modelId/cells/copy-forward", FpaController.copyForward);
router.get("/models/:modelId/cells/:cellId/history", FpaController.cellHistory);

// Formulas
router.post("/formulas/validate", FpaController.validateFormula);
router.post("/formulas/dependency-check", FpaController.dependencyCheck);
router.get("/formulas/:formulaId/impact-map", FpaController.formulaImpactMap);
router.post("/models/:modelId/formulas", FpaController.createFormula);
router.put("/formulas/:formulaId", FpaController.updateFormula);

// Scenarios
router.post("/scenarios", FpaController.createScenario);
router.get("/scenarios", FpaController.listScenarios);
router.post("/scenarios/:id/copy", FpaController.copyScenario);
router.post("/scenarios/:id/compare", FpaController.compareScenarios);

// Versions
router.post("/versions", FpaController.createVersion);
router.post("/versions/:id/lock", FpaController.lockVersion);
router.post("/versions/:id/archive", FpaController.archiveVersion);

// Workflow / tasks
router.post("/workflows", FpaController.createWorkflow);
router.get("/workflows/:id", FpaController.getWorkflow);
router.get("/tasks/my-tasks", FpaController.myTasks);
router.post("/tasks/:id/submit", FpaController.submitTask);
router.post("/tasks/:id/return", FpaController.returnTask);
router.post("/tasks/:id/approve", FpaController.approveTask);

// Actuals
router.post("/actuals/sync", FpaController.syncActuals);
router.get("/actuals/snapshots", FpaController.listActualsSnapshots);

// Variance
router.post("/variance/calculate", FpaController.calculateVariance);
router.get("/variance/results", FpaController.listVarianceResults);
router.post("/variance/:id/commentary", FpaController.varianceCommentary);

// Home
router.get("/home/dashboard", FpaController.homeDashboard);

// Line items / drivers
router.get("/models/:modelId/line-items", FpaController.listLineItems);
router.post("/models/:modelId/line-items", FpaController.createLineItem);
router.get("/models/:modelId/drivers", FpaController.listDrivers);
router.post("/models/:modelId/drivers", FpaController.createDriver);
router.get("/drivers", FpaController.listDrivers);
router.post("/drivers", FpaController.createDriver);

// Domain views
router.get("/domain/:category", FpaController.domainCategory);

// Export / AI
router.post("/exports/board-pack", FpaController.exportBoardPack);
router.post("/ai/suggest", FpaController.aiSuggest);
router.post("/ai/commentary-draft", FpaController.aiCommentaryDraft);

export default router;
