// @ts-nocheck
import AuditService from "../AuditService";

export class ListedEquityAuditService {
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
      entityType,
      entityId,
      newValues: payload,
    });
  }

  static async securityAlert(userId: string | undefined, resource: string, detail?: Record<string, unknown>) {
    await this.log(
      "SECURITY_ALERT_UNAUTHORIZED_ACCESS",
      "ListedEquity",
      resource,
      { userId, ...detail },
      userId
    );
  }
}
