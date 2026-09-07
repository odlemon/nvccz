// @ts-nocheck
import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "../utils/database";
import { parseDate } from "../utils/dateHelper";

export type UpsertEntryInput = {
  projectId: string;
  date: string | Date;
  hours: number | string;
  billable?: boolean;
  notes?: string | null;
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
    const weekEndingDate = parseDate(weekEnding);
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
  static async listPendingApproval() {
    return prisma.timesheet.findMany({
      where: { status: "SUBMITTED" },
      orderBy: { submittedAt: "asc" },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
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
    const entryDate = parseDate(input.date);

    const existing = await prisma.timesheetEntry.findFirst({
      where: { timesheetId, projectId: input.projectId, date: entryDate },
    });

    if (existing) {
      return prisma.timesheetEntry.update({
        where: { id: existing.id },
        data: {
          hours: hoursDec,
          billable: input.billable ?? existing.billable,
          notes: input.notes !== undefined ? input.notes : existing.notes,
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
      },
      include: { project: true },
    });
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
      data: { status: "SUBMITTED", submittedAt: new Date() },
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
    return prisma.timesheet.update({
      where: { id: timesheetId },
      data: { status: "APPROVED", approvedById, approvedAt: new Date() },
    });
  }

  /** SUBMITTED -> RETURNED (sent back to the employee for correction). */
  static async returnTimesheet(timesheetId: string, approvedById: string) {
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
    return prisma.timesheet.update({
      where: { id: timesheetId },
      data: { status: "RETURNED", approvedById, approvedAt: new Date() },
    });
  }
}
