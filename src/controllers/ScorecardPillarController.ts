import { Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
import { PerformanceConfigService } from "../services/PerformanceConfigService";
import { ScorecardPillarService } from "../services/ScorecardPillarService";

export class ScorecardPillarController {
  static async list(_req: AuthRequest, res: Response) {
    try {
      const rows = await ScorecardPillarService.list();
      res.json({ success: true, data: rows });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message ?? String(e) });
    }
  }

  /**
   * GET /:id/company-goal-line-weights — company goals only, optional strategy + department line filter;
   * small payload for weight sliders (see also GET /:id?type=company).
   */
  static async getCompanyGoalLineWeights(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const strategyIdRaw = req.query.strategyId;
      const departmentNameRaw = req.query.departmentName;
      const opts: { strategyId?: string | null; departmentName?: string | null } = {};
      if (strategyIdRaw !== undefined) {
        opts.strategyId =
          strategyIdRaw === null || String(strategyIdRaw).trim() === ""
            ? null
            : String(strategyIdRaw).trim();
      }
      if (departmentNameRaw !== undefined) {
        opts.departmentName =
          departmentNameRaw === null || String(departmentNameRaw).trim() === ""
            ? null
            : String(departmentNameRaw).trim();
      }
      const data = await ScorecardPillarService.listCompanyGoalLineWeights(id, opts);
      res.json({ success: true, data });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (msg.includes("not found")) {
        res.status(404).json({ success: false, message: msg });
        return;
      }
      res.status(400).json({ success: false, message: msg });
    }
  }

  /** GET /:id — pillar details + goals for sidebar / UAT goal-to-pillar mapping. */
  static async getByIdWithGoals(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const type = req.query.type != null && String(req.query.type).trim() !== "" ? String(req.query.type).trim() : undefined;
      const status = req.query.status != null && String(req.query.status).trim() !== "" ? String(req.query.status).trim() : undefined;
      const limit = req.query.limit != null ? parseInt(String(req.query.limit), 10) : undefined;
      const offset = req.query.offset != null ? parseInt(String(req.query.offset), 10) : undefined;

      const data = await ScorecardPillarService.getByIdWithGoals(id, {
        type,
        status,
        limit: Number.isFinite(limit as number) ? limit : undefined,
        offset: Number.isFinite(offset as number) ? offset : undefined,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      if (msg.includes("not found")) {
        res.status(404).json({ success: false, message: msg });
        return;
      }
      res.status(400).json({ success: false, message: msg });
    }
  }

  static async create(req: AuthRequest, res: Response) {
    try {
      const { canonicalName, displayName, description } = req.body || {};
      if (!canonicalName) {
        res.status(400).json({ success: false, message: "canonicalName is required" });
        return;
      }
      const row = await ScorecardPillarService.create({ canonicalName, displayName, description });
      res.status(201).json({ success: true, data: row });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e?.message ?? String(e) });
    }
  }

  static async update(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { displayName, description, canonicalName, weight } = req.body || {};
      if (weight !== undefined && weight !== null && String(weight).trim() !== "") {
        res.status(400).json({
          success: false,
          message:
            "Pillar weights are not updated on this resource. Use PUT /api/performance/scorecard-pillars/weights " +
            "with all four BSC pillar ids and weights that sum to 100% (see `weights` or `pillarWeights` body).",
        });
        return;
      }
      const hasRename = canonicalName !== undefined && String(canonicalName).trim() !== "";
      const hasText = displayName !== undefined || description !== undefined;
      if (!hasRename && !hasText) {
        res
          .status(400)
          .json({ success: false, message: "Provide displayName, description, and/or canonicalName" });
        return;
      }
      const data =
        hasRename
          ? await ScorecardPillarService.renameCanonical(id, String(canonicalName).trim())
          : await ScorecardPillarService.update(id, { displayName, description });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e?.message ?? String(e) });
    }
  }

  /** PUT /weights — all four BSC pillars, sum 100%. */
  static async updateWeights(req: AuthRequest, res: Response) {
    try {
      const data = await ScorecardPillarService.setPillarWeightsBsc(req.body || {});
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e?.message ?? String(e) });
    }
  }

  /**
   * PUT /:id/company-goal-weights — set `scorecardWeight` for every company goal in this pillar
   * in one strategy/department group (totals 100%). Single-goal updates: PUT /performance/config/goals/:goalId
   */
  static async setCompanyGoalWeights(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const { goalWeights, weightChangeReason } = (req.body || {}) as {
        goalWeights?: Record<string, number>;
        weightChangeReason?: string;
      };
      const data = await PerformanceConfigService.setCompanyGoalWeightsInPillarBatch({
        pillarId: id,
        goalWeights: goalWeights || {},
        weightChangeReason,
        actor: req.user,
        meta: { ipAddress: req.ip, userAgent: req.get("user-agent") || undefined },
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e?.message ?? String(e) });
    }
  }

  static async remove(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const result = await ScorecardPillarService.remove(id);
      res.json({ success: true, data: result });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e?.message ?? String(e) });
    }
  }
}

