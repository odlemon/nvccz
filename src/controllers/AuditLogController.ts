// @ts-nocheck
import { Request, Response } from "express";
import AuditService from "../services/AuditService";
import { responseHelper } from "../utils/responseHelper";

export class AuditLogController {
  static async list(req: Request, res: Response) {
    try {
      const page = parseInt(String(req.query.page || "1"), 10) || 1;
      const limit = Math.min(100, parseInt(String(req.query.limit || "50"), 10) || 50);
      const entityType = req.query.entityType as string | undefined;
      const entityId = req.query.entityId as string | undefined;
      const adminId = req.query.adminId as string | undefined;
      const action = req.query.action as string | undefined;

      const result = await AuditService.listAuditLogs({
        page,
        limit,
        entityType: entityType?.trim() || undefined,
        entityId: entityId?.trim() || undefined,
        actorUserId: adminId?.trim() || undefined,
        action: action?.trim() || undefined
      });

      return responseHelper.success(res, result, "Audit logs retrieved successfully");
    } catch (error) {
      return responseHelper.error(res, error.message);
    }
  }
}
