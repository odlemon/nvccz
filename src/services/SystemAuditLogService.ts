/**
 * System Audit Log Service
 * Provides the "System Audit Log" view: login, record creation, report export with user and IP.
 */

import { prisma } from "../utils/database";

export interface SystemAuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId: string | null;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
  } | null;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: Date;
  summary?: string; // Human-readable summary for display
}

export interface GetSystemAuditLogParams {
  /** Time window in hours from now (default 24) */
  hours?: number;
  /** Filter by action (e.g. LOGIN, CREATE, REPORT_EXPORT) */
  action?: string;
  /** Filter by entity type (e.g. User, JournalEntry) */
  entityType?: string;
  /** Max entries to return (default 200) */
  limit?: number;
}

/**
 * Get system audit log entries for the last N hours, with user and IP.
 * Every login, record creation, and report export should be logged and appear here.
 */
export async function getSystemAuditLog(
  params: GetSystemAuditLogParams = {}
): Promise<{ entries: SystemAuditLogEntry[]; total: number }> {
  const hours = Math.max(1, Math.min(168, params.hours ?? 24)); // 1h–7d
  const limit = Math.min(500, Math.max(1, params.limit ?? 200));
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const where: any = { createdAt: { gte: since } };
  if (params.action) where.action = params.action;
  if (params.entityType) where.entityType = params.entityType;

  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        action: true,
        entityType: true,
        entityId: true,
        userId: true,
        ipAddress: true,
        userAgent: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    }),
    prisma.auditLog.count({ where }),
  ]);

  const result: SystemAuditLogEntry[] = entries.map((e) => ({
    id: e.id,
    action: e.action,
    entityType: e.entityType,
    entityId: e.entityId,
    userId: e.userId,
    user: e.user
      ? {
          id: e.user.id,
          firstName: e.user.firstName,
          lastName: e.user.lastName,
          email: e.user.email,
        }
      : null,
    ipAddress: e.ipAddress ?? null,
    userAgent: e.userAgent ?? null,
    createdAt: e.createdAt,
    summary: formatSummary(e.action, e.entityType, e.entityId, e.user),
  }));

  return { entries: result, total };
}

function formatSummary(
  action: string,
  entityType: string,
  entityId: string,
  user: { firstName: string | null; lastName: string | null; email: string } | null
): string {
  const who = user ? [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email : "System";
  switch (action) {
    case "LOGIN":
      return `${who} logged in`;
    case "REPORT_EXPORT":
      return `${who} exported ${entityType}: ${entityId}`;
    case "CREATE":
      return `${who} created ${entityType}`;
    case "UPDATE":
      return `${who} updated ${entityType}`;
    case "DELETE":
      return `${who} deleted ${entityType}`;
    case "POST":
      return `${who} posted ${entityType}`;
    case "VOID":
      return `${who} voided ${entityType}`;
    default:
      return `${who} – ${action} ${entityType}`;
  }
}
