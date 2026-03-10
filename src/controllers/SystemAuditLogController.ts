// @ts-nocheck
import { Request, Response } from "express";
import { getSystemAuditLog } from "../services/SystemAuditLogService";
import { ResponseHelper } from "../utils/responseHelper";

/**
 * System Audit Log (Activity Log) controller.
 * View login, record creation, and report export with user and IP.
 */
export class SystemAuditLogController {
  /**
   * GET /api/system-audit-log
   * Query params: hours (default 24), action, entityType, limit (default 200, max 500)
   */
  static async getSystemAuditLog(req: Request, res: Response) {
    try {
      const hours = req.query.hours != null ? parseInt(String(req.query.hours), 10) : 24;
      const action = (req.query.action as string) || undefined;
      const entityType = (req.query.entityType as string) || undefined;
      const limit = req.query.limit != null ? parseInt(String(req.query.limit), 10) : 200;

      const result = await getSystemAuditLog({
        hours: Number.isFinite(hours) ? hours : 24,
        action,
        entityType,
        limit: Number.isFinite(limit) ? limit : 200,
      });

      return ResponseHelper.success(res, "System audit log retrieved successfully", {
        entries: result.entries,
        total: result.total,
        hours: hours || 24,
      });
    } catch (error: any) {
      console.error("Error getting system audit log:", error);
      return ResponseHelper.error(res, "Failed to retrieve system audit log", error?.message, 500);
    }
  }

  /**
   * GET /api/system-audit-log/last-24-hours
   * Convenience endpoint: last 24 hours only.
   */
  static async getLast24Hours(req: Request, res: Response) {
    try {
      const result = await getSystemAuditLog({ hours: 24, limit: 200 });
      return ResponseHelper.success(res, "Last 24 hours audit log retrieved successfully", {
        entries: result.entries,
        total: result.total,
      });
    } catch (error: any) {
      console.error("Error getting last 24h audit log:", error);
      return ResponseHelper.error(res, "Failed to retrieve audit log", error?.message, 500);
    }
  }
}

export default SystemAuditLogController;
