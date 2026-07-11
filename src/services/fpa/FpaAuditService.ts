// @ts-nocheck
import { prisma } from "../../utils/database";

export type FpaAuditPayload = {
  modelId?: string | null;
  scenarioId?: string | null;
  versionId?: string | null;
  cellId?: string | null;
  oldValue?: string | number | null;
  newValue?: string | number | null;
  reason?: string | null;
  ip?: string | null;
};

export class FpaAuditService {
  static async log(actionType: string, userId: string, payload: FpaAuditPayload = {}) {
    if (!userId) return null;
    return prisma.planningAuditLog.create({
      data: {
        actionType,
        userId,
        modelId: payload.modelId || null,
        scenarioId: payload.scenarioId || null,
        versionId: payload.versionId || null,
        cellId: payload.cellId || null,
        oldValue: payload.oldValue != null ? String(payload.oldValue) : null,
        newValue: payload.newValue != null ? String(payload.newValue) : null,
        reason: payload.reason || null,
        ipAddress: payload.ip || null,
      },
    });
  }
}
