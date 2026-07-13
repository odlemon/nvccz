// @ts-nocheck
import { prisma } from "../../utils/database";

export type FpaAuditPayload = {
  modelId?: string | null;
  scenarioId?: string | null;
  versionId?: string | null;
  cellId?: string | null;
  lineItemId?: string | null;
  moduleId?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  oldValue?: string | number | null;
  newValue?: string | number | null;
  reason?: string | null;
  ip?: string | null;
};

export class FpaAuditService {
  static async log(actionType: string, userId: string, payload: FpaAuditPayload = {}) {
    if (!userId) return null;
    let reason = payload.reason || null;
    if (payload.summary || payload.entityId) {
      let obj: any = {};
      if (reason) {
        try {
          const parsed = JSON.parse(reason);
          if (parsed && typeof parsed === "object") obj = { ...parsed };
          else obj.detail = reason;
        } catch {
          obj.detail = reason;
        }
      }
      if (payload.summary) obj.summary = payload.summary;
      if (payload.entityId) obj.entityId = payload.entityId;
      if (payload.entityType && !obj.entityType) obj.entityType = payload.entityType;
      reason = JSON.stringify(obj);
    }
    return prisma.planningAuditLog.create({
      data: {
        actionType,
        userId,
        modelId: payload.modelId || null,
        scenarioId: payload.scenarioId || null,
        versionId: payload.versionId || null,
        cellId: payload.cellId || null,
        lineItemId: payload.lineItemId || null,
        moduleId: payload.moduleId || null,
        entityType: payload.entityType || null,
        oldValue: payload.oldValue != null ? String(payload.oldValue) : null,
        newValue: payload.newValue != null ? String(payload.newValue) : null,
        reason: reason || null,
        ipAddress: payload.ip || null,
      },
    });
  }

  /** FE drawer / History: { entries, nextCursor } */
  static async listForFe(modelId: string, query: any = {}) {
    const where: any = { modelId };
    if (query.actionType || query.action) where.actionType = String(query.actionType || query.action);
    if (query.userId) where.userId = String(query.userId);
    if (query.moduleId) where.moduleId = String(query.moduleId);
    if (query.lineItemId) where.lineItemId = String(query.lineItemId);
    if (query.entityType) where.entityType = String(query.entityType);
    if (query.from || query.to) {
      where.createdAt = {};
      if (query.from) where.createdAt.gte = new Date(String(query.from));
      if (query.to) where.createdAt.lte = new Date(String(query.to));
    }
    if (query.q) {
      const q = String(query.q).trim();
      where.OR = [{ actionType: { contains: q } }, { reason: { contains: q } }, { newValue: { contains: q } }];
    }
    const take = Math.min(Number(query.limit || query.pageSize || 50), 200);
    const skip = query.page ? (Math.max(1, Number(query.page)) - 1) * take : Number(query.offset || query.cursor || 0);

    const rows = await prisma.planningAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take,
      skip,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
    });

    const entries = rows.map((r) => {
      const u = r.user;
      const name = u ? [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email : null;
      let before = null;
      let after = null;
      let entityType = r.entityType || null;
      let entityId = null;
      let summary = r.reason || r.actionType;
      if (r.reason) {
        try {
          const parsed = JSON.parse(r.reason);
          if (parsed && typeof parsed === "object") {
            before = parsed.before ?? null;
            after = parsed.after ?? null;
            if (!entityType) entityType = parsed.entityType || null;
            entityId = parsed.entityId || null;
            if (parsed.summary) summary = parsed.summary;
          }
        } catch {
          /* plain string */
        }
      }
      if (!entityId && r.newValue) entityId = String(r.newValue);
      return {
        id: r.id,
        at: r.createdAt,
        time: r.createdAt,
        createdAt: r.createdAt,
        userId: r.userId,
        userName: name,
        action: r.actionType,
        actionType: r.actionType,
        entityType,
        entityId,
        lineItemId: r.lineItemId || null,
        moduleId: r.moduleId || null,
        summary,
        before,
        after,
        details: r.reason || r.newValue || r.oldValue || null,
        oldValue: r.oldValue,
        newValue: r.newValue,
        versionId: r.versionId,
        cellId: r.cellId,
      };
    });

    return {
      entries,
      nextCursor: entries.length === take ? String(skip + take) : null,
    };
  }

  /** Legacy: bare array (audit-logs). Pass format=fe for { entries }. */
  static async list(modelId: string, query: any = {}) {
    const payload = await FpaAuditService.listForFe(modelId, query);
    if (String(query?.format || "").toLowerCase() === "fe" || query?.fe === "1") return payload;
    return payload.entries;
  }
}
