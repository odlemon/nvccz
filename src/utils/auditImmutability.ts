// @ts-nocheck
/**
 * SRD §33: business users must not be able to delete or modify audit history.
 *
 * Two layers, both server-side. (1) Every write through the application's Prisma client that would update or delete an
 * audit row is refused here, whichever route or service asked. (2) The database itself refuses UPDATE and DELETE on audit_logs
 * (triggers in scripts/run-document-audit-migration.ts), so raw SQL cannot alter history either. Only appending is possible.
 * A maintainer who genuinely has to alter history sets the session variable @audit_maintenance = 1 on their own connection.
 */
export class AuditImmutableError extends Error {
  status = 403;
  code = "AUDIT_IMMUTABLE";
  constructor() {
    super("Audit history is immutable: entries cannot be edited or deleted.");
  }
}

const BLOCKED = new Set(["update", "updateMany", "delete", "deleteMany", "upsert"]);

export function attachAuditImmutabilityMiddleware(client: any) {
  client.$use(async (params: any, next: any) => {
    if (params.model === "AuditLog" && BLOCKED.has(params.action)) throw new AuditImmutableError();
    return next(params);
  });
}
