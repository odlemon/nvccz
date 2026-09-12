// @ts-nocheck
import AuditService from "../AuditService";

export class InvestmentOpsAuditService {
  static async log(
    action: string,
    entityType: string,
    entityId: string,
    payload?: Record<string, unknown>,
    userId?: string | null
  ) {
    await AuditService.log({
      userId: userId ?? null,
      action,
      entityType: `InvestmentOps:${entityType}`,
      entityId,
      newValues: payload,
    });
  }
}
