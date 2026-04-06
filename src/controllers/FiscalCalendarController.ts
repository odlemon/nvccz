import type { Response } from "express";
import type { AuthRequest } from "../middleware/authenticate";
import FiscalCalendarService from "../services/FiscalCalendarService";
import PeriodLockService from "../services/PeriodLockService";
import PostingGuardService from "../services/PostingGuardService";
import type { PeriodLockDraftJson } from "../services/fiscalPeriodLockTypes";

export default class FiscalCalendarController {
  static async getCalendar(req: AuthRequest, res: Response) {
    try {
      const data = await FiscalCalendarService.listCalendarWithLocks();
      const draft = await PeriodLockService.getOrCreateDraft();
      res.json({ success: true, data: { ...data, draft } });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message ?? "Failed to load fiscal calendar" });
    }
  }

  static async putLocksDraft(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const body = req.body as { draft?: PeriodLockDraftJson };
      if (!body?.draft?.moduleLocks) {
        res.status(400).json({ success: false, message: "draft.moduleLocks required" });
        return;
      }
      await PeriodLockService.saveDraft({ draft: body.draft, userId });
      res.json({ success: true, message: "Draft saved (not active until commit)" });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message ?? "Failed to save draft" });
    }
  }

  static async postLocksCommit(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const reason = (req.body as { reason?: string })?.reason;
      const result = await PeriodLockService.commitDraft({
        userId,
        reason: reason ?? null,
        source: "API",
      });
      res.json({ success: true, ...result });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message ?? "Commit failed" });
    }
  }

  static async getAudit(req: AuthRequest, res: Response) {
    try {
      const take = Math.min(Number(req.query.take) || 100, 500);
      const skip = Number(req.query.skip) || 0;
      const rows = await PeriodLockService.listAuditLogs({ take, skip });
      res.json({ success: true, data: rows });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message ?? "Failed to load audit" });
    }
  }

  static async getExceptions(req: AuthRequest, res: Response) {
    try {
      const take = Math.min(Number(req.query.take) || 50, 200);
      const skip = Number(req.query.skip) || 0;
      const status = req.query.status ? String(req.query.status) : undefined;
      const rows = await PostingGuardService.listExceptions({ status, take, skip });
      const emptyHint =
        rows.length === 0
          ? "No queued rejections yet. Turn on glErrorBatchEnabled via PATCH /accounting/fiscal-calendar/policy, then block a period and retry a post (e.g. journal or cashbook) dated in that month — each lock rejection creates a row when the policy flag is true."
          : undefined;
      res.json({ success: true, data: rows, ...(emptyHint ? { emptyHint } : {}) });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message ?? "Failed to load exceptions" });
    }
  }

  static async patchPolicy(req: AuthRequest, res: Response) {
    try {
      const userId = req.user!.id;
      const b = req.body as {
        lockedPeriodPolicy?: "ERROR" | "WARN";
        allowOverridePosting?: boolean;
        glErrorBatchEnabled?: boolean;
      };
      const updated = await PeriodLockService.updatePolicy({
        userId,
        lockedPeriodPolicy: b.lockedPeriodPolicy,
        allowOverridePosting: b.allowOverridePosting,
        glErrorBatchEnabled: b.glErrorBatchEnabled,
      });
      res.json({ success: true, data: updated });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e?.message ?? "Policy update failed" });
    }
  }
}
