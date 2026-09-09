// @ts-nocheck
/**
 * Payroll audit trail.
 *
 * The runtime's logEvent() wrote to an in-memory array that died with the page,
 * so the Audit Trail screen — a governance screen — showed six invented events
 * and nothing that had actually happened was recorded anywhere.
 *
 * Backed by `payroll_audit_events`, created by
 *   npm run db:migrate:payroll-v6-audit-table
 * That table is managed outside Prisma on purpose (see the migration script),
 * so everything here goes through $queryRaw/$executeRaw and schema.prisma is
 * untouched.
 *
 * Recording must never break the thing it is recording: every write is
 * best-effort and swallows its own errors, so a missing table or a failed
 * insert cannot fail a payroll run.
 */
import { randomUUID } from "crypto"
import { prisma } from "../../utils/database"

export type PayrollAuditInput = {
  action: string
  eventClass?: "Change" | "Approval" | "Access" | "Release" | "Security"
  entityType?: string | null
  entityId?: string | null
  entityLabel?: string | null
  detail?: string | null
  actor?: { id?: string | null; firstName?: string | null; lastName?: string | null; role?: { name?: string | null } | null } | null
}

export class PayrollAuditService {
  /** Best-effort write. Never throws. */
  static async record(input: PayrollAuditInput): Promise<void> {
    try {
      const actorName = input.actor
        ? `${input.actor.firstName ?? ""} ${input.actor.lastName ?? ""}`.trim() || null
        : null
      await prisma.$executeRawUnsafe(
        `INSERT INTO payroll_audit_events
           (id, occurred_at, actor_user_id, actor_name, actor_role, action,
            event_class, entity_type, entity_id, entity_label, detail)
         VALUES (?, NOW(3), ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        input.actor?.id ?? null,
        actorName,
        input.actor?.role?.name ?? null,
        input.action,
        input.eventClass ?? "Change",
        input.entityType ?? null,
        input.entityId ?? null,
        input.entityLabel ?? null,
        input.detail ?? null,
      )
    } catch (err) {
      // Deliberately swallowed: an audit write must not fail a payroll run.
      console.error("[payroll-audit] failed to record event", input.action, err)
    }
  }

  /**
   * Most recent events first. `limit` is clamped so a caller cannot ask for the
   * whole table.
   */
  static async list(options: {
    limit?: number
    entityType?: string
    entityId?: string
    action?: string
  } = {}) {
    const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500)

    const where: string[] = []
    const params: any[] = []
    if (options.entityType) {
      where.push("entity_type = ?")
      params.push(options.entityType)
    }
    if (options.entityId) {
      where.push("entity_id = ?")
      params.push(options.entityId)
    }
    if (options.action) {
      where.push("action = ?")
      params.push(options.action)
    }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : ""

    try {
      const rows = await prisma.$queryRawUnsafe<any[]>(
        `SELECT id, occurred_at, actor_user_id, actor_name, actor_role, action,
                event_class, entity_type, entity_id, entity_label, detail
           FROM payroll_audit_events
           ${clause}
          ORDER BY occurred_at DESC
          LIMIT ${limit}`,
        ...params,
      )
      return rows.map((r) => ({
        id: r.id,
        occurredAt: r.occurred_at,
        actorUserId: r.actor_user_id,
        actorName: r.actor_name,
        actorRole: r.actor_role,
        action: r.action,
        eventClass: r.event_class,
        entityType: r.entity_type,
        entityId: r.entity_id,
        entityLabel: r.entity_label,
        detail: r.detail,
      }))
    } catch (err) {
      // The table is created by a migration script rather than by Prisma, so a
      // database that has not had it applied yet must degrade to an empty
      // trail rather than a 500.
      console.error("[payroll-audit] failed to read events", err)
      return []
    }
  }
}
