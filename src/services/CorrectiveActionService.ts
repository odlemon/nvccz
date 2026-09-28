import { prisma } from "../utils/database";
import { nextReference as nextReferenceNumber } from "./PerformanceNumbering";

/** Thrown for bad input / unknown ids — controller maps statusCode to the HTTP response. */
class CorrectiveActionValidationError extends Error {
  statusCode = 400 as const;
  constructor(message: string) {
    super(message);
    this.name = "CorrectiveActionValidationError";
  }
}

/** Thrown when the requested corrective action does not exist. */
class CorrectiveActionNotFoundError extends Error {
  statusCode = 404 as const;
  constructor(message = "Corrective action not found") {
    super(message);
    this.name = "CorrectiveActionNotFoundError";
  }
}

export const CORRECTIVE_ACTION_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export const CORRECTIVE_ACTION_STATUSES = ["open", "in_progress", "blocked", "closed"] as const;

export type CorrectiveActionSeverity = (typeof CORRECTIVE_ACTION_SEVERITIES)[number];
export type CorrectiveActionStatus = (typeof CORRECTIVE_ACTION_STATUSES)[number];

const CLOSED_STATUS: CorrectiveActionStatus = "closed";
const REFERENCE_PREFIX = "CA-";
const REFERENCE_PAD = 3;
/** Retries around the `reference` unique index when two creates race for the same number. */
const REFERENCE_MAX_ATTEMPTS = 5;

const OWNER_SELECT = { id: true, firstName: true, lastName: true, email: true } as const;
const DEPARTMENT_SELECT = { id: true, name: true } as const;

const DEFAULT_INCLUDE = {
  owner: { select: OWNER_SELECT },
  department: { select: DEPARTMENT_SELECT },
  createdBy: { select: OWNER_SELECT },
} as const;

/**
 * The `PerformanceCorrectiveAction` model is in `prisma/schema.prisma` and the client has been
 * regenerated, so this is the generated delegate - no cast. Named here so the include shape
 * below is written once rather than repeated in every method.
 */
const correctiveActions = () => prisma.performanceCorrectiveAction;

export interface CorrectiveActionListFilters {
  status?: string;
  severity?: string;
  ownerId?: string;
  departmentId?: string;
}

export interface CorrectiveActionCreateInput {
  reference?: string | null;
  title: string;
  description?: string | null;
  trigger?: string | null;
  ownerId?: string | null;
  departmentId?: string | null;
  severity?: string | null;
  status?: string | null;
  progress?: number | null;
  targetDate?: Date | null;
  sourceType?: string | null;
  sourceId?: string | null;
  createdById: string;
}

export interface CorrectiveActionUpdateInput {
  title?: string;
  description?: string | null;
  trigger?: string | null;
  ownerId?: string | null;
  departmentId?: string | null;
  severity?: string;
  status?: string;
  progress?: number | null;
  targetDate?: Date | null;
  rootCause?: string | null;
  resolutionNotes?: string | null;
  /** Why the status or progress changed; stored on the history event. */
  note?: string | null;
}

/** Allowed status moves. Closing needs a root cause and resolution; reopening and blocking need a note. */
export const CORRECTIVE_ACTION_TRANSITIONS: Record<CorrectiveActionStatus, CorrectiveActionStatus[]> = {
  open: ["in_progress", "blocked", "closed"],
  in_progress: ["blocked", "closed", "open"],
  blocked: ["in_progress", "open", "closed"],
  closed: ["open"],
};

export interface CorrectiveActionSummary {
  /** Every action not yet closed (open + in_progress + blocked). Per-status counts are in `byStatus`. */
  open: number;
  /** Not closed AND targetDate is in the past. */
  overdue: number;
  byStatus: Record<CorrectiveActionStatus, number>;
  bySeverity: Record<CorrectiveActionSeverity, number>;
}

function normalizeSeverity(value: unknown, field = "severity"): CorrectiveActionSeverity {
  const severity = String(value ?? "").trim().toLowerCase();
  if (!CORRECTIVE_ACTION_SEVERITIES.includes(severity as CorrectiveActionSeverity)) {
    throw new CorrectiveActionValidationError(
      `Invalid ${field} "${value}". Must be one of: ${CORRECTIVE_ACTION_SEVERITIES.join(", ")}`
    );
  }
  return severity as CorrectiveActionSeverity;
}

function normalizeStatus(value: unknown, field = "status"): CorrectiveActionStatus {
  const status = String(value ?? "").trim().toLowerCase();
  if (!CORRECTIVE_ACTION_STATUSES.includes(status as CorrectiveActionStatus)) {
    throw new CorrectiveActionValidationError(
      `Invalid ${field} "${value}". Must be one of: ${CORRECTIVE_ACTION_STATUSES.join(", ")}`
    );
  }
  return status as CorrectiveActionStatus;
}

/** `null` is a meaningful value here — it means "progress not reported". */
function normalizeProgress(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const progress = Number(value);
  if (!Number.isFinite(progress)) {
    throw new CorrectiveActionValidationError("progress must be a number between 0 and 100");
  }
  const rounded = Math.round(progress);
  if (rounded < 0 || rounded > 100) {
    throw new CorrectiveActionValidationError("progress must be between 0 and 100");
  }
  return rounded;
}

function normalizeDate(value: unknown, field: string): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) {
    throw new CorrectiveActionValidationError(`${field} is not a valid date`);
  }
  return date;
}

function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

export default class CorrectiveActionService {
  /**
   * Register list, newest first. Every filter is optional; unknown filter values are rejected
   * rather than silently returning everything.
   */
  static async list(filters: CorrectiveActionListFilters = {}, scope: any = {}) {
    const where: Record<string, unknown> = { ...scope };

    if (filters.status !== undefined && filters.status !== "") {
      where.status = normalizeStatus(filters.status);
    }
    if (filters.severity !== undefined && filters.severity !== "") {
      where.severity = normalizeSeverity(filters.severity);
    }
    if (filters.ownerId !== undefined && filters.ownerId !== "") {
      where.ownerId = String(filters.ownerId);
    }
    if (filters.departmentId !== undefined && filters.departmentId !== "") {
      where.departmentId = String(filters.departmentId);
    }

    const rows = await correctiveActions().findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      include: DEFAULT_INCLUDE,
    });

    const now = new Date();
    return rows.map((row: any) => ({
      ...row,
      isOverdue: CorrectiveActionService.isOverdue(row, now),
    }));
  }

  static async getById(id: string) {
    const row = await correctiveActions().findUnique({
      where: { id },
      include: DEFAULT_INCLUDE,
    });
    if (!row) throw new CorrectiveActionNotFoundError();
    return { ...row, isOverdue: CorrectiveActionService.isOverdue(row, new Date()) };
  }

  static async create(input: CorrectiveActionCreateInput) {
    const title = String(input.title ?? "").trim();
    if (!title) throw new CorrectiveActionValidationError("title is required");
    if (!input.createdById) throw new CorrectiveActionValidationError("createdById is required");

    const severity = input.severity ? normalizeSeverity(input.severity) : "medium";
    const status = input.status ? normalizeStatus(input.status) : "open";
    const progress = normalizeProgress(input.progress);
    const targetDate = normalizeDate(input.targetDate, "targetDate");

    const ownerId = normalizeText(input.ownerId);
    if (ownerId) await CorrectiveActionService.assertUserExists(ownerId, "ownerId");

    const departmentId = normalizeText(input.departmentId);
    if (departmentId) await CorrectiveActionService.assertDepartmentExists(departmentId);

    const explicitReference = normalizeText(input.reference);
    if (explicitReference) {
      const clash = await correctiveActions().findUnique({ where: { reference: explicitReference } });
      if (clash) {
        throw new CorrectiveActionValidationError(`reference "${explicitReference}" is already in use`);
      }
    }

    const data = {
      title,
      description: normalizeText(input.description),
      trigger: normalizeText(input.trigger),
      ownerId,
      departmentId,
      severity,
      status,
      progress,
      targetDate,
      closedAt: status === CLOSED_STATUS ? new Date() : null,
      sourceType: normalizeText(input.sourceType),
      sourceId: normalizeText(input.sourceId),
      createdById: input.createdById,
    };

    if (explicitReference) {
      const created = await correctiveActions().create({
        data: { ...data, reference: explicitReference },
        include: DEFAULT_INCLUDE,
      });
      await CorrectiveActionService.recordEvent(created.id, "created", null, status, progress, null, input.createdById);
      return created;
    }

    // Auto-numbered CA-001, CA-002, ... Retry on the unique index if a concurrent create wins.
    let lastError: unknown = null;
    for (let attempt = 0; attempt < REFERENCE_MAX_ATTEMPTS; attempt += 1) {
      const reference = await CorrectiveActionService.nextReference();
      try {
        const created = await correctiveActions().create({
          data: { ...data, reference },
          include: DEFAULT_INCLUDE,
        });
        await CorrectiveActionService.recordEvent(created.id, "created", null, status, progress, null, input.createdById);
        return created;
      } catch (error: any) {
        if (error?.code !== "P2002") throw error;
        lastError = error;
      }
    }
    throw new CorrectiveActionValidationError(
      `Could not allocate a unique reference after ${REFERENCE_MAX_ATTEMPTS} attempts` +
        (lastError ? " (reference collision)" : "")
    );
  }

  /**
   * Partial update. `closedAt` is derived from `status`, never taken from the request: moving to
   * `closed` stamps it, moving away from `closed` clears it.
   */
  static async update(id: string, patch: CorrectiveActionUpdateInput, actorId?: string | null) {
    const existing = await correctiveActions().findUnique({ where: { id } });
    if (!existing) throw new CorrectiveActionNotFoundError();

    const data: Record<string, unknown> = {};

    if (patch.title !== undefined) {
      const title = String(patch.title).trim();
      if (!title) throw new CorrectiveActionValidationError("title cannot be empty");
      data.title = title;
    }
    if (patch.description !== undefined) data.description = normalizeText(patch.description);
    if (patch.trigger !== undefined) data.trigger = normalizeText(patch.trigger);

    if (patch.ownerId !== undefined) {
      const ownerId = normalizeText(patch.ownerId);
      if (ownerId) await CorrectiveActionService.assertUserExists(ownerId, "ownerId");
      data.ownerId = ownerId;
    }
    if (patch.departmentId !== undefined) {
      const departmentId = normalizeText(patch.departmentId);
      if (departmentId) await CorrectiveActionService.assertDepartmentExists(departmentId);
      data.departmentId = departmentId;
    }

    if (patch.severity !== undefined) data.severity = normalizeSeverity(patch.severity);
    if (patch.progress !== undefined) {
      if (existing.status === CLOSED_STATUS && patch.status === undefined) {
        throw new CorrectiveActionValidationError("A closed action cannot be updated. Reopen it first.");
      }
      data.progress = normalizeProgress(patch.progress);
    }
    if (patch.rootCause !== undefined) data.rootCause = normalizeText(patch.rootCause);
    if (patch.resolutionNotes !== undefined) data.resolutionNotes = normalizeText(patch.resolutionNotes);
    const note = normalizeText(patch.note);
    if (patch.targetDate !== undefined) data.targetDate = normalizeDate(patch.targetDate, "targetDate");

    if (patch.status !== undefined) {
      const status = normalizeStatus(patch.status);
      if (status !== existing.status) {
        const allowed = CORRECTIVE_ACTION_TRANSITIONS[existing.status as CorrectiveActionStatus] || [];
        if (!allowed.includes(status)) {
          throw new CorrectiveActionValidationError(`An action that is ${existing.status.replace("_", " ")} cannot move to ${status.replace("_", " ")}.`);
        }
        if (status === CLOSED_STATUS) {
          const rc = data.rootCause !== undefined ? data.rootCause : existing.rootCause;
          const rn = data.resolutionNotes !== undefined ? data.resolutionNotes : existing.resolutionNotes;
          if (!rc) throw new CorrectiveActionValidationError("Record the root cause before closing the action.");
          if (!rn) throw new CorrectiveActionValidationError("Record how it was resolved before closing the action.");
          data.progress = 100;
        }
        if (existing.status === CLOSED_STATUS && !note) throw new CorrectiveActionValidationError("Say why the action is being reopened.");
        if (status === "blocked" && !note) throw new CorrectiveActionValidationError("Say what is blocking the action.");
      }
      data.status = status;
      if (status === CLOSED_STATUS) {
        data.closedAt = existing.closedAt ?? new Date();
      } else {
        data.closedAt = null;
      }
    }

    if (Object.keys(data).length === 0) {
      return CorrectiveActionService.getById(id);
    }

    const updated = await correctiveActions().update({ where: { id }, data, include: DEFAULT_INCLUDE });
    const statusChanged = data.status !== undefined && data.status !== existing.status;
    const progressChanged = data.progress !== undefined && data.progress !== existing.progress;
    if (statusChanged || progressChanged || note) {
      await CorrectiveActionService.recordEvent(
        id,
        statusChanged ? (existing.status === CLOSED_STATUS ? "reopened" : data.status === CLOSED_STATUS ? "closed" : "status") : progressChanged ? "progress" : "note",
        existing.status,
        (data.status as string) ?? existing.status,
        (data.progress as number | null | undefined) !== undefined ? (data.progress as number | null) : existing.progress,
        note,
        actorId ?? null
      );
    }
    return updated;
  }

  static async recordEvent(actionId: string, eventType: string, fromStatus: string | null, toStatus: string | null, progress: number | null, note: string | null, actorId: string | null) {
    await prisma.performanceCorrectiveActionEvent.create({ data: { actionId, eventType, fromStatus, toStatus, progress, note, actorId } });
  }

  /** History of one action, newest first, with the actor named. */
  static async events(actionId: string) {
    const rows = await prisma.performanceCorrectiveActionEvent.findMany({ where: { actionId }, orderBy: { createdAt: "desc" } });
    const ids = [...new Set(rows.map((r) => r.actorId).filter(Boolean))] as string[];
    const users = ids.length ? await prisma.user.findMany({ where: { id: { in: ids } }, select: OWNER_SELECT }) : [];
    const name = new Map(users.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email]));
    return rows.map((r) => ({ ...r, actorName: r.actorId ? name.get(r.actorId) ?? null : null }));
  }

  /** Portfolio history since a date (recovery trend): every event, oldest first. */
  static async portfolioEvents(since: Date, scope: any = {}) {
    const actionFilter = scope && scope.OR ? { actionId: { in: (await correctiveActions().findMany({ where: scope, select: { id: true } })).map((r: any) => r.id) } } : {};
    return prisma.performanceCorrectiveActionEvent.findMany({ where: { createdAt: { gte: since }, ...actionFilter }, orderBy: { createdAt: "asc" }, select: { actionId: true, eventType: true, fromStatus: true, toStatus: true, progress: true, createdAt: true } });
  }

  static async remove(id: string) {
    const existing = await correctiveActions().findUnique({ where: { id } });
    if (!existing) throw new CorrectiveActionNotFoundError();
    await prisma.performanceCorrectiveActionEvent.deleteMany({ where: { actionId: id } });
    await correctiveActions().delete({ where: { id } });
    return { id };
  }

  /**
   * Register-wide counters for the Performance dashboard tiles.
   * `open` counts everything not yet closed; `overdue` is not-closed with a past `targetDate`.
   */
  static async summary(scope: any = {}): Promise<CorrectiveActionSummary> {
    const now = new Date();

    const [statusGroups, severityGroups, overdue] = await Promise.all([
      correctiveActions().groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
      correctiveActions().groupBy({ by: ["severity"], where: scope, _count: { _all: true } }),
      correctiveActions().count({
        where: { ...scope, status: { not: CLOSED_STATUS }, targetDate: { lt: now } },
      }),
    ]);

    const byStatus = Object.fromEntries(
      CORRECTIVE_ACTION_STATUSES.map((s) => [s, 0])
    ) as Record<CorrectiveActionStatus, number>;
    for (const group of statusGroups as Array<{ status: string; _count: { _all: number } }>) {
      if (group.status in byStatus) {
        byStatus[group.status as CorrectiveActionStatus] = Number(group._count?._all ?? 0);
      }
    }

    const bySeverity = Object.fromEntries(
      CORRECTIVE_ACTION_SEVERITIES.map((s) => [s, 0])
    ) as Record<CorrectiveActionSeverity, number>;
    for (const group of severityGroups as Array<{ severity: string; _count: { _all: number } }>) {
      if (group.severity in bySeverity) {
        bySeverity[group.severity as CorrectiveActionSeverity] = Number(group._count?._all ?? 0);
      }
    }

    const open = CORRECTIVE_ACTION_STATUSES.filter((s) => s !== CLOSED_STATUS).reduce(
      (total, s) => total + byStatus[s],
      0
    );

    return { open, overdue: Number(overdue ?? 0), byStatus, bySeverity };
  }

  private static isOverdue(row: { status?: string; targetDate?: Date | null }, now: Date): boolean {
    if (!row?.targetDate) return false;
    if (row.status === CLOSED_STATUS) return false;
    return new Date(row.targetDate).getTime() < now.getTime();
  }

  /** Highest existing number + 1 for the configured prefix and width (settings key workflow.numbering). */
  private static async nextReference(): Promise<string> {
    const rows = await correctiveActions().findMany({ select: { reference: true } });
    return nextReferenceNumber("corrective", (rows as Array<{ reference: string }>).map((r) => r.reference));
  }

  private static async assertUserExists(userId: string, field: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) {
      throw new CorrectiveActionValidationError(`${field} does not reference an existing user`);
    }
  }

  private static async assertDepartmentExists(departmentId: string): Promise<void> {
    const department = await prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    });
    if (!department) {
      throw new CorrectiveActionValidationError("departmentId does not reference an existing department");
    }
  }
}

export { CorrectiveActionValidationError, CorrectiveActionNotFoundError };
