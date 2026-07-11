// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { FpaController } from "../controllers/FpaController";

const router = express.Router();
router.use(authenticate);

// Models (setup before :modelId so "setup" is not captured as an id)
router.post("/models/setup", FpaController.setupModel);
router.post("/models", FpaController.createModel);
router.get("/models", FpaController.listModels);
router.get("/dimensions", FpaController.listDimensions);
router.get("/models/:modelId", FpaController.getModel);
router.put("/models/:modelId", FpaController.updateModel);
router.post("/models/:modelId/archive", FpaController.archiveModel);
router.put("/models/:modelId/scope", FpaController.setModelScope);
router.put("/models/:modelId/coa", FpaController.setModelCoa);
router.put("/models/:modelId/dimensions", FpaController.setModelDimensions);
router.post("/models/:modelId/baseline", FpaController.setModelBaseline);
router.post("/models/:modelId/validate", FpaController.validateModel);
router.post("/models/:modelId/line-items/bulk", FpaController.bulkLineItems);

// Budget cycles (Annual Budget Cycle)
router.get("/budget-cycles", FpaController.listBudgetCycles);
router.post("/budget-cycles", FpaController.createBudgetCycle);
router.get("/budget-cycles/:id", FpaController.getBudgetCycle);
router.put("/budget-cycles/:id/owners", FpaController.setBudgetCycleOwners);
router.post("/budget-cycles/:id/load-actuals", FpaController.loadBudgetCycleActuals);
router.post("/budget-cycles/:id/load-baseline", FpaController.loadBudgetCycleBaseline);
router.post("/budget-cycles/:id/validate", FpaController.validateBudgetCycle);
router.post("/budget-cycles/:id/submit-fpa", FpaController.submitBudgetCycleFpa);
router.post("/budget-cycles/:id/fpa-accept", FpaController.fpaAcceptBudgetCycle);
router.post("/budget-cycles/:id/fpa-return", FpaController.fpaReturnBudgetCycle);
router.post("/budget-cycles/:id/cfo-approve", FpaController.cfoApproveBudgetCycle);
router.post("/budget-cycles/:id/cfo-return", FpaController.cfoReturnBudgetCycle);
router.post("/budget-cycles/:id/lock", FpaController.lockBudgetCycle);
router.post("/budget-cycles/:id/board-pack", FpaController.boardPackBudgetCycle);
router.get("/budget-cycles/:id/summary", FpaController.budgetCycleSummary);

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
router.post("/scenarios/:id/promote", FpaController.promoteScenario);

// Versions
router.post("/versions", FpaController.createVersion);
router.post("/versions/:id/seed-cells", FpaController.seedVersionCells);
router.post("/versions/:id/lock", FpaController.lockVersion);
router.post("/versions/:id/archive", FpaController.archiveVersion);

// Workflow / tasks
router.post("/workflows", FpaController.createWorkflow);
router.get("/workflows", FpaController.listWorkflows);
router.get("/workflows/:id", FpaController.getWorkflow);
router.get("/tasks/my-tasks", FpaController.myTasks);
router.post("/tasks/:id/submit", FpaController.submitTask);
router.post("/tasks/:id/return", FpaController.returnTask);
router.post("/tasks/:id/approve", FpaController.approveTask);
router.post("/tasks/:id/reassign", FpaController.reassignTask);

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
router.put("/drivers/:id", FpaController.updateDriver);

// Domain views
router.get("/domain/:category", FpaController.domainCategory);

// Export / AI
router.post("/exports/board-pack", FpaController.exportBoardPack);
router.get("/exports/:id", FpaController.getExportJob);
router.get("/exports/:id/download", FpaController.downloadExport);
router.post("/ai/suggest", FpaController.aiSuggest);
router.post("/ai/commentary-draft", FpaController.aiCommentaryDraft);

export default router;
