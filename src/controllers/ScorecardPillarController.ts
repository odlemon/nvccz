import { Response } from "express";
import { AuthRequest } from "../middleware/authenticate";
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
      const { displayName, description, canonicalName } = req.body || {};
      const row =
        canonicalName !== undefined
          ? await ScorecardPillarService.renameCanonical(id, String(canonicalName))
          : await ScorecardPillarService.update(id, { displayName, description });
      res.json({ success: true, data: row });
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

