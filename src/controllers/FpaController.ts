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

function ipOf(req: Request) {
  return (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.ip || null;
}

function userOf(req: Request) {
  return (req as any).user;
}

function handleError(res: Response, e: any) {
  const status = e?.statusCode || (e instanceof FpaError ? e.statusCode : 500);
  res.status(status).json({
    success: false,
    code: e?.code || "ERROR",
    message: e?.message || "Internal error",
  });
}

export class FpaController {
  // Models
  static async createModel(req: Request, res: Response) {
    try {
      const data = await FpaModelService.create(req.body, userOf(req).id, ipOf(req));
      res.status(201).json({ success: true, data });
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
      const data = await FpaGridService.getGrid(req.params.modelId, {
        versionId: req.query.versionId,
        scenarioId: req.query.scenarioId,
        page: req.query.page,
        pageSize: req.query.pageSize || req.query.page_size,
        lineItemId: req.query.lineItemId,
      });
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async updateCell(req: Request, res: Response) {
    try {
      const data = await FpaGridService.updateCell(req.body, userOf(req), ipOf(req));
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

  static async cellHistory(req: Request, res: Response) {
    try {
      const data = await FpaGridService.cellHistory(req.params.cellId);
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

  static async lockVersion(req: Request, res: Response) {
    try {
      const data = await FpaVersionService.lock(req.params.id, userOf(req), req.body.reason, ipOf(req));
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
      const data = await FpaWorkflowService.myTasks(userOf(req).id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async submitTask(req: Request, res: Response) {
    try {
      const data = await FpaWorkflowService.submit(req.params.id, userOf(req), req.body.comment, ipOf(req));
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
      const data = await FpaLineItemService.list(req.params.modelId);
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
