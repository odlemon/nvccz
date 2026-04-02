// @ts-nocheck

import { Request, Response } from "express";
import { PerformanceConfigService } from "../services/PerformanceConfigService";
import { responseHelper } from "../utils/responseHelper";

function requestMeta(req: Request) {
  return {
    ipAddress: req.ip,
    userAgent: req.get("user-agent")
  };
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

  static async listStrategies(req: Request, res: Response) {
    try {
      const includeArchived = req.query.includeArchived !== "false";
      const data = await PerformanceConfigService.listStrategies(includeArchived);
      return responseHelper.success(res, data, "Performance strategies retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
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
    } catch (error) {
      return responseHelper.error(res, error.message);
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

      const data = await PerformanceConfigService.attachStrategyDocument({
        strategyId: req.params.id,
        fileBuffer: req.file.buffer,
        originalName: req.file.originalname,
        actor: req.user,
        meta: requestMeta(req)
      });
      return responseHelper.success(res, data, "Strategy document uploaded successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async listThemes(_req: Request, res: Response) {
    try {
      const data = await PerformanceConfigService.listThemes();
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
      return responseHelper.error(res, error.message);
    }
  }

  static async tagGoalsWithTheme(req: Request, res: Response) {
    try {
      const data = await PerformanceConfigService.tagGoalsWithTheme({
        themeId: req.params.id,
        goalIds: req.body.goalIds || [],
        actor: req.user,
        meta: requestMeta(req)
      });
      return responseHelper.success(res, data, "Goals tagged successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }

  static async getGoalsByTheme(req: Request, res: Response) {
    try {
      const data = await PerformanceConfigService.getGoalsByTheme(req.params.id);
      return responseHelper.success(res, data, "Theme goal mapping retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
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
