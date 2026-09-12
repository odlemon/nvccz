// @ts-nocheck
import { NextFunction, Request, Response } from "express";
import { ReportingScheduleConfigService } from "../services/ReportingScheduleConfigService";
import { ReportingSchedulePreviewService } from "../services/ReportingSchedulePreviewService";

export class ReportingScheduleConfigController {
  static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const rows = await ReportingScheduleConfigService.list();
      return res.status(200).json({ success: true, data: { configs: rows } });
    } catch (e: any) {
      next(e);
    }
  }

  static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const row = await ReportingScheduleConfigService.getById(id);
      if (!row) return res.status(404).json({ success: false, message: "Not found" });
      return res.status(200).json({ success: true, data: row });
    } catch (e: any) {
      next(e);
    }
  }

  static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const created = await ReportingScheduleConfigService.create(req.body || {});
      return res.status(201).json({ success: true, data: created });
    } catch (e: any) {
      const msg = e?.message || "Create failed";
      if (msg.includes("required") || msg.includes("must") || msg.includes("not found")) {
        return res.status(400).json({ success: false, message: msg });
      }
      next(e);
    }
  }

  static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const updated = await ReportingScheduleConfigService.update(id, req.body || {});
      if (!updated) return res.status(404).json({ success: false, message: "Not found" });
      return res.status(200).json({ success: true, data: updated });
    } catch (e: any) {
      const msg = e?.message || "Update failed";
      if (msg.includes("required") || msg.includes("must") || msg.includes("not found")) {
        return res.status(400).json({ success: false, message: msg });
      }
      next(e);
    }
  }

  static async remove(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const ok = await ReportingScheduleConfigService.delete(id);
      if (!ok) return res.status(404).json({ success: false, message: "Not found" });
      return res.status(200).json({ success: true, message: "Deleted" });
    } catch (e: any) {
      next(e);
    }
  }

  static async previewById(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const data = await ReportingSchedulePreviewService.previewByConfigId(id, {
        asOfDate: req.query.asOfDate as string | undefined,
        count: req.query.count as any,
      });
      if (!data) return res.status(404).json({ success: false, message: "Not found" });
      return res.status(200).json({ success: true, data });
    } catch (e: any) {
      const msg = e?.message || "Preview failed";
      if (msg.includes("Invalid") || msg.includes("must") || msg.includes("Cannot")) {
        return res.status(400).json({ success: false, message: msg });
      }
      next(e);
    }
  }

}
