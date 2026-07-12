// @ts-nocheck
import { Request, Response } from "express";
import { FpaError } from "../services/fpa/FpaError";
import { FpaModelService } from "../services/fpa/FpaModelService";
import { FpaGridService } from "../services/fpa/FpaGridService";
import { FpaScenarioService } from "../services/fpa/FpaScenarioService";
import { FpaVersionService } from "../services/fpa/FpaVersionService";
import { FpaWorkflowService } from "../services/fpa/FpaWorkflowService";
import { FpaActualsService } from "../services/fpa/FpaActualsService";
import { FpaVarianceService } from "../services/fpa/FpaVarianceService";
import { FpaHomeService } from "../services/fpa/FpaHomeService";
import { FpaDomainService } from "../services/fpa/FpaDomainService";
import { FpaExportService } from "../services/fpa/FpaExportService";
import { FpaAiService } from "../services/fpa/FpaAiService";
import { FpaDriverService } from "../services/fpa/FpaDriverService";
import { FpaLineItemService } from "../services/fpa/FpaLineItemService";
import { FpaFormulaEngine } from "../services/fpa/FpaFormulaEngine";
import { FpaModelSetupService } from "../services/fpa/FpaModelSetupService";
import { FpaBudgetCycleService } from "../services/fpa/FpaBudgetCycleService";
import { FpaWorkflowCollabService } from "../services/fpa/FpaWorkflowCollabService";
import { FpaModuleService } from "../services/fpa/FpaModuleService";
import { FpaAuditService } from "../services/fpa/FpaAuditService";
import { FpaTemplateService } from "../services/fpa/FpaTemplateService";
import fs from "fs";

function ipOf(req: Request) {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null;
}

function userOf(req: Request) {
  return (req as any).user;
}

function handleError(res: Response, e: any) {
  const status = e?.statusCode || (e instanceof FpaError ? e.statusCode : 500);
  const body: any = {
    success: false,
    code: e?.code || "ERROR",
    message: e?.message || "Internal error",
  };
  if (Array.isArray(e?.errors) && e.errors.length) body.errors = e.errors;
  res.status(status).json(body);
}

export class FpaController {
  // Models
  static async setupModel(req: Request, res: Response) {
    try {
      const data = await FpaModelSetupService.setup(req.body, userOf(req).id, ipOf(req));
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async createModel(req: Request, res: Response) {
    try {
      const data = await FpaModelService.create(req.body, userOf(req).id, ipOf(req));
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async setModelScope(req: Request, res: Response) {
    try {
      const data = await FpaModelSetupService.setScope(req.params.modelId, req.body || {}, userOf(req).id, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async setModelCoa(req: Request, res: Response) {
    try {
      const data = await FpaModelSetupService.setCoa(req.params.modelId, req.body || {}, userOf(req).id, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async setModelDimensions(req: Request, res: Response) {
    try {
      const data = await FpaModelSetupService.setDimensions(req.params.modelId, req.body || {}, userOf(req).id, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async setModelBaseline(req: Request, res: Response) {
    try {
      const data = await FpaModelSetupService.setBaseline(req.params.modelId, req.body || {}, userOf(req).id, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async validateModel(req: Request, res: Response) {
    try {
      const data = await FpaModuleService.enrichedValidate(req.params.modelId);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async validationSummary(req: Request, res: Response) {
    try {
      const data = await FpaModuleService.validationSummary(req.params.modelId, userOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listModelModules(req: Request, res: Response) {
    try {
      const data = await FpaModuleService.listModules(req.params.modelId, userOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async createModelModule(req: Request, res: Response) {
    try {
      const data = await FpaModuleService.createModule(req.params.modelId, req.body || {}, userOf(req), ipOf(req));
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async updateModule(req: Request, res: Response) {
    try {
      const data = await FpaModuleService.updateModule(req.params.moduleId, req.body || {}, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async deleteModule(req: Request, res: Response) {
    try {
      const data = await FpaModuleService.deleteModule(req.params.moduleId, userOf(req), ipOf(req), req.query);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async duplicateModule(req: Request, res: Response) {
    try {
      const data = await FpaModuleService.duplicateModule(req.params.moduleId, userOf(req), ipOf(req));
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async setModuleDimensions(req: Request, res: Response) {
    try {
      const data = await FpaModuleService.setModuleDimensions(req.params.moduleId, req.body || {}, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async dependencyMap(req: Request, res: Response) {
    try {
      const data = await FpaModuleService.dependencyMap(req.params.modelId, req.query, userOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async dependencyGraph(req: Request, res: Response) {
    try {
      const data = await FpaModuleService.dependencyGraph(req.params.modelId, req.query, userOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async publishModel(req: Request, res: Response) {
    try {
      const data = await FpaModuleService.publish(req.params.modelId, userOf(req), ipOf(req), req.body || {});
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listModelAuditLogs(req: Request, res: Response) {
    try {
      const data = await FpaAuditService.list(req.params.modelId, req.query);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listModelAudit(req: Request, res: Response) {
    try {
      const data = await FpaAuditService.listForFe(req.params.modelId, req.query);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listDimensions(req: Request, res: Response) {
    try {
      const data = await FpaModelSetupService.listDimensions();
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async bulkLineItems(req: Request, res: Response) {
    try {
      const data = await FpaModelSetupService.bulkLineItems(
        req.params.modelId,
        req.body || {},
        userOf(req).id,
        ipOf(req)
      );
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  // Budget cycles
  static async listBudgetCycles(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.list(req.query);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async createBudgetCycle(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.create(req.body, userOf(req), ipOf(req));
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async getBudgetCycle(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.get(req.params.id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async setBudgetCycleOwners(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.setOwners(req.params.id, req.body || {}, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async updateBudgetCycle(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.update(req.params.id, req.body || {}, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async validateBudgetCycleSetup(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.validateSetup(req.params.id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async openBudgetCycle(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.open(req.params.id, req.body || {}, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async budgetCycleOwnerWorkspace(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.ownerWorkspace(req.params.id, userOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async budgetCycleReviewWorkspace(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.reviewWorkspace(req.params.id, userOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listBudgetCycleTasks(req: Request, res: Response) {
    try {
      const data = await FpaWorkflowCollabService.listCycleTasks(req.params.id, req.query, userOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async exportBudgetCycleTasks(req: Request, res: Response) {
    try {
      const file = await FpaWorkflowCollabService.exportCycleTasksCsv(req.params.id, req.query, userOf(req));
      res.setHeader("Content-Type", file.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${file.filename}"`);
      res.send(file.body);
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listBudgetCycleApprovalEvents(req: Request, res: Response) {
    try {
      const data = await FpaWorkflowCollabService.listApprovalEvents(req.params.id, userOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listBudgetCycleComments(req: Request, res: Response) {
    try {
      const data = await FpaWorkflowCollabService.listComments({ cycleId: req.params.id }, userOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async addBudgetCycleComment(req: Request, res: Response) {
    try {
      const data = await FpaWorkflowCollabService.addComment(
        { cycleId: req.params.id },
        req.body || {},
        userOf(req)
      );
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listTaskComments(req: Request, res: Response) {
    try {
      const data = await FpaWorkflowCollabService.listComments({ taskId: req.params.id }, userOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async addTaskComment(req: Request, res: Response) {
    try {
      const data = await FpaWorkflowCollabService.addComment(
        { taskId: req.params.id },
        req.body || {},
        userOf(req)
      );
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listTaskAttachments(req: Request, res: Response) {
    try {
      const data = await FpaWorkflowCollabService.listAttachments(req.params.id, userOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async uploadTaskAttachment(req: Request, res: Response) {
    try {
      const file = (req as any).file;
      const data = await FpaWorkflowCollabService.uploadAttachment(req.params.id, file, userOf(req));
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async downloadAttachment(req: Request, res: Response) {
    try {
      const result = await FpaWorkflowCollabService.downloadAttachment(req.params.id, userOf(req));
      if (result.redirectUrl) {
        return res.redirect(result.redirectUrl);
      }
      const a = result.attachment;
      res.setHeader("Content-Type", a.mimeType || "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename="${a.fileName}"`);
      fs.createReadStream(result.streamPath).pipe(res);
    } catch (e) {
      handleError(res, e);
    }
  }

  static async deleteAttachment(req: Request, res: Response) {
    try {
      const data = await FpaWorkflowCollabService.deleteAttachment(req.params.id, userOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async taskSummary(req: Request, res: Response) {
    try {
      const data = await FpaWorkflowCollabService.taskSummary(req.params.id, userOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async validateBudgetCycleOwnerSubmit(req: Request, res: Response) {
    try {
      const departmentIds = Array.isArray(req.body?.departmentIds)
        ? req.body.departmentIds.map(String)
        : undefined;
      const data = await FpaBudgetCycleService.validateOwnerSubmission(req.params.id, userOf(req), {
        departmentIds,
      });
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async loadBudgetCycleActuals(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.loadActuals(req.params.id, req.body || {}, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async loadBudgetCycleBaseline(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.loadBaseline(req.params.id, req.body || {}, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async validateBudgetCycle(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.validate(req.params.id, { persist: true });
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async submitBudgetCycleFpa(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.submitFpa(req.params.id, req.body || {}, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async fpaAcceptBudgetCycle(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.fpaAccept(req.params.id, req.body || {}, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async fpaReturnBudgetCycle(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.fpaReturn(req.params.id, req.body || {}, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async cfoApproveBudgetCycle(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.cfoApprove(req.params.id, req.body || {}, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async cfoReturnBudgetCycle(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.cfoReturn(req.params.id, req.body || {}, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async lockBudgetCycle(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.lock(req.params.id, req.body || {}, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async boardPackBudgetCycle(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.boardPack(req.params.id, req.body || {}, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async budgetCycleSummary(req: Request, res: Response) {
    try {
      const data = await FpaBudgetCycleService.summary(req.params.id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listModels(req: Request, res: Response) {
    try {
      const data = await FpaModelService.list(req.query);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async getModel(req: Request, res: Response) {
    try {
      const data = await FpaModelService.get(req.params.modelId);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async updateModel(req: Request, res: Response) {
    try {
      const data = await FpaModelService.update(req.params.modelId, req.body, userOf(req).id, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async archiveModel(req: Request, res: Response) {
    try {
      const data = await FpaModelService.archive(req.params.modelId, userOf(req).id, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  // Grid / cells
  static async getGrid(req: Request, res: Response) {
    try {
      const data = await FpaGridService.getGrid(
        req.params.modelId,
        {
          versionId: req.query.versionId,
          scenarioId: req.query.scenarioId,
          cycleId: req.query.cycleId,
          departmentId: req.query.departmentId,
          page: req.query.page,
          pageSize: req.query.pageSize || req.query.page_size,
          lineItemId: req.query.lineItemId,
        },
        userOf(req)
      );
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async updateCell(req: Request, res: Response) {
    try {
      const data = await FpaGridService.updateCell(
        { ...req.body, modelId: req.params.modelId || req.body.modelId },
        userOf(req),
        ipOf(req)
      );
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async bulkUpdate(req: Request, res: Response) {
    try {
      const updates = req.body.updates || req.body.cells || [];
      const data = await FpaGridService.bulkUpdate(req.params.modelId, updates, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async spread(req: Request, res: Response) {
    try {
      const data = await FpaGridService.spread({ ...req.body, modelId: req.params.modelId }, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async copyForward(req: Request, res: Response) {
    try {
      const data = await FpaGridService.copyForward({ ...req.body, modelId: req.params.modelId }, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async applyGrowth(req: Request, res: Response) {
    try {
      const data = await FpaGridService.applyGrowth(
        { ...req.body, modelId: req.params.modelId },
        userOf(req),
        ipOf(req)
      );
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async bulkCellOperation(req: Request, res: Response) {
    try {
      const data = await FpaGridService.bulkOperation(
        { ...req.body, modelId: req.params.modelId },
        userOf(req),
        ipOf(req)
      );
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async cellDetail(req: Request, res: Response) {
    try {
      const data = await FpaGridService.cellDetail(req.params.modelId, req.params.cellId);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async cellTrace(req: Request, res: Response) {
    try {
      const data = await FpaGridService.cellTrace(req.params.modelId, req.params.cellId);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async cellHistory(req: Request, res: Response) {
    try {
      const data = await FpaGridService.cellHistory(req.params.cellId);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listCellComments(req: Request, res: Response) {
    try {
      const data = await FpaGridService.listCellComments(req.params.modelId, req.params.cellId);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async addCellComment(req: Request, res: Response) {
    try {
      const data = await FpaGridService.addCellComment(
        req.params.modelId,
        req.params.cellId,
        req.body,
        userOf(req)
      );
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async gridValidations(req: Request, res: Response) {
    try {
      const data = await FpaGridService.gridValidations(req.params.modelId, {
        versionId: req.query.versionId || req.body?.versionId,
        scenarioId: req.query.scenarioId || req.body?.scenarioId,
      });
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  // Formulas
  static async validateFormula(req: Request, res: Response) {
    try {
      const data = FpaFormulaEngine.validateExpression(req.body.expression || req.body.expr || "");
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async dependencyCheck(req: Request, res: Response) {
    try {
      const data = await FpaFormulaEngine.dependencyCheck(
        req.body.modelId,
        req.body.formulaId || null,
        req.body.dependsOnLineItemCodes || req.body.lineCodes || []
      );
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async formulaImpactMap(req: Request, res: Response) {
    try {
      const data = await FpaLineItemService.impactMap(req.params.formulaId);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async createFormula(req: Request, res: Response) {
    try {
      const data = await FpaLineItemService.createFormula(
        { ...req.body, modelId: req.params.modelId || req.body.modelId },
        userOf(req).id,
        ipOf(req)
      );
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async updateFormula(req: Request, res: Response) {
    try {
      const data = await FpaLineItemService.updateFormula(req.params.formulaId, req.body, userOf(req).id, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async publishVersion(req: Request, res: Response) {
    try {
      const data = await FpaVersionService.publish(req.params.id, userOf(req), req.body || {}, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async testVersionCalculation(req: Request, res: Response) {
    try {
      const data = await FpaVersionService.testCalculation(req.params.id, req.body || {}, userOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async reorderLineItem(req: Request, res: Response) {
    try {
      const data = await FpaLineItemService.reorder(req.params.id, req.body || {}, userOf(req).id, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async setLineItemDimensions(req: Request, res: Response) {
    try {
      const data = await FpaLineItemService.setDimensions(req.params.id, req.body || {}, userOf(req).id, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listLineItemTemplates(_req: Request, res: Response) {
    try {
      const data = FpaTemplateService.list();
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async applyModuleTemplate(req: Request, res: Response) {
    try {
      const data = await FpaTemplateService.apply(
        req.params.modelId,
        req.params.moduleId,
        String(req.body?.templateId || ""),
        userOf(req),
        ipOf(req)
      );
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async updateGridCells(req: Request, res: Response) {
    try {
      const modelId = req.params.modelId;
      const body = req.body || {};
      const versionId = body.versionId;
      const scenarioId = body.scenarioId;
      const updates = Array.isArray(body.updates) ? body.updates : [];
      const results = [];
      for (const u of updates) {
        let periodDate = u.periodDate || u.periodKey;
        if (periodDate && /^\d{4}-\d{2}$/.test(String(periodDate))) {
          periodDate = `${periodDate}-01`;
        }
        const data = await FpaGridService.updateCell(
          {
            modelId,
            versionId,
            scenarioId,
            lineItemId: u.lineItemId,
            periodDate,
            value: u.value,
          },
          userOf(req),
          ipOf(req)
        );
        results.push(data);
      }
      res.json({ success: true, data: { updated: results.length, cells: results } });
    } catch (e) {
      handleError(res, e);
    }
  }

  // Scenarios
  static async createScenario(req: Request, res: Response) {
    try {
      const data = await FpaScenarioService.create(req.body, userOf(req).id, ipOf(req));
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listScenarios(req: Request, res: Response) {
    try {
      const data = await FpaScenarioService.list(req.query.modelId as string);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async copyScenario(req: Request, res: Response) {
    try {
      const data = await FpaScenarioService.copy(req.params.id, req.body, userOf(req).id, ipOf(req));
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async promoteScenario(req: Request, res: Response) {
    try {
      const data = await FpaScenarioService.promote(req.params.id, req.body || {}, userOf(req).id, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async compareScenarios(req: Request, res: Response) {
    try {
      const data = await FpaScenarioService.compare(req.params.id, req.body);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  // Versions
  static async createVersion(req: Request, res: Response) {
    try {
      const data = await FpaVersionService.create(req.body, userOf(req).id, ipOf(req));
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async seedVersionCells(req: Request, res: Response) {
    try {
      const data = await FpaVersionService.seedCells(req.params.id, req.body || {}, userOf(req).id, ipOf(req));
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async lockVersion(req: Request, res: Response) {
    try {
      const data = await FpaVersionService.lock(req.params.id, userOf(req), req.body.reason, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async requestReopenVersion(req: Request, res: Response) {
    try {
      const data = await FpaVersionService.requestReopen(req.params.id, req.body || {}, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async archiveVersion(req: Request, res: Response) {
    try {
      const data = await FpaVersionService.archive(req.params.id, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  // Workflow
  static async createWorkflow(req: Request, res: Response) {
    try {
      const data = await FpaWorkflowService.createWorkflow(req.body, userOf(req).id, ipOf(req));
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listWorkflows(req: Request, res: Response) {
    try {
      const data = await FpaWorkflowService.listWorkflows(req.query);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async getWorkflow(req: Request, res: Response) {
    try {
      const data = await FpaWorkflowService.getWorkflow(req.params.id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async myTasks(req: Request, res: Response) {
    try {
      const data = await FpaWorkflowService.myTasks(userOf(req).id, req.query);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async submitTask(req: Request, res: Response) {
    try {
      const data = await FpaWorkflowService.submit(req.params.id, userOf(req), req.body || {}, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async returnTask(req: Request, res: Response) {
    try {
      const data = await FpaWorkflowService.returnTask(req.params.id, userOf(req), req.body.comment, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async approveTask(req: Request, res: Response) {
    try {
      const data = await FpaWorkflowService.approve(req.params.id, userOf(req), req.body.comment, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async reassignTask(req: Request, res: Response) {
    try {
      const data = await FpaWorkflowService.reassign(req.params.id, req.body || {}, userOf(req), ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  // Actuals
  static async syncActuals(req: Request, res: Response) {
    try {
      const data = await FpaActualsService.sync(req.body, userOf(req).id, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listActualsSnapshots(req: Request, res: Response) {
    try {
      const data = await FpaActualsService.listSnapshots(req.query);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  // Variance
  static async calculateVariance(req: Request, res: Response) {
    try {
      const data = await FpaVarianceService.calculate(req.body, userOf(req).id, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listVarianceResults(req: Request, res: Response) {
    try {
      const data = await FpaVarianceService.listResults(req.query);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async varianceCommentary(req: Request, res: Response) {
    try {
      const data = await FpaVarianceService.addCommentary(req.params.id, req.body, userOf(req).id, ipOf(req));
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  // Home
  static async homeDashboard(req: Request, res: Response) {
    try {
      const data = await FpaHomeService.dashboard(req.query, userOf(req)?.id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  // Line items / drivers
  static async listLineItems(req: Request, res: Response) {
    try {
      const data = await FpaLineItemService.list(req.params.modelId, req.query);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async createLineItem(req: Request, res: Response) {
    try {
      const data = await FpaLineItemService.create(
        { ...req.body, modelId: req.params.modelId || req.body.modelId },
        userOf(req).id,
        ipOf(req)
      );
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async updateLineItem(req: Request, res: Response) {
    try {
      const data = await FpaLineItemService.update(req.params.id, req.body || {}, userOf(req).id, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async deleteLineItem(req: Request, res: Response) {
    try {
      const data = await FpaLineItemService.remove(req.params.id, userOf(req).id, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async lineItemDependencies(req: Request, res: Response) {
    try {
      const data = await FpaLineItemService.dependencies(req.params.id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async lineItemTrace(req: Request, res: Response) {
    try {
      const data = await FpaLineItemService.trace(req.params.id, req.query);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listDrivers(req: Request, res: Response) {
    try {
      const modelId = (req.params.modelId || req.query.modelId) as string;
      const data = await FpaDriverService.list(modelId, req.query);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async createDriver(req: Request, res: Response) {
    try {
      const data = await FpaDriverService.create(
        { ...req.body, modelId: req.params.modelId || req.body.modelId },
        userOf(req).id,
        ipOf(req)
      );
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async updateDriver(req: Request, res: Response) {
    try {
      const data = await FpaDriverService.update(req.params.id, req.body || {}, userOf(req).id, ipOf(req));
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  // Domain
  static async domainCategory(req: Request, res: Response) {
    try {
      const modelId = (req.query.modelId || req.body.modelId) as string;
      const data = await FpaDomainService.listByCategory(modelId, req.params.category);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  // Export / AI
  static async exportBoardPack(req: Request, res: Response) {
    try {
      const data = await FpaExportService.createBoardPack(req.body, userOf(req).id, ipOf(req));
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async getExportJob(req: Request, res: Response) {
    try {
      const data = await FpaExportService.getJob(req.params.id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async downloadExport(req: Request, res: Response) {
    try {
      const { buffer, filename, contentType } = await FpaExportService.getDownload(req.params.id);
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.status(200).send(buffer);
    } catch (e) {
      handleError(res, e);
    }
  }

  static async aiSuggest(req: Request, res: Response) {
    try {
      const data = await FpaAiService.suggestForecast(req.body, userOf(req).id, ipOf(req));
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async aiCommentaryDraft(req: Request, res: Response) {
    try {
      const data = await FpaAiService.draftCommentary(req.body, userOf(req).id, ipOf(req));
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }
}
