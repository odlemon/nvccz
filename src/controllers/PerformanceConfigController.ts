// @ts-nocheck

import { Request, Response } from "express";
import { PerformanceConfigService } from "../services/PerformanceConfigService";
import { PerformanceGoalService } from "../services/PerformanceGoalService";
import { responseHelper } from "../utils/responseHelper";

function requestMeta(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  };
}

/** A.10 / UAT: archived strategies must not be mutated via API. */
function httpStatusForStrategyWriteError(message: string) {
  if (String(message || "").includes("Archived strategies are read-only")) {
    return 403;
  }
  return 500;
}

export class PerformanceConfigController {
  static async getPillars(_req: Request, res: Response) {
    try {
      const data = await PerformanceConfigService.getPillarConfig();
      return responseHelper.success(res, data, "Performance pillar configuration retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async getVisionStatement(_req: Request, res: Response) {
    try {
      const data = await PerformanceConfigService.getVisionStatement();
      return responseHelper.success(res, data, "Vision statement retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async listStrategies(req: Request, res: Response) {
    try {
      const includeArchived = req.query.includeArchived !== "false";
      const data = await PerformanceConfigService.listStrategies(includeArchived);
      return responseHelper.success(res, data, "Performance strategies retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async listArchivedStrategies(_req: Request, res: Response) {
    try {
      const data = await PerformanceConfigService.listArchivedStrategies();
      return responseHelper.success(
        res,
        data,
        "Archived performance strategies (historical) retrieved successfully"
      );
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async getStrategyById(req: Request, res: Response) {
    try {
      const data = await PerformanceConfigService.getStrategyById(req.params.id);
      return responseHelper.success(res, data, "Performance strategy retrieved successfully");
    } catch (error: any) {
      const msg = error?.message || "Error";
      const status = msg === "Strategy not found." ? 404 : 500;
      return responseHelper.error(res, msg, undefined, status);
    }
  }

  static async upsertStrategy(req: Request, res: Response) {
    try {
      const data = await PerformanceConfigService.upsertStrategy({
        strategyId: req.params.id,
        ...req.body,
        actor: req.user,
        meta: requestMeta(req)
      });
      return responseHelper.success(res, data, "Performance strategy saved successfully");
    } catch (error: any) {
      const msg = error?.message || "Error";
      return responseHelper.error(res, msg, undefined, httpStatusForStrategyWriteError(msg));
    }
  }

  static async archiveStrategy(req: Request, res: Response) {
    try {
      const data = await PerformanceConfigService.archiveStrategy(req.params.id, req.user, requestMeta(req));
      return responseHelper.success(res, data, "Performance strategy archived successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async uploadStrategyDocument(req: Request, res: Response) {
    try {
      if (!req.file?.buffer) {
        return responseHelper.error(res, "A PDF strategy document is required.");
      }

      const strategicGoalId =
        req.body?.strategicGoalId != null && String(req.body.strategicGoalId).trim() !== ""
          ? String(req.body.strategicGoalId).trim()
          : undefined;

      const data = await PerformanceConfigService.attachStrategyDocument({
        strategyId: req.params.id,
        fileBuffer: req.file.buffer,
        originalName: req.file.originalname,
        strategicGoalId,
        actor: req.user,
        meta: requestMeta(req)
      });
      return responseHelper.success(res, data, "Strategy document uploaded successfully");
    } catch (error: any) {
      const msg = error?.message || "Error";
      return responseHelper.error(res, msg, undefined, httpStatusForStrategyWriteError(msg));
    }
  }

  static async updateTheme(req: Request, res: Response) {
    try {
      const data = await PerformanceConfigService.updateTheme({
        id: req.params.id,
        patch: req.body,
        actor: req.user,
        meta: requestMeta(req)
      });
      return responseHelper.success(res, data, "Performance theme updated successfully");
    } catch (error) {
      const msg = error?.message || "Error";
      return responseHelper.error(res, msg, undefined, msg === "Theme not found." ? 404 : /already exists/.test(msg) ? 409 : 400);
    }
  }

  static async untagGoalsFromTheme(req: Request, res: Response) {
    try {
      const goalIds = Array.isArray(req.body?.goalIds) ? req.body.goalIds : [];
      await PerformanceConfigService.untagGoalsFromTheme({ themeId: req.params.id, goalIds, actor: req.user, meta: requestMeta(req) });
      return responseHelper.success(res, { themeId: req.params.id, goalIds }, "Goals untagged successfully");
    } catch (error) {
      const msg = error?.message || "Error";
      return responseHelper.error(res, msg, undefined, msg === "Theme not found." ? 404 : 400);
    }
  }

  static async listThemes(req: Request, res: Response) {
    try {
      const data = await PerformanceConfigService.listThemes({ includeArchived: String(req.query?.includeArchived || "") === "true" });
      return responseHelper.success(res, data, "Performance themes retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async createTheme(req: Request, res: Response) {
    try {
      const data = await PerformanceConfigService.createTheme({
        ...req.body,
        actor: req.user,
        meta: requestMeta(req)
      });
      return responseHelper.success(res, data, "Performance theme saved successfully");
    } catch (error) {
      const msg = error?.message || "Error";
      return responseHelper.error(res, msg, undefined, /already exists|already uses/.test(msg) ? 409 : 400);
    }
  }

  static async tagGoalsWithTheme(req: Request, res: Response) {
    try {
      const goalIds = Array.isArray(req.body.goalIds) ? req.body.goalIds : [];
      await PerformanceConfigService.tagGoalsWithTheme({
        themeId: req.params.id,
        goalIds,
        actor: req.user,
        meta: requestMeta(req)
      });
      const data = await PerformanceGoalService.getPerformanceGoalsByIds(goalIds);
      return responseHelper.success(res, data, "Goals tagged successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async getGoalsByTheme(req: Request, res: Response) {
    try {
      const data = await PerformanceGoalService.getGoalsByStrategicTheme(req.params.id);
      return responseHelper.success(res, data, "Theme goal mapping retrieved successfully");
    } catch (error: any) {
      const msg = error?.message || "Error";
      if (msg === "Theme not found.") {
        return responseHelper.error(res, msg, undefined, 404);
      }
      return responseHelper.error(res, msg);
    }
  }

  static async updateGoalScorecardConfig(req: Request, res: Response) {
    try {
      const data = await PerformanceConfigService.updateGoalScorecardConfig({
        goalId: req.params.goalId,
        ...req.body,
        actor: req.user,
        meta: requestMeta(req)
      });
      return responseHelper.success(res, data, "Goal scorecard configuration updated successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }
}
