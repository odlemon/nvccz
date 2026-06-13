// @ts-nocheck
import { Request, Response } from "express";
import { isForecastEnabled } from "../constants/forecastingEngine";
import { ForecastingScenarioService } from "../services/ForecastingScenarioService";
import { ForecastingDriverService } from "../services/ForecastingDriverService";
import { ForecastingCellService } from "../services/ForecastingCellService";
import { ForecastingGridService } from "../services/ForecastingGridService";
import { ForecastingVersionService } from "../services/ForecastingVersionService";
import { ForecastingAuditService } from "../services/ForecastingAuditService";
import { ForecastingComputeService } from "../services/ForecastingComputeService";
import { ForecastingOpmBridgeService } from "../services/ForecastingOpmBridgeService";
import { ForecastingAccessService } from "../services/ForecastingAccessService";
import { ForecastingError } from "../services/ForecastingError";

function actor(req: Request) {
  const user = (req as any).user;
  if (!user?.id) throw new ForecastingError("UNAUTHORIZED", "Authentication required", 401);
  return user;
}

function handleError(res: Response, error: any) {
  if (error instanceof ForecastingError) {
    return res.status(error.statusCode).json({
      success: false,
      code: error.code,
      message: error.message,
      details: error.details
    });
  }
  console.error("[forecasting]", error);
  return res.status(500).json({ success: false, message: error?.message || "Internal error" });
}

function assertEnabled(res: Response): boolean {
  if (!isForecastEnabled()) {
    res.status(503).json({
      success: false,
      code: "FEATURE_DISABLED",
      message: "Forecasting engine is disabled"
    });
    return false;
  }
  return true;
}

export class ForecastingController {
  static async createScenario(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      const user = actor(req);
      const data = await ForecastingScenarioService.create({
        name: req.body.name,
        description: req.body.description,
        entityId: req.body.entity_id,
        fundId: req.body.fund_id,
        baseCurrency: req.body.base_currency,
        horizonStartDate: req.body.horizon_start_date,
        horizonEndDate: req.body.horizon_end_date,
        granularity: req.body.granularity,
        dimensions: req.body.dimensions,
        userId: user.id
      });
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listScenarios(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      const user = actor(req);
      const data = await ForecastingScenarioService.list(user, req.query);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async scenarioCounts(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      const user = actor(req);
      const data = await ForecastingScenarioService.counts(user);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async getScenario(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      actor(req);
      const data = await ForecastingScenarioService.getDetail(req.params.id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async patchScenario(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      const user = actor(req);
      const data = await ForecastingScenarioService.patch(req.params.id, user.id, req.body);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async getSummary(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      actor(req);
      const data = await ForecastingScenarioService.getSummary(req.params.id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async getGrid(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      actor(req);
      const data = await ForecastingGridService.getGrid(req.params.id, req.query);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async putDrivers(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      const user = actor(req);
      const data = await ForecastingDriverService.replaceDrivers(
        req.params.id,
        user.id,
        req.body.drivers || []
      );
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async patchCell(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      const user = actor(req);
      const data = await ForecastingCellService.patchCell(req.params.id, user.id, req.body);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async patchCellBatch(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      const user = actor(req);
      const data = await ForecastingCellService.patchBatch(
        req.params.id,
        user.id,
        req.body.edits || [],
        req.body.atomic !== false
      );
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async clearOverride(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      const user = actor(req);
      const data = await ForecastingCellService.clearOverride(req.params.id, user.id, req.query as any);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async lockScenario(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      const user = actor(req);
      ForecastingAccessService.assertLockRole(user);
      const data = await ForecastingVersionService.lock(
        req.params.id,
        user.id,
        req.body.version_label || "LOCKED"
      );
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listVersions(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      actor(req);
      const data = await ForecastingVersionService.list(req.params.id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async getVersion(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      actor(req);
      const data = await ForecastingVersionService.get(req.params.id, req.params.versionId);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async compareVersions(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      actor(req);
      const data = await ForecastingVersionService.compare(
        req.params.id,
        String(req.query.version_a),
        String(req.query.version_b)
      );
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async duplicateVersion(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      const user = actor(req);
      const data = await ForecastingVersionService.duplicate(
        req.params.id,
        req.params.versionId,
        user.id,
        req.body?.name
      );
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async scenarioAudit(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      actor(req);
      const data = await ForecastingAuditService.listScenarioAudit(req.params.id, {
        actionType: req.query.action_type as string,
        priority: req.query.priority as string,
        from: req.query.from ? new Date(String(req.query.from)) : undefined,
        to: req.query.to ? new Date(String(req.query.to)) : undefined,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 25
      });
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async adminAudit(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      actor(req);
      const data = await ForecastingAuditService.listAdminAudit({
        actionType: req.query.action_type as string,
        priority: req.query.priority as string,
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 25
      });
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async highPriorityAudit(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      actor(req);
      const data = await ForecastingAuditService.listAdminAudit({
        priority: "HIGH",
        page: Number(req.query.page) || 1,
        limit: Number(req.query.limit) || 25
      });
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async listGoalLinks(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      actor(req);
      const data = await ForecastingOpmBridgeService.listGoalLinks(req.params.id);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async createGoalLink(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      const user = actor(req);
      const data = await ForecastingOpmBridgeService.createGoalLink(req.params.id, user.id, req.body);
      res.status(201).json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async deleteGoalLink(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      const user = actor(req);
      const data = await ForecastingOpmBridgeService.deleteGoalLink(
        req.params.id,
        req.params.linkId,
        user.id
      );
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async compute(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      const user = (req as any).user;
      const data = await ForecastingComputeService.run({
        scenarioId: req.body.scenario_id,
        editType: req.body.edit_type || "SCENARIO_RECALC",
        userId: user?.id,
        driverId: req.body.driver_id,
        coordinates: req.body.coordinates,
        accountRange:
          req.body.account_range_start != null
            ? { start: Number(req.body.account_range_start), end: Number(req.body.account_range_end) }
            : undefined,
        periodRange:
          req.body.period_start && req.body.period_end
            ? { start: String(req.body.period_start), end: String(req.body.period_end) }
            : undefined,
        options: req.body.options
      });
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async validateFormula(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      const result = await ForecastingComputeService.validateFormula(req.body.expression || "");
      res.json({ success: true, data: result });
    } catch (e) {
      handleError(res, e);
    }
  }

  static async getComputeJob(req: Request, res: Response) {
    try {
      if (!assertEnabled(res)) return;
      actor(req);
      const data = await ForecastingComputeService.getJob(req.params.computeJobId);
      res.json({ success: true, data });
    } catch (e) {
      handleError(res, e);
    }
  }
}
