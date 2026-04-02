// @ts-nocheck
import { prisma } from "../utils/database";

const SENSITIVE_KEYS = [
  "password",
  "token",
  "secret",
  "apiKey",
  "accessToken",
  "refreshToken",
];

function sanitize(obj: any) {
  if (!obj || typeof obj !== "object") return obj;
  const clone = JSON.parse(JSON.stringify(obj));
  const walk = (o: any) => {
    Object.keys(o).forEach((k) => {
      if (SENSITIVE_KEYS.includes(k)) o[k] = "***";
      else if (o[k] && typeof o[k] === "object") walk(o[k]);
    });
  };
  walk(clone);
  return clone;
}

function stringifyDecimals(val: any) {
  if (val && typeof val === "object" && typeof val.toString === "function") {
    try { return val.toString(); } catch { return val; }
  }
  return val;
}

function normalize(obj: any) {
  if (!obj || typeof obj !== "object") return obj;
  const out: any = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") out[k] = normalize(v);
    else out[k] = stringifyDecimals(v);
  }
  return out;
}

function diff(oldVals: any, newVals: any) {
  const changes: Record<string, { old: any; new: any }> = {};
  const skip = new Set(["updatedAt", "createdAt"]);
  const o = normalize(oldVals || {});
  const n = normalize(newVals || {});
  const keys = new Set([...Object.keys(o), ...Object.keys(n)]);
  for (const k of keys) {
    if (skip.has(k)) continue;
    if (JSON.stringify(o[k]) !== JSON.stringify(n[k])) {
      changes[k] = { old: o[k], new: n[k] };
    }
  }
  return Object.keys(changes).length ? changes : null;
}

export default class AuditService {
  static async log(params: {
    userId?: string | null;
    action: string; // CREATE, UPDATE, DELETE, POST, VOID, LOGIN, etc.
    entityType: string;
    entityId: string;
    oldValues?: any;
    newValues?: any;
    ipAddress?: string | null;
    userAgent?: string | null;
  }) {
    const { userId, action, entityType, entityId, oldValues, newValues, ipAddress, userAgent } = params;

    await prisma.auditLog.create({
      data: {
        userId: userId || null,
        action,
        entityType,
        entityId,
        oldValues: oldValues ? sanitize(oldValues) : undefined,
        newValues: newValues ? sanitize(newValues) : undefined,
        ipAddress: ipAddress || undefined,
        userAgent: userAgent || undefined,
      },
    });
  }

  static computeUpdateDiff(oldRecord: any, updatedRecord: any) {
    return diff(oldRecord, updatedRecord);
  }

  /**
   * Paginated audit log fetch (admin UI / compliance).
   * Query filters: entityType, entityId, actorUserId (maps to query param adminId), action.
   */
  static async listAuditLogs(filters: {
    entityType?: string;
    entityId?: string;
    actorUserId?: string;
    action?: string;
    page?: number;
    limit?: number;
  }) {
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 50));
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filters.entityType) where.entityType = filters.entityType;
    if (filters.entityId) where.entityId = filters.entityId;
    if (filters.actorUserId) where.userId = filters.actorUserId;
    if (filters.action) where.action = filters.action;

    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          }
        }
      }),
      prisma.auditLog.count({ where })
    ]);

    const items = rows.map((log) => {
      const entry: Record<string, unknown> = {
        id: log.id,
        adminId: log.userId,
        targetId: log.entityId,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        timestamp: log.createdAt,
        ipAddress: log.ipAddress,
        userAgent: log.userAgent,
        admin: log.user
          ? {
              id: log.user.id,
              email: log.user.email,
              firstName: log.user.firstName,
              lastName: log.user.lastName
            }
          : null,
        oldValues: log.oldValues,
        newValues: log.newValues
      };
      if (log.action === "USER_ROLE_UPDATE" && log.entityType === "User") {
        const o = (log.oldValues || {}) as Record<string, unknown>;
        const n = (log.newValues || {}) as Record<string, unknown>;
        entry.oldRole = {
          id: o.oldRoleId ?? null,
          name: o.oldRoleName ?? null,
          roleCode: o.oldRoleCode ?? null
        };
        entry.newRole = {
          id: n.newRoleId ?? null,
          name: n.newRoleName ?? null,
          roleCode: n.newRoleCode ?? null
        };
      }
      if (log.action === "KPI_TARGET_UPDATE" && log.entityType === "PerformanceGoal") {
        const o = (log.oldValues || {}) as Record<string, unknown>;
        const n = (log.newValues || {}) as Record<string, unknown>;
        entry.kpiTargetChange = {
          goalId: log.entityId,
          userId: log.userId,
          previousTarget: o.targetValue,
          newTarget: n.targetValue,
          delta: n.delta,
          reason: n.reason ?? null
        };
      }
      return entry;
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0
      }
    };
  }
}