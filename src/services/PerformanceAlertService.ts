import { randomUUID } from "crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../utils/database";

/**
 * Performance Alerts & Escalations.
 *
 * Backing table: `performance_alerts` (see scripts/run-performance-alerts-migration.ts).
 * Accessed through parameterised raw SQL rather than a Prisma delegate because the model is
 * added to prisma/schema.prisma separately (see design-refs-handoff/performance-alerts.md);
 * the SQL keeps working unchanged once that model lands.
 *
 * "Elapsed" is never stored. `elapsedMinutes` is derived from `raised_at` on every read so it
 * cannot go stale — a stored elapsed column would be wrong the moment it is written.
 */

/** Thrown for bad input / invalid state transitions — controller maps statusCode to the HTTP response. */
export class PerformanceAlertValidationError extends Error {
  statusCode = 400 as const;
  constructor(message: string) {
    super(message);
    this.name = "PerformanceAlertValidationError";
  }
}

/** Thrown when the alert id does not exist. */
export class PerformanceAlertNotFoundError extends Error {
  statusCode = 404 as const;
  constructor(message = "Alert not found") {
    super(message);
    this.name = "PerformanceAlertNotFoundError";
  }
}

const TABLE = "performance_alerts";
const REFERENCE_PREFIX = "ALT";

export const ALERT_SEVERITIES = ["info", "warning", "critical"] as const;
export const ALERT_STATUSES = ["open", "acknowledged", "escalated", "resolved"] as const;

export type PerformanceAlertSeverity = (typeof ALERT_SEVERITIES)[number];
export type PerformanceAlertStatus = (typeof ALERT_STATUSES)[number];

export interface PerformanceAlertListFilters {
  status?: string;
  severity?: string;
  ownerId?: string;
  departmentId?: string;
  /** Case-insensitive match against reference / title / source. */
  search?: string;
  limit?: number;
  offset?: number;
  /** The caller's reach (PerformanceScope): null = the whole register; otherwise alerts they own or raised, and their department's. */
  scope?: AlertScope | null;
}

export interface AlertScope {
  userId: string;
  departmentId: string | null;
}

/** SQL for an AlertScope, on the alerts table (optionally aliased). */
function scopeSql(scope: AlertScope | null | undefined, alias = ""): { sql: string; params: unknown[] } | null {
  if (!scope) return null;
  const c = (col: string) => `${alias ? alias + "." : ""}\`${col}\``;
  const parts = [`${c("owner_id")} = ?`, `${c("created_by_id")} = ?`];
  const params: unknown[] = [scope.userId, scope.userId];
  if (scope.departmentId) {
    parts.push(`${c("department_id")} = ?`);
    params.push(scope.departmentId);
  }
  return { sql: `(${parts.join(" OR ")})`, params };
}

export interface CreatePerformanceAlertInput {
  title: string;
  description?: string | null;
  source?: string | null;
  severity?: string | null;
  status?: string | null;
  ownerId?: string | null;
  departmentId?: string | null;
  escalationLevel?: number | null;
  raisedAt?: Date | null;
}

export interface UpdatePerformanceAlertInput {
  title?: string;
  description?: string | null;
  source?: string;
  severity?: string;
  status?: string;
  ownerId?: string | null;
  departmentId?: string | null;
  escalationLevel?: number;
  raisedAt?: Date;
}

export interface PerformanceAlertSummary {
  /** Unresolved alerts whose severity is `critical`. */
  critical: number;
  /** Alerts sitting in the `open` status. */
  open: number;
  /** Alerts sitting in the `escalated` status. */
  escalated: number;
  /** Total count per status across every alert (all four keys always present). */
  byStatus: Record<PerformanceAlertStatus, number>;
  /** Total count per severity across every alert (all three keys always present). */
  bySeverity: Record<PerformanceAlertSeverity, number>;
  /** Total alerts of any status. */
  total: number;
  slaBreaches: number;
}

interface AlertRow {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  source: string;
  severity: string;
  status: string;
  owner_id: string | null;
  department_id: string | null;
  escalation_level: number;
  raised_at: Date | string;
  acknowledged_at: Date | string | null;
  resolved_at: Date | string | null;
  rule_id: string | null;
  sla_due_at: Date | string | null;
  created_by_id: string;
  created_at: Date | string;
  updated_at: Date | string;
  owner_first_name: string | null;
  owner_last_name: string | null;
  owner_email: string | null;
  department_name: string | null;
  created_by_first_name: string | null;
  created_by_last_name: string | null;
}

export interface PerformanceAlert {
  id: string;
  reference: string;
  title: string;
  description: string | null;
  source: string;
  severity: string;
  status: string;
  ownerId: string | null;
  owner: { id: string; firstName: string; lastName: string; email: string | null; name: string } | null;
  departmentId: string | null;
  department: { id: string; name: string } | null;
  escalationLevel: number;
  raisedAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
  ruleId: string | null;
  slaDueAt: Date | null;
  slaBreached: boolean;
  createdById: string;
  createdBy: { id: string; firstName: string; lastName: string; name: string } | null;
  createdAt: Date;
  updatedAt: Date;
  /** Derived from raisedAt at read time — never persisted. */
  elapsedMinutes: number;
  /** Human-readable form of elapsedMinutes, e.g. "3h 12m". */
  elapsedLabel: string;
}

const SELECT_SQL = `
  SELECT
    a.\`id\`                AS id,
    a.\`reference\`         AS reference,
    a.\`title\`             AS title,
    a.\`description\`       AS description,
    a.\`source\`            AS source,
    a.\`severity\`          AS severity,
    a.\`status\`            AS status,
    a.\`owner_id\`          AS owner_id,
    a.\`department_id\`     AS department_id,
    a.\`escalation_level\`  AS escalation_level,
    a.\`raised_at\`         AS raised_at,
    a.\`acknowledged_at\`   AS acknowledged_at,
    a.\`resolved_at\`       AS resolved_at,
    a.\`rule_id\`           AS rule_id,
    a.\`sla_due_at\`        AS sla_due_at,
    a.\`created_by_id\`     AS created_by_id,
    a.\`created_at\`        AS created_at,
    a.\`updated_at\`        AS updated_at,
    o.\`firstName\`         AS owner_first_name,
    o.\`lastName\`          AS owner_last_name,
    o.\`email\`             AS owner_email,
    d.\`name\`              AS department_name,
    c.\`firstName\`         AS created_by_first_name,
    c.\`lastName\`          AS created_by_last_name
  FROM \`${TABLE}\` a
  LEFT JOIN \`users\` o ON o.\`id\` = a.\`owner_id\`
  LEFT JOIN \`departments\` d ON d.\`id\` = a.\`department_id\`
  LEFT JOIN \`users\` c ON c.\`id\` = a.\`created_by_id\`
`;

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function toNullableDate(value: Date | string | null): Date | null {
  if (value === null || value === undefined) return null;
  return toDate(value);
}

function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${mins}m`;
}

function mapRow(row: AlertRow, now: Date): PerformanceAlert {
  const raisedAt = toDate(row.raised_at);
  const elapsedMinutes = Math.max(0, Math.floor((now.getTime() - raisedAt.getTime()) / 60000));
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    description: row.description,
    source: row.source,
    severity: row.severity,
    status: row.status,
    ownerId: row.owner_id,
    owner: row.owner_id
      ? {
          id: row.owner_id,
          firstName: row.owner_first_name ?? "",
          lastName: row.owner_last_name ?? "",
          email: row.owner_email,
          name: `${row.owner_first_name ?? ""} ${row.owner_last_name ?? ""}`.trim(),
        }
      : null,
    departmentId: row.department_id,
    department: row.department_id ? { id: row.department_id, name: row.department_name ?? "" } : null,
    escalationLevel: Number(row.escalation_level ?? 0),
    raisedAt,
    acknowledgedAt: toNullableDate(row.acknowledged_at),
    resolvedAt: toNullableDate(row.resolved_at),
    ruleId: row.rule_id ?? null,
    slaDueAt: toNullableDate(row.sla_due_at ?? null),
    slaBreached: row.status !== "resolved" && !!row.sla_due_at && toDate(row.sla_due_at).getTime() < now.getTime(),
    createdById: row.created_by_id,
    createdBy: row.created_by_id
      ? {
          id: row.created_by_id,
          firstName: row.created_by_first_name ?? "",
          lastName: row.created_by_last_name ?? "",
          name: `${row.created_by_first_name ?? ""} ${row.created_by_last_name ?? ""}`.trim(),
        }
      : null,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    elapsedMinutes,
    elapsedLabel: formatElapsed(elapsedMinutes),
  };
}

function normaliseSeverity(value: unknown, field = "severity"): PerformanceAlertSeverity {
  const v = String(value ?? "").trim().toLowerCase();
  if (!ALERT_SEVERITIES.includes(v as PerformanceAlertSeverity)) {
    throw new PerformanceAlertValidationError(
      `Invalid ${field} "${String(value)}". Must be one of: ${ALERT_SEVERITIES.join(", ")}`
    );
  }
  return v as PerformanceAlertSeverity;
}

function normaliseStatus(value: unknown, field = "status"): PerformanceAlertStatus {
  const v = String(value ?? "").trim().toLowerCase();
  if (!ALERT_STATUSES.includes(v as PerformanceAlertStatus)) {
    throw new PerformanceAlertValidationError(
      `Invalid ${field} "${String(value)}". Must be one of: ${ALERT_STATUSES.join(", ")}`
    );
  }
  return v as PerformanceAlertStatus;
}

function normaliseEscalationLevel(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) {
    throw new PerformanceAlertValidationError("escalationLevel must be a non-negative integer");
  }
  return n;
}

function normaliseDate(value: unknown, field: string): Date {
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    throw new PerformanceAlertValidationError(`${field} is not a valid date`);
  }
  return d;
}

export default class PerformanceAlertService {
  /** Referential checks kept out of the DB error path so callers get a readable 400. */
  private static async assertUserExists(userId: string, field: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      throw new PerformanceAlertValidationError(`${field} does not reference an existing user`);
    }
  }

  private static async assertDepartmentExists(departmentId: string): Promise<void> {
    const dept = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
    if (!dept) {
      throw new PerformanceAlertValidationError("departmentId does not reference an existing department");
    }
  }

  /**
   * Next free `ALT-nnn`. Derived from the highest reference already on a row (not a counter table)
   * so a partially-seeded or manually-edited table can never hand out a duplicate.
   */
  private static async allocateReference(tx: Prisma.TransactionClient): Promise<string> {
    const rows = await tx.$queryRawUnsafe<Array<{ reference: string }>>(
      `SELECT \`reference\` FROM \`${TABLE}\` WHERE \`reference\` LIKE ?`,
      `${REFERENCE_PREFIX}-%`
    );
    let max = 0;
    for (const row of rows) {
      const m = /-(\d+)$/.exec(row.reference || "");
      if (m) max = Math.max(max, parseInt(m[1], 10));
    }
    return `${REFERENCE_PREFIX}-${String(max + 1).padStart(3, "0")}`;
  }

  /** List alerts, newest raised first. Filters are all optional and combine with AND. */
  static async listAlerts(filters: PerformanceAlertListFilters = {}): Promise<PerformanceAlert[]> {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filters.status) {
      where.push("a.`status` = ?");
      params.push(normaliseStatus(filters.status));
    }
    if (filters.severity) {
      where.push("a.`severity` = ?");
      params.push(normaliseSeverity(filters.severity));
    }
    if (filters.ownerId) {
      where.push("a.`owner_id` = ?");
      params.push(filters.ownerId);
    }
    if (filters.departmentId) {
      where.push("a.`department_id` = ?");
      params.push(filters.departmentId);
    }
    const sc = scopeSql(filters.scope, "a");
    if (sc) {
      where.push(sc.sql);
      params.push(...sc.params);
    }
    if (filters.search && filters.search.trim()) {
      const like = `%${filters.search.trim()}%`;
      where.push("(a.`reference` LIKE ? OR a.`title` LIKE ? OR a.`source` LIKE ?)");
      params.push(like, like, like);
    }

    // Bounded so an unpaged UI call can't pull the whole table.
    const limit = Math.min(Math.max(Number(filters.limit ?? 200) || 200, 1), 500);
    const offset = Math.max(Number(filters.offset ?? 0) || 0, 0);

    const sql =
      SELECT_SQL +
      (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
      " ORDER BY a.`raised_at` DESC, a.`created_at` DESC LIMIT ? OFFSET ?";

    const rows = await prisma.$queryRawUnsafe<AlertRow[]>(sql, ...params, limit, offset);
    const now = new Date();
    return rows.map((row) => mapRow(row, now));
  }

  static async getAlertById(id: string): Promise<PerformanceAlert> {
    const rows = await prisma.$queryRawUnsafe<AlertRow[]>(`${SELECT_SQL} WHERE a.\`id\` = ? LIMIT 1`, id);
    if (!rows.length) throw new PerformanceAlertNotFoundError();
    return mapRow(rows[0], new Date());
  }

  static async createAlert(input: CreatePerformanceAlertInput, createdById: string): Promise<PerformanceAlert> {
    const title = String(input.title ?? "").trim();
    if (!title) throw new PerformanceAlertValidationError("title is required");
    if (!createdById) throw new PerformanceAlertValidationError("createdById is required");

    const severity = input.severity ? normaliseSeverity(input.severity) : "warning";
    const status = input.status ? normaliseStatus(input.status) : "open";
    const source = String(input.source ?? "Manual").trim() || "Manual";
    const escalationLevel =
      input.escalationLevel === undefined || input.escalationLevel === null
        ? 0
        : normaliseEscalationLevel(input.escalationLevel);
    const raisedAt = input.raisedAt ? normaliseDate(input.raisedAt, "raisedAt") : new Date();

    if (input.ownerId) await this.assertUserExists(input.ownerId, "ownerId");
    if (input.departmentId) await this.assertDepartmentExists(input.departmentId);
    await this.assertUserExists(createdById, "createdById");

    const id = randomUUID();
    const now = new Date();

    // Reference allocation races another concurrent create only on the unique index; retry a few
    // times rather than surfacing a raw ER_DUP_ENTRY.
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await prisma.$transaction(async (tx) => {
          const reference = await PerformanceAlertService.allocateReference(tx);
          await tx.$executeRawUnsafe(
            `INSERT INTO \`${TABLE}\` (
              \`id\`, \`reference\`, \`title\`, \`description\`, \`source\`, \`severity\`, \`status\`,
              \`owner_id\`, \`department_id\`, \`escalation_level\`, \`raised_at\`,
              \`acknowledged_at\`, \`resolved_at\`, \`created_by_id\`, \`created_at\`, \`updated_at\`
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            id,
            reference,
            title,
            input.description ?? null,
            source,
            severity,
            status,
            input.ownerId ?? null,
            input.departmentId ?? null,
            escalationLevel,
            raisedAt,
            status === "acknowledged" ? now : null,
            status === "resolved" ? now : null,
            createdById,
            now,
            now
          );
        });
        return await this.getAlertById(id);
      } catch (e: unknown) {
        lastError = e;
        const message = e instanceof Error ? e.message : String(e);
        if (!/duplicate|ER_DUP_ENTRY|Unique constraint/i.test(message)) throw e;
      }
    }
    throw lastError instanceof Error
      ? lastError
      : new Error("Failed to allocate a unique alert reference after 5 attempts");
  }

  /** Partial update. Only the keys present on `input` are written. */
  static async updateAlert(id: string, input: UpdatePerformanceAlertInput): Promise<PerformanceAlert> {
    const existing = await this.getAlertById(id); // throws 404 when missing

    const sets: string[] = [];
    const params: unknown[] = [];

    if (input.title !== undefined) {
      const title = String(input.title).trim();
      if (!title) throw new PerformanceAlertValidationError("title cannot be empty");
      sets.push("`title` = ?");
      params.push(title);
    }
    if (input.description !== undefined) {
      sets.push("`description` = ?");
      params.push(input.description ?? null);
    }
    if (input.source !== undefined) {
      const source = String(input.source).trim();
      if (!source) throw new PerformanceAlertValidationError("source cannot be empty");
      sets.push("`source` = ?");
      params.push(source);
    }
    if (input.severity !== undefined) {
      sets.push("`severity` = ?");
      params.push(normaliseSeverity(input.severity));
    }
    if (input.escalationLevel !== undefined) {
      sets.push("`escalation_level` = ?");
      params.push(normaliseEscalationLevel(input.escalationLevel));
    }
    if (input.raisedAt !== undefined) {
      sets.push("`raised_at` = ?");
      params.push(normaliseDate(input.raisedAt, "raisedAt"));
    }
    if (input.ownerId !== undefined) {
      if (input.ownerId) await this.assertUserExists(input.ownerId, "ownerId");
      sets.push("`owner_id` = ?");
      params.push(input.ownerId ?? null);
    }
    if (input.departmentId !== undefined) {
      if (input.departmentId) await this.assertDepartmentExists(input.departmentId);
      sets.push("`department_id` = ?");
      params.push(input.departmentId ?? null);
    }
    if (input.status !== undefined) {
      const status = normaliseStatus(input.status);
      sets.push("`status` = ?");
      params.push(status);
      // Keep the timestamps consistent with whatever status the caller lands on.
      if (status === "resolved") {
        sets.push("`resolved_at` = ?");
        params.push(existing.resolvedAt ?? new Date());
      } else {
        sets.push("`resolved_at` = NULL");
      }
      if (status === "open") {
        sets.push("`acknowledged_at` = NULL");
      } else if (!existing.acknowledgedAt) {
        sets.push("`acknowledged_at` = ?");
        params.push(new Date());
      }
    }

    if (!sets.length) return existing;

    sets.push("`updated_at` = ?");
    params.push(new Date());

    await prisma.$executeRawUnsafe(
      `UPDATE \`${TABLE}\` SET ${sets.join(", ")} WHERE \`id\` = ?`,
      ...params,
      id
    );
    return this.getAlertById(id);
  }

  /**
   * Move an alert to `acknowledged`. Resolved alerts cannot be acknowledged.
   * `userId` is the actor: when the alert is unowned they are stamped as owner so the board
   * shows who picked it up (an owner that is already set is never overwritten).
   */
  static async acknowledge(id: string, userId: string): Promise<PerformanceAlert> {
    const existing = await this.getAlertById(id);
    if (existing.status === "resolved") {
      throw new PerformanceAlertValidationError("Cannot acknowledge an alert that is already resolved");
    }
    const now = new Date();
    await prisma.$executeRawUnsafe(
      `UPDATE \`${TABLE}\`
       SET \`status\` = 'acknowledged',
           \`acknowledged_at\` = COALESCE(\`acknowledged_at\`, ?),
           \`owner_id\` = COALESCE(\`owner_id\`, ?),
           \`updated_at\` = ?
       WHERE \`id\` = ?`,
      now,
      userId || null,
      now,
      id
    );
    return this.getAlertById(id);
  }

  /** Bump escalationLevel by one and move the alert to `escalated`. Resolved alerts cannot escalate. */
  static async escalate(id: string): Promise<PerformanceAlert> {
    const existing = await this.getAlertById(id);
    if (existing.status === "resolved") {
      throw new PerformanceAlertValidationError("Cannot escalate an alert that is already resolved");
    }
    const now = new Date();
    await prisma.$executeRawUnsafe(
      `UPDATE \`${TABLE}\`
       SET \`status\` = 'escalated',
           \`escalation_level\` = \`escalation_level\` + 1,
           \`acknowledged_at\` = COALESCE(\`acknowledged_at\`, ?),
           \`updated_at\` = ?
       WHERE \`id\` = ?`,
      now,
      now,
      id
    );
    return this.getAlertById(id);
  }

  /**
   * Move an alert to `resolved`. Idempotent — re-resolving keeps the original resolvedAt.
   * `userId` is the actor; as with acknowledge it fills an empty owner and never overwrites one.
   */
  static async resolve(id: string, userId: string): Promise<PerformanceAlert> {
    await this.getAlertById(id); // throws 404 when missing
    const now = new Date();
    await prisma.$executeRawUnsafe(
      `UPDATE \`${TABLE}\`
       SET \`status\` = 'resolved',
           \`resolved_at\` = COALESCE(\`resolved_at\`, ?),
           \`acknowledged_at\` = COALESCE(\`acknowledged_at\`, ?),
           \`owner_id\` = COALESCE(\`owner_id\`, ?),
           \`updated_at\` = ?
       WHERE \`id\` = ?`,
      now,
      now,
      userId || null,
      now,
      id
    );
    return this.getAlertById(id);
  }

  static async deleteAlert(id: string): Promise<{ id: string }> {
    await this.getAlertById(id); // throws 404 when missing
    await prisma.$executeRawUnsafe(`DELETE FROM \`${TABLE}\` WHERE \`id\` = ?`, id);
    return { id };
  }

  /**
   * Board KPI counts.
   * `critical` counts UNRESOLVED critical alerts (a resolved critical is not an outstanding one);
   * `open` and `escalated` are the counts of those two statuses. `byStatus` / `bySeverity` are
   * totals across every alert regardless of status, with all keys present (zero-filled).
   */
  static async summary(scope: AlertScope | null = null): Promise<PerformanceAlertSummary> {
    const sc = scopeSql(scope);
    const w = sc ? ` WHERE ${sc.sql}` : "";
    const and = sc ? ` AND ${sc.sql}` : "";
    const p = sc ? sc.params : [];
    const [statusRows, severityRows, criticalRows] = await Promise.all([
      prisma.$queryRawUnsafe<Array<{ status: string; c: bigint }>>(
        `SELECT \`status\` AS status, COUNT(*) AS c FROM \`${TABLE}\`${w} GROUP BY \`status\``, ...p
      ),
      prisma.$queryRawUnsafe<Array<{ severity: string; c: bigint }>>(
        `SELECT \`severity\` AS severity, COUNT(*) AS c FROM \`${TABLE}\`${w} GROUP BY \`severity\``, ...p
      ),
      prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
        `SELECT COUNT(*) AS c FROM \`${TABLE}\` WHERE \`severity\` = 'critical' AND \`status\` <> 'resolved'${and}`, ...p
      ),
    ]);

    const byStatus = { open: 0, acknowledged: 0, escalated: 0, resolved: 0 } as Record<
      PerformanceAlertStatus,
      number
    >;
    let total = 0;
    for (const row of statusRows) {
      const count = Number(row.c ?? 0);
      total += count;
      if ((ALERT_STATUSES as readonly string[]).includes(row.status)) {
        byStatus[row.status as PerformanceAlertStatus] = count;
      }
    }

    const bySeverity = { info: 0, warning: 0, critical: 0 } as Record<PerformanceAlertSeverity, number>;
    for (const row of severityRows) {
      if ((ALERT_SEVERITIES as readonly string[]).includes(row.severity)) {
        bySeverity[row.severity as PerformanceAlertSeverity] = Number(row.c ?? 0);
      }
    }

    const sla = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(`SELECT COUNT(*) AS c FROM \`${TABLE}\` WHERE \`status\` <> 'resolved' AND \`sla_due_at\` IS NOT NULL AND \`sla_due_at\` < ?${and}`, new Date(), ...p);
    return {
      slaBreaches: Number(sla[0]?.c ?? 0),
      critical: Number(criticalRows[0]?.c ?? 0),
      open: byStatus.open,
      escalated: byStatus.escalated,
      byStatus,
      bySeverity,
      total,
    };
  }
}
