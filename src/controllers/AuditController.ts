// @ts-nocheck
import { Request, Response } from "express";
import { prisma } from "../utils/database";
import { ResponseHelper } from "../utils/responseHelper";
import { parseDate } from "../utils/dateHelper";

export class AuditController {
  /**
   * GET /api/audit-logs
   * Query all audit logs with optional filters and pagination
   * Query params: page, limit, userId, action, entityType, entityId, startDate, endDate
   */
  static async getAuditLogs(req: Request, res: Response) {
    try {
      const {
        page = "1",
        limit = "10",
        userId,
        action,
        entityType,
        entityId,
        startDate,
        endDate,
      } = req.query as Record<string, string>;

      const pageNum = Math.max(parseInt(page) || 1, 1);
      const limitNum = Math.min(Math.max(parseInt(limit) || 10, 1), 100);
      const skip = (pageNum - 1) * limitNum;

      const where: any = {};
      if (userId) where.userId = userId;
      if (action) where.action = action;
      if (entityType) where.entityType = entityType;
      if (entityId) where.entityId = entityId;

      if (startDate || endDate) {
        where.createdAt = {};
        if (startDate) where.createdAt.gte = parseDate(startDate);
        if (endDate) where.createdAt.lte = parseDate(endDate);
      }

      const [logsRaw, total] = await Promise.all([
        prisma.auditLog.findMany({
          where,
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true, email: true },
            },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take: limitNum,
        }),
        prisma.auditLog.count({ where }),
      ]);

      // Audit UAT: createdAt as exact ISO-8601 string; stable for clients and compliance tooling
      const logs = logsRaw.map((log: any) => {
        const { ipAddress, userAgent, createdAt, ...rest } = log;
        const out: any = {
          ...rest,
          createdAt:
            createdAt instanceof Date ? createdAt.toISOString() : new Date(createdAt).toISOString(),
        };
        if (ipAddress) out.ipAddress = ipAddress;
        if (userAgent) out.userAgent = userAgent;
        return out;
      });

      return ResponseHelper.paginated(res, "Audit logs retrieved successfully", logs, {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum) || 1,
        hasNextPage: skip + logs.length < total,
        hasPrevPage: pageNum > 1,
      });
    } catch (error: any) {
      return ResponseHelper.error(res, "Failed to retrieve audit logs", error.message);
    }
  }
}

export default AuditController;