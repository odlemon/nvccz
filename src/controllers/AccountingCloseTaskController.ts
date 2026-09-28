import type { Response } from "express";
import type { AuthRequest } from "../middleware/authenticate";
import AccountingCloseTaskService from "../services/AccountingCloseTaskService";

export default class AccountingCloseTaskController {
  static async listTasks(req: AuthRequest, res: Response) {
    try {
      const { fiscalPeriodId } = req.params;
      const rows = await AccountingCloseTaskService.listTasksForPeriod(fiscalPeriodId);
      res.json({ success: true, data: rows });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message ?? "Failed to load close tasks" });
    }
  }

  static async createTask(req: AuthRequest, res: Response) {
    try {
      const { fiscalPeriodId } = req.params;
      const body = req.body as {
        workstream?: string;
        task?: string;
        ownerId?: string | null;
        dueAt?: string | null;
        dependsOnId?: string | null;
      };
      const created = await AccountingCloseTaskService.createTask({
        fiscalPeriodId,
        workstream: body.workstream ?? "",
        task: body.task ?? "",
        ownerId: body.ownerId ?? undefined,
        dueAt: body.dueAt ? new Date(body.dueAt) : undefined,
        dependsOnId: body.dependsOnId ?? undefined,
      });
      res.json({ success: true, data: created });
    } catch (e: any) {
      const status = typeof e?.statusCode === "number" ? e.statusCode : 500;
      res.status(status).json({ success: false, message: e?.message ?? "Failed to create close task" });
    }
  }

  static async updateTaskStatus(req: AuthRequest, res: Response) {
    try {
      const { taskId } = req.params;
      const body = req.body as { status?: string };
      if (!body?.status) {
        res.status(400).json({ success: false, message: "status is required" });
        return;
      }
      // completedById always comes from the authenticated session, never the request body.
      const userId = req.user!.id;
      // an owner moves their own task along (in progress, complete); anything else, and reopening a completed task, is
      // the period manager's
      const { userHasEffectivePermission } = await import("../config/cfoModulePermissions");
      if (!userHasEffectivePermission(req.user, "accounting.period_lock.manage")) {
        const { prisma } = await import("../utils/database");
        const t = await prisma.accountingCloseTask.findUnique({ where: { id: taskId }, select: { ownerId: true, status: true } });
        if (!t || t.ownerId !== userId || t.status === "COMPLETE") {
          res.status(403).json({ success: false, message: t && t.ownerId === userId ? "A completed task is reopened by the period manager." : "Only the task's owner or the period manager can change it." });
          return;
        }
      }
      const updated = await AccountingCloseTaskService.updateTaskStatus(
        taskId,
        body.status,
        body.status === "COMPLETE" ? userId : undefined
      );
      res.json({ success: true, data: updated });
    } catch (e: any) {
      const status = typeof e?.statusCode === "number" ? e.statusCode : 500;
      res.status(status).json({ success: false, message: e?.message ?? "Failed to update close task" });
    }
  }

  static async readiness(req: AuthRequest, res: Response) {
    try {
      res.json({ success: true, data: await AccountingCloseTaskService.readiness(req.params.fiscalPeriodId) });
    } catch (e: any) {
      res.status(typeof e?.statusCode === "number" ? e.statusCode : 500).json({ success: false, message: e?.message ?? "Failed to evaluate readiness" });
    }
  }

  static async addStandard(req: AuthRequest, res: Response) {
    try {
      res.json({ success: true, data: await AccountingCloseTaskService.addStandardChecklist(req.params.fiscalPeriodId, (req.body && req.body.ownerId) || null) });
    } catch (e: any) {
      res.status(typeof e?.statusCode === "number" ? e.statusCode : 500).json({ success: false, message: e?.message ?? "Failed to add the standard checklist" });
    }
  }

  static async canLock(req: AuthRequest, res: Response) {
    try {
      const { fiscalPeriodId } = req.params;
      const result = await AccountingCloseTaskService.canLockPeriod(fiscalPeriodId);
      res.json({ success: true, data: result });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message ?? "Failed to evaluate can-lock" });
    }
  }
}
