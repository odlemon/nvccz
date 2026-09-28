//@ts-nocheck
import AuditService from "../services/AuditService";
import { Request, Response } from "express";
import { ProcurementNtsRemainingService } from "../services/ProcurementNtsRemainingService";

export class ProcurementNtsRemainingController {
  static async getSettings(_req: Request, res: Response) {
    try {
      const data = await ProcurementNtsRemainingService.getSettings();
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async putSettings(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const before = await ProcurementNtsRemainingService.getSettings().catch(() => null);
      const data = await ProcurementNtsRemainingService.updateSettings(userId, req.body || {});
      await AuditService.log({ userId, action: "SETTINGS_UPDATE", entityType: "ProcurementSettings", entityId: "procurement-settings", oldValues: before, newValues: data, eventType: "WORKFLOW_CHANGE" });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async runComplianceReminders(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const data = await ProcurementNtsRemainingService.runComplianceReminders(userId);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async listRpaJobs(req: Request, res: Response) {
    try {
      const data = await ProcurementNtsRemainingService.listRpaJobs({
        status: req.query.status ? String(req.query.status) : undefined,
        take: req.query.take ? Number(req.query.take) : undefined,
        skip: req.query.skip ? Number(req.query.skip) : undefined,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async enqueueRpaJob(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const jobType = String(req.body?.jobType || "").trim();
      if (!jobType) return res.status(400).json({ success: false, message: "jobType is required" });
      const data = await ProcurementNtsRemainingService.enqueueRpaJob({
        jobType,
        payload: req.body?.payload,
        createdById: userId,
      });
      res.status(201).json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async aiUsageSummary(req: Request, res: Response) {
    try {
      const days = req.query.days ? Number(req.query.days) : 30;
      const data = await ProcurementNtsRemainingService.aiUsageSummary(days);
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async saveConflicts(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const declarations = Array.isArray(req.body?.declarations) ? req.body.declarations : [];
      if (!declarations.length) {
        return res.status(400).json({ success: false, message: "declarations[] required" });
      }
      const data = await ProcurementNtsRemainingService.saveConflictDeclarations({
        procurementRfqId: req.params.id,
        declarations,
        recordedById: userId,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async deptIsolationProbe(req: Request, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const data = await ProcurementNtsRemainingService.deptIsolationProbe({
        userId,
        department: (req.user as any)?.userDepartment || (req.user as any)?.department || null,
        isPrivileged: !!(req.user as any)?.isPrivileged,
      });
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }

  static async consolidationFx(req: Request, res: Response) {
    try {
      const data = await ProcurementNtsRemainingService.consolidationFxRate(
        req.query.currencyId ? String(req.query.currencyId) : undefined
      );
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(400).json({ success: false, message: e.message });
    }
  }
}
