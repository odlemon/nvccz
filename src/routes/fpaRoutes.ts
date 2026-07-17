// @ts-nocheck
import express from "express";
import multer from "multer";
import { authenticate } from "../middleware/authenticate";
import { FpaController } from "../controllers/FpaController";

const router = express.Router();
router.use(authenticate);

const uploadAttachment = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// Models (setup before :modelId so "setup" is not captured as an id)
router.post("/models/setup", FpaController.setupModel);
router.post("/models", FpaController.createModel);
router.get("/models", FpaController.listModels);
router.get("/dimensions", FpaController.listDimensions);
router.get("/models/:modelId", FpaController.getModel);
router.get("/models/:modelId/versions", FpaController.listModelVersions);
router.get("/models/:modelId/scenarios", FpaController.listModelScenarios);
router.put("/models/:modelId", FpaController.updateModel);
router.post("/models/:modelId/archive", FpaController.archiveModel);
router.put("/models/:modelId/scope", FpaController.setModelScope);
router.put("/models/:modelId/coa", FpaController.setModelCoa);
router.put("/models/:modelId/dimensions", FpaController.setModelDimensions);
router.get("/models/:modelId/dimensions", FpaController.getModelDimensions);
router.post("/models/:modelId/baseline", FpaController.setModelBaseline);
router.post("/models/:modelId/validate", FpaController.validateModel);
router.get("/models/:modelId/validation-summary", FpaController.validationSummary);
router.get("/models/:modelId/validation-checks", FpaController.validationChecks);
router.get("/models/:modelId/exceptions", FpaController.listExceptions);
router.post("/models/:modelId/publish", FpaController.publishModel);
router.post("/models/:modelId/seed-defaults", FpaController.seedModelDefaults);
router.get("/models/:modelId/audit-logs", FpaController.listModelAuditLogs);
router.get("/models/:modelId/audit", FpaController.listModelAudit);
router.get("/models/:modelId/modules", FpaController.listModelModules);
router.post("/models/:modelId/modules", FpaController.createModelModule);
router.get("/models/:modelId/dependency-map", FpaController.dependencyMap);
router.get("/models/:modelId/dependency-graph", FpaController.dependencyGraph);
router.post("/models/:modelId/line-items/bulk", FpaController.bulkLineItems);
router.get("/models/:modelId/data-mappings", FpaController.listDataMappings);
router.post("/models/:modelId/data-mappings", FpaController.createDataMapping);
router.post("/models/:modelId/data-mappings/seed-catalog", FpaController.seedDataMappingCatalog);
router.post("/models/:modelId/data-mappings/refresh", FpaController.refreshDataMappings);
router.post(
  "/models/:modelId/data-mappings/import",
  uploadAttachment.single("file"),
  FpaController.importDataMappings
);
router.put("/models/:modelId/data-mappings/:mappingId", FpaController.updateDataMapping);
router.delete("/models/:modelId/data-mappings/:mappingId", FpaController.deleteDataMapping);
router.post("/models/:modelId/sensitivity-analysis", FpaController.sensitivityAnalysis);
router.get("/models/:modelId/variance-bridge", FpaController.varianceBridge);
router.put("/modules/:moduleId", FpaController.updateModule);
router.delete("/modules/:moduleId", FpaController.deleteModule);
router.post("/modules/:moduleId/duplicate", FpaController.duplicateModule);
router.put("/modules/:moduleId/dimensions", FpaController.setModuleDimensions);
router.get("/line-item-templates", FpaController.listLineItemTemplates);
router.post("/models/:modelId/modules/:moduleId/apply-template", FpaController.applyModuleTemplate);

// Budget cycles (Annual Budget Cycle)
router.get("/budget-cycles", FpaController.listBudgetCycles);
router.post("/budget-cycles", FpaController.createBudgetCycle);
router.get("/budget-cycles/:id", FpaController.getBudgetCycle);
router.patch("/budget-cycles/:id", FpaController.updateBudgetCycle);
router.put("/budget-cycles/:id", FpaController.updateBudgetCycle);
router.put("/budget-cycles/:id/owners", FpaController.setBudgetCycleOwners);
router.post("/budget-cycles/:id/validate-setup", FpaController.validateBudgetCycleSetup);
router.post("/budget-cycles/:id/open", FpaController.openBudgetCycle);
router.get("/budget-cycles/:id/owner-workspace", FpaController.budgetCycleOwnerWorkspace);
router.get("/budget-cycles/:id/review-workspace", FpaController.budgetCycleReviewWorkspace);
router.get("/budget-cycles/:id/tasks/export", FpaController.exportBudgetCycleTasks);
router.get("/budget-cycles/:id/tasks", FpaController.listBudgetCycleTasks);
router.get("/budget-cycles/:id/approval-events", FpaController.listBudgetCycleApprovalEvents);
router.get("/budget-cycles/:id/comments", FpaController.listBudgetCycleComments);
router.post("/budget-cycles/:id/comments", FpaController.addBudgetCycleComment);
router.post("/budget-cycles/:id/validate-owner-submit", FpaController.validateBudgetCycleOwnerSubmit);
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

// Model Planning — cycles (separate from /budget-cycles by product decision)
router.get("/model-planning/cycles", FpaController.listModelPlanningCycles);
router.get("/model-planning/cycles/sources", FpaController.modelPlanningSources);
router.post("/model-planning/cycles", FpaController.createModelPlanningCycle);
router.get("/model-planning/cycles/:id", FpaController.getModelPlanningCycle);
router.get("/model-planning/cycles/:id/workspace", FpaController.modelPlanningWorkspace);
router.get("/model-planning/cycles/:id/owner-workspace", FpaController.modelPlanningOwnerWorkspace);
router.get("/model-planning/cycles/:id/tasks", FpaController.listModelPlanningCycleTasks);
router.post("/model-planning/cycles/:id/tasks", FpaController.createModelPlanningCycleTask);
router.get("/model-planning/cycles/:id/comments", FpaController.listModelPlanningCycleComments);
router.post("/model-planning/cycles/:id/comments", FpaController.addModelPlanningCycleComment);
router.get("/model-planning/cycles/:id/activity", FpaController.listModelPlanningCycleActivity);
router.put("/model-planning/cycles/:id/owners", FpaController.setModelPlanningOwners);
router.put("/model-planning/cycles/:id", FpaController.updateModelPlanningCycle);
router.delete("/model-planning/cycles/:id", FpaController.deleteModelPlanningCycle);
// Stages 6–9 — MPC workflow (do not use /budget-cycles for MPC ids)
router.post("/model-planning/cycles/:id/submit", FpaController.submitModelPlanningCycle);
router.post("/model-planning/cycles/:id/review/accept", FpaController.reviewAcceptModelPlanningCycle);
router.post("/model-planning/cycles/:id/review/return", FpaController.reviewReturnModelPlanningCycle);
router.post("/model-planning/cycles/:id/cfo-approve", FpaController.cfoApproveModelPlanningCycle);
router.post("/model-planning/cycles/:id/cfo-return", FpaController.cfoReturnModelPlanningCycle);
router.post("/model-planning/cycles/:id/lock", FpaController.lockModelPlanningCycle);
router.post("/model-planning/cycles/:id/request-reopen", FpaController.requestReopenModelPlanningCycle);

// Grid / cells
router.get("/models/:modelId/grid", FpaController.getGrid);
router.get("/models/:modelId/grid/validations", FpaController.gridValidations);
router.put("/models/:modelId/grid/cells", FpaController.updateGridCells);
router.post("/models/:modelId/cells/update", FpaController.updateCell);
router.post("/models/:modelId/cells/bulk-update", FpaController.bulkUpdate);
router.post("/models/:modelId/cells/spread", FpaController.spread);
router.post("/models/:modelId/cells/copy-forward", FpaController.copyForward);
router.post("/models/:modelId/cells/apply-growth", FpaController.applyGrowth);
router.post("/models/:modelId/cells/bulk-operation", FpaController.bulkCellOperation);
router.post("/models/:modelId/recalculate", FpaController.recalculateModel);
router.get("/models/:modelId/planning-summary", FpaController.planningSummary);
router.get("/models/:modelId/cells/:cellId/detail", FpaController.cellDetail);
router.get("/models/:modelId/cells/:cellId/trace", FpaController.cellTrace);
router.get("/models/:modelId/cells/:cellId/history", FpaController.cellHistory);
router.get("/models/:modelId/cells/:cellId/comments", FpaController.listCellComments);
router.post("/models/:modelId/cells/:cellId/comments", FpaController.addCellComment);

// Formulas
router.post("/formulas/validate", FpaController.validateFormula);
router.post("/formulas/dependency-check", FpaController.dependencyCheck);
router.get("/formulas/:formulaId/impact-map", FpaController.formulaImpactMap);
router.post("/models/:modelId/formulas", FpaController.createFormula);
router.put("/formulas/:formulaId", FpaController.updateFormula);

// Scenarios
router.post("/scenarios", FpaController.createScenario);
router.get("/scenarios", FpaController.listScenarios);
router.put("/scenarios/:id", FpaController.updateScenario);
router.patch("/scenarios/:id", FpaController.updateScenario);
router.post("/scenarios/:id/archive", FpaController.archiveScenario);
router.post("/scenarios/:id/copy", FpaController.copyScenario);
router.post("/scenarios/:id/compare", FpaController.compareScenarios);
router.post("/scenarios/:id/promote", FpaController.promoteScenario);

// Versions
router.post("/versions", FpaController.createVersion);
router.post("/versions/:id/seed-cells", FpaController.seedVersionCells);
router.post("/versions/:id/lock", FpaController.lockVersion);
router.post("/versions/:id/publish", FpaController.publishVersion);
router.post("/versions/:id/test-calculation", FpaController.testVersionCalculation);
router.post("/versions/:id/request-reopen", FpaController.requestReopenVersion);
router.post("/versions/:id/archive", FpaController.archiveVersion);

// Workflow / tasks
router.post("/workflows", FpaController.createWorkflow);
router.get("/workflows", FpaController.listWorkflows);
router.get("/workflows/:id", FpaController.getWorkflow);
router.get("/tasks/my-tasks", FpaController.myTasks);
router.get("/tasks/:id/comments", FpaController.listTaskComments);
router.post("/tasks/:id/comments", FpaController.addTaskComment);
router.get("/tasks/:id/attachments", FpaController.listTaskAttachments);
router.post("/tasks/:id/attachments", uploadAttachment.single("file"), FpaController.uploadTaskAttachment);
router.get("/tasks/:id/summary", FpaController.taskSummary);
router.patch("/tasks/:id", FpaController.updatePlanningTask);
router.post("/tasks/:id/submit", FpaController.submitTask);
router.post("/tasks/:id/return", FpaController.returnTask);
router.post("/tasks/:id/approve", FpaController.approveTask);
router.post("/tasks/:id/reassign", FpaController.reassignTask);
router.get("/attachments/:id/download", FpaController.downloadAttachment);
router.delete("/attachments/:id", FpaController.deleteAttachment);

// Actuals
router.post("/actuals/sync", FpaController.syncActuals);
router.get("/actuals/snapshots", FpaController.listActualsSnapshots);

// Variance
router.post("/variance/calculate", FpaController.calculateVariance);
router.get("/variance/results", FpaController.listVarianceResults);
router.get("/variance/summary", FpaController.varianceSummary);
router.post("/variance/:id/commentary", FpaController.varianceCommentary);

// Home
router.get("/home/dashboard", FpaController.homeDashboard);

// Line items / drivers
router.get("/models/:modelId/line-items", FpaController.listLineItems);
router.post("/models/:modelId/line-items", FpaController.createLineItem);
router.put("/line-items/:id", FpaController.updateLineItem);
router.put("/line-items/:id/reorder", FpaController.reorderLineItem);
router.put("/line-items/:id/dimensions", FpaController.setLineItemDimensions);
router.delete("/line-items/:id", FpaController.deleteLineItem);
router.get("/line-items/:id/dependencies", FpaController.lineItemDependencies);
router.get("/line-items/:id/trace", FpaController.lineItemTrace);
router.get("/models/:modelId/drivers", FpaController.listDrivers);
router.post("/models/:modelId/drivers", FpaController.createDriver);
router.get("/drivers", FpaController.listDrivers);
router.post("/drivers", FpaController.createDriver);
router.put("/drivers/:id", FpaController.updateDriver);
router.delete("/drivers/:id", FpaController.deleteDriver);

// Domain views
router.get("/domain/:category", FpaController.domainCategory);
router.post("/domain/:category/sensitivity", FpaController.domainSensitivity);

// Export / AI
router.post("/exports/board-pack", FpaController.exportBoardPack);
router.get("/exports", FpaController.listExports);
router.get("/exports/capabilities", FpaController.exportCapabilities);
router.get("/exports/:id", FpaController.getExportJob);
router.get("/exports/:id/download", FpaController.downloadExport);

// Rolling forecast (sidebar Forecasts)
router.get("/models/:modelId/rolling-forecast", FpaController.getRollingForecast);
router.put("/models/:modelId/rolling-forecast/cutoff", FpaController.setRollingForecastCutoff);
router.put("/models/:modelId/rolling-forecast/method", FpaController.setRollingForecastMethod);
router.post("/models/:modelId/rolling-forecast/roll-forward", FpaController.rollForwardRollingForecast);

// Persisted FP&A settings + connector state
router.get("/settings", FpaController.getFpaSettings);
router.put("/settings", FpaController.updateFpaSettings);
router.post("/settings/sync-sources/:sourceId/connect", FpaController.connectFpaSyncSource);
router.post("/settings/sync-sources/:sourceId/disconnect", FpaController.disconnectFpaSyncSource);
router.post("/settings/sync-sources/:sourceId/sync", FpaController.syncFpaSource);
router.post("/ai/suggest", FpaController.aiSuggest);
router.post("/ai/commentary-draft", FpaController.aiCommentaryDraft);

export default router;
