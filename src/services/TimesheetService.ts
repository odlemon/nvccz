// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { parseDate } from "../utils/dateHelper";
import { userHasEffectivePermission } from "../config/cfoModulePermissions";
import { perfScopeOf } from "./PerformanceScope";

/**
 * The week-ending and entry dates are DATE columns. parseDate() anchors a date-only string at noon UTC, and a
 * DATE column never equals a noon timestamp, so lookups by that value missed the row that had just been saved
 * (a second entry in a week hit the unique index instead of updating). Dates are compared at UTC midnight.
 */
function asDateOnly(input: string | Date): Date {
  const d = new Date(parseDate(input));
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export type UpsertEntryInput = {
  projectId: string;
  date: string | Date;
  hours: number | string;
  billable?: boolean;
  notes?: string | null;
  taskId?: string | null;
};

const EDITABLE_STATUSES = ["DRAFT", "RETURNED"];

export class TimesheetService {
  /** Plain lookup by id (with entries), used by the controller for ownership checks before submit. */
  static async getTimesheetById(id: string) {
    return prisma.timesheet.findUnique({
      where: { id },
      include: { entries: { include: { project: true }, orderBy: { date: "asc" } } },
    });
  }

  /** Fetch the user's timesheet for a given week-ending date, creating a DRAFT one if absent. */
  static async getOrCreateTimesheet(userId: string, weekEnding: string | Date) {
    const weekEndingDate = asDateOnly(weekEnding);
    return prisma.timesheet.upsert({
      where: { userId_weekEnding: { userId, weekEnding: weekEndingDate } },
      update: {},
      create: { userId, weekEnding: weekEndingDate },
      include: {
        entries: { include: { project: true }, orderBy: { date: "asc" } },
      },
    });
  }

  static async listTimesheetsForUser(userId: string) {
    return prisma.timesheet.findMany({
      where: { userId },
      orderBy: { weekEnding: "desc" },
      include: {
        entries: { include: { project: true }, orderBy: { date: "asc" } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
  }

  /** Timesheets awaiting a manager decision (SUBMITTED). */
  /**
   * Who may approve or return someone's timesheet: someone in the same department (the approval guard already required
   * accounting.timesheets.manage), or an organisation-wide approver — the
   * Performance organisation scope. Never one's own. Without this a manager could approve another department's week by id.
   */
  static async approverReach(approverId: string): Promise<{ all: boolean; departments: string[]; departmentId: string | null }> {
    const u: any = await prisma.user.findUnique({ where: { id: approverId }, include: { role: true, department: { select: { name: true } } } });
    if (!u) return { all: false, departments: [], departmentId: null };
    if (perfScopeOf(u) === "organization") return { all: true, departments: [], departmentId: null };
    const names = [u.userDepartment, u.department?.name].filter(Boolean).map((x: string) => String(x));
    return { all: false, departments: [...new Set(names)], departmentId: u.departmentId || null };
  }

  private static async assertApproverReach(timesheet: any, approverId: string) {
    const reach = await TimesheetService.approverReach(approverId);
    if (reach.all) return;
    const owner: any = await prisma.user.findUnique({ where: { id: timesheet.userId }, select: { userDepartment: true, departmentId: true } });
    const same = (!!reach.departmentId && owner?.departmentId === reach.departmentId) || (!!owner?.userDepartment && reach.departments.includes(owner.userDepartment));
    if (!same) throw Object.assign(new Error("You can only approve timesheets from your own department"), { statusCode: 403 });
  }

  static async listPendingApproval(approverId?: string) {
    const reach = approverId ? await TimesheetService.approverReach(approverId) : { all: true, departments: [], departmentId: null };
    const scope = reach.all ? {} : { user: { OR: [...(reach.departmentId ? [{ departmentId: reach.departmentId }] : []), ...(reach.departments.length ? [{ userDepartment: { in: reach.departments } }] : []), { id: "__none__" }] } };
    return prisma.timesheet.findMany({
      where: { status: "SUBMITTED", ...scope, ...(approverId ? { userId: { not: approverId } } : {}) },
      orderBy: { submittedAt: "asc" },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        entries: { include: { project: true }, orderBy: { date: "asc" } },
      },
    });
  }

  /**
   * A manager's team, every status, not just SUBMITTED.
   *
   * `listPendingApproval()` only ever showed items awaiting a decision — a manager could
   * approve a pending timesheet but had no way to see a report's DRAFT, APPROVED or RETURNED
   * weeks, despite the UI having a full approval-workflow panel. Scoped by department because
   * `Timesheet` carries no manager/report-line relation; `User.userDepartment` is the only
   * grouping that exists today. A manager with no department set (some exec roles) sees the
   * organisation-wide list, since the guard on this route is already an org-level "manage"
   * permission, not a department-scoped one.
   */
  static async listForManager(managerUserId: string) {
    // the same reach as approving: the whole organisation for an organisation-wide approver, otherwise one's department
    const reach = await TimesheetService.approverReach(managerUserId);
    const where = reach.all ? {} : { user: { OR: [...(reach.departmentId ? [{ departmentId: reach.departmentId }] : []), ...(reach.departments.length ? [{ userDepartment: { in: reach.departments } }] : []), { id: managerUserId }] } };

    return prisma.timesheet.findMany({
      where,
      orderBy: [{ weekEnding: "desc" }, { user: { firstName: "asc" } }],
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true, userDepartment: true } },
        approvedBy: { select: { id: true, firstName: true, lastName: true } },
        entries: { include: { project: true }, orderBy: { date: "asc" } },
      },
    });
  }

  /**
   * Create or update the entry for (timesheet, project, date). No DB-level unique constraint
   * backs this triple (not part of the sketched schema), so this does an application-level
   * find-then-write rather than a single atomic `upsert()`.
   */
  static async upsertEntry(timesheetId: string, input: UpsertEntryInput) {
    const timesheet = await prisma.timesheet.findUnique({ where: { id: timesheetId } });
    if (!timesheet) {
      throw new Error("Timesheet not found");
    }
    if (!EDITABLE_STATUSES.includes(timesheet.status)) {
      throw new Error(`Cannot edit entries on a ${timesheet.status} timesheet`);
    }
    if (!input.projectId) {
      throw new Error("projectId is required");
    }
    const project = await prisma.project.findUnique({ where: { id: input.projectId } });
    if (!project) {
      throw new Error("Project not found");
    }

    const hoursDec = new Decimal(input.hours);
    if (hoursDec.lessThanOrEqualTo(0) || hoursDec.greaterThan(24)) {
      throw new Error("hours must be greater than 0 and no more than 24");
    }
    const entryDate = asDateOnly(input.date);

    const existing = await prisma.timesheetEntry.findFirst({
      where: { timesheetId, projectId: input.projectId, date: entryDate, taskId: input.taskId ?? null },
    });

    // One day cannot hold more than 24 hours across all lines.
    const sameDay = await prisma.timesheetEntry.findMany({ where: { timesheetId, date: entryDate }, select: { id: true, hours: true } });
    const others = sameDay.filter((e) => !existing || e.id !== existing.id).reduce((a, e) => a + Number(e.hours), 0);
    if (others + Number(hoursDec) > 24) throw new Error(`That day would total ${others + Number(hoursDec)} hours. A day holds at most 24.`);

    if (existing) {
      return prisma.timesheetEntry.update({
        where: { id: existing.id },
        data: {
          hours: hoursDec,
          billable: input.billable ?? existing.billable,
          notes: input.notes !== undefined ? input.notes : existing.notes,
          taskId: input.taskId !== undefined ? input.taskId : existing.taskId,
        },
        include: { project: true },
      });
    }

    return prisma.timesheetEntry.create({
      data: {
        timesheetId,
        projectId: input.projectId,
        date: entryDate,
        hours: hoursDec,
        billable: input.billable ?? false,
        notes: input.notes ?? null,
        taskId: input.taskId ?? null,
      },
      include: { project: true },
    });
  }

  /** Remove one line from a week that is still editable. */
  static async deleteEntry(entryId: string, userId: string) {
    const entry = await prisma.timesheetEntry.findUnique({ where: { id: entryId }, include: { timesheet: true } });
    if (!entry) throw new Error("Entry not found");
    if (entry.timesheet.userId !== userId) throw new Error("You can only change your own timesheet");
    if (!EDITABLE_STATUSES.includes(entry.timesheet.status)) throw new Error(`Cannot edit entries on a ${entry.timesheet.status} timesheet`);
    await prisma.timesheetEntry.delete({ where: { id: entryId } });
    return { id: entryId };
  }

  /** DRAFT|RETURNED -> SUBMITTED. */
  static async submitTimesheet(timesheetId: string) {
    const timesheet = await prisma.timesheet.findUnique({
      where: { id: timesheetId },
      include: { entries: true },
    });
    if (!timesheet) {
      throw new Error("Timesheet not found");
    }
    if (!EDITABLE_STATUSES.includes(timesheet.status)) {
      throw new Error(`Only DRAFT or RETURNED timesheets can be submitted (current status: ${timesheet.status})`);
    }
    if (!timesheet.entries.length) {
      throw new Error("Cannot submit a timesheet with no entries");
    }
    return prisma.timesheet.update({
      where: { id: timesheetId },
      data: { status: "SUBMITTED", submittedAt: new Date(), returnReason: null },
    });
  }

  /** SUBMITTED -> APPROVED. approvedById/approvedAt double as the "resolved by/at" pair for return too. */
  static async approveTimesheet(timesheetId: string, approvedById: string) {
    const timesheet = await prisma.timesheet.findUnique({ where: { id: timesheetId } });
    if (!timesheet) {
      throw new Error("Timesheet not found");
    }
    if (timesheet.status !== "SUBMITTED") {
      throw new Error(`Only SUBMITTED timesheets can be approved (current status: ${timesheet.status})`);
    }
    if (timesheet.userId === approvedById) {
      throw new Error("You cannot approve your own timesheet");
    }
    await TimesheetService.assertApproverReach(timesheet, approvedById);
    return prisma.timesheet.update({
      where: { id: timesheetId },
      data: { status: "APPROVED", approvedById, approvedAt: new Date() },
    });
  }

  /** SUBMITTED -> RETURNED (sent back to the employee for correction). */
  static async returnTimesheet(timesheetId: string, approvedById: string, reason?: string) {
    const timesheet = await prisma.timesheet.findUnique({ where: { id: timesheetId } });
    if (!timesheet) {
      throw new Error("Timesheet not found");
    }
    if (timesheet.status !== "SUBMITTED") {
      throw new Error(`Only SUBMITTED timesheets can be returned (current status: ${timesheet.status})`);
    }
    if (timesheet.userId === approvedById) {
      throw new Error("You cannot return your own timesheet");
    }
    await TimesheetService.assertApproverReach(timesheet, approvedById);
    const why = String(reason || "").trim();
    if (!why) throw new Error("Say what needs to be corrected before returning the timesheet");
    return prisma.timesheet.update({
      where: { id: timesheetId },
      data: { status: "RETURNED", approvedById, approvedAt: new Date(), returnReason: why.slice(0, 500) },
    });
  }
}
