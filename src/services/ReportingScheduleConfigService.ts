// @ts-nocheck
import { prisma } from "../utils/database";
import {
  resolveMandatoryAttachmentsFromOptionIds,
  type ReportingMandatoryAttachment,
} from "../utils/reportingEmail";

export const REPORTING_SCHEDULE_FREQUENCIES = ["MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"] as const;

export type ReportingScheduleFrequency = (typeof REPORTING_SCHEDULE_FREQUENCIES)[number];

function parseCustomMonthEnds(raw: unknown): number[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out: number[] = [];
  for (const x of raw) {
    const n = Number(x);
    if (!Number.isInteger(n) || n < 1 || n > 12) return null;
    out.push(n);
  }
  return out.length ? out : null;
}

export class ReportingScheduleConfigService {
  static assertFrequency(v: string): ReportingScheduleFrequency {
    const u = String(v || "").toUpperCase();
    if (!REPORTING_SCHEDULE_FREQUENCIES.includes(u as any)) {
      throw new Error(`frequency must be one of ${REPORTING_SCHEDULE_FREQUENCIES.join(", ")}`);
    }
    return u as ReportingScheduleFrequency;
  }

  static normalizeCreateBody(body: any) {
    const frequency = this.assertFrequency(body?.frequency);
    const customMonthEndsParsed = parseCustomMonthEnds(body?.customMonthEnds);
    const customMonthEnds = frequency === "CUSTOM" ? customMonthEndsParsed : null;
    if (frequency === "CUSTOM" && !customMonthEnds) {
      throw new Error("customMonthEnds (non-empty array of month numbers 1–12) is required when frequency is CUSTOM");
    }
    const dueDays = Number(body?.dueDateOffsetDaysAfterPeriodEnd ?? 15);
    const openAfter = Number(body?.openCalendarAfterPeriodEndDays ?? 1);
    if (!Number.isFinite(dueDays) || dueDays < 1) {
      throw new Error("dueDateOffsetDaysAfterPeriodEnd must be a positive integer");
    }
    if (!Number.isFinite(openAfter) || openAfter < 0) {
      throw new Error("openCalendarAfterPeriodEndDays must be a non-negative integer");
    }
    let defaultAttachmentOptionIds: string[] | undefined;
    if (body?.defaultAttachmentOptionIds != null) {
      if (!Array.isArray(body.defaultAttachmentOptionIds)) {
        throw new Error("defaultAttachmentOptionIds must be an array of catalog ids");
      }
      defaultAttachmentOptionIds = body.defaultAttachmentOptionIds.map((x: any) => String(x));
    }
    const name = String(body?.name || "").trim();
    if (!name) throw new Error("name is required");

    return {
      name,
      frequency,
      isActive: body?.isActive !== false,
      autoOpenCalendar: body?.autoOpenCalendar !== false,
      dueDateOffsetDaysAfterPeriodEnd: Math.floor(dueDays),
      openCalendarAfterPeriodEndDays: Math.floor(openAfter),
      defaultAttachmentOptionIds:
        defaultAttachmentOptionIds && defaultAttachmentOptionIds.length ? defaultAttachmentOptionIds : null,
      customMonthEnds,
    };
  }

  static async create(body: any) {
    const row = this.normalizeCreateBody(body);
    return prisma.reportingScheduleConfig.create({
      data: {
        name: row.name,
        frequency: row.frequency,
        isActive: row.isActive,
        autoOpenCalendar: row.autoOpenCalendar,
        dueDateOffsetDaysAfterPeriodEnd: row.dueDateOffsetDaysAfterPeriodEnd,
        openCalendarAfterPeriodEndDays: row.openCalendarAfterPeriodEndDays,
        defaultAttachmentOptionIds: row.defaultAttachmentOptionIds,
        customMonthEnds: row.customMonthEnds,
      },
    });
  }

  static async list() {
    return prisma.reportingScheduleConfig.findMany({
      orderBy: { updatedAt: "desc" },
    });
  }

  static async getById(id: string) {
    return prisma.reportingScheduleConfig.findUnique({ where: { id } });
  }

  static async update(id: string, body: any) {
    const existing = await prisma.reportingScheduleConfig.findUnique({ where: { id } });
    if (!existing) return null;

    const data: any = {};
    if (body?.name !== undefined) {
      const name = String(body.name || "").trim();
      if (!name) throw new Error("name cannot be empty");
      data.name = name;
    }
    if (body?.frequency !== undefined) {
      data.frequency = this.assertFrequency(body.frequency);
    }
    if (body?.isActive !== undefined) data.isActive = Boolean(body.isActive);
    if (body?.autoOpenCalendar !== undefined) data.autoOpenCalendar = Boolean(body.autoOpenCalendar);
    if (body?.dueDateOffsetDaysAfterPeriodEnd !== undefined) {
      const n = Number(body.dueDateOffsetDaysAfterPeriodEnd);
      if (!Number.isFinite(n) || n < 1) throw new Error("dueDateOffsetDaysAfterPeriodEnd must be a positive integer");
      data.dueDateOffsetDaysAfterPeriodEnd = Math.floor(n);
    }
    if (body?.openCalendarAfterPeriodEndDays !== undefined) {
      const n = Number(body.openCalendarAfterPeriodEndDays);
      if (!Number.isFinite(n) || n < 0) {
        throw new Error("openCalendarAfterPeriodEndDays must be a non-negative integer");
      }
      data.openCalendarAfterPeriodEndDays = Math.floor(n);
    }
    if (body?.defaultAttachmentOptionIds !== undefined) {
      if (body.defaultAttachmentOptionIds === null) {
        data.defaultAttachmentOptionIds = null;
      } else {
        if (!Array.isArray(body.defaultAttachmentOptionIds)) {
          throw new Error("defaultAttachmentOptionIds must be an array or null");
        }
        const ids = body.defaultAttachmentOptionIds.map((x: any) => String(x));
        data.defaultAttachmentOptionIds = ids.length ? ids : null;
      }
    }
    if (body?.customMonthEnds !== undefined) {
      const freq = (data.frequency || existing.frequency) as string;
      if (freq === "CUSTOM") {
        const cm = parseCustomMonthEnds(body.customMonthEnds);
        if (!cm) throw new Error("customMonthEnds must be a non-empty array of integers 1–12 for CUSTOM");
        data.customMonthEnds = cm;
      } else {
        data.customMonthEnds = null;
      }
    }

    const effFreq = (data.frequency || existing.frequency) as string;
    if (effFreq !== "CUSTOM") {
      data.customMonthEnds = null;
    } else {
      const cm = data.customMonthEnds !== undefined ? data.customMonthEnds : existing.customMonthEnds;
      const arr = Array.isArray(cm) ? cm : null;
      if (!arr || arr.length === 0) {
        throw new Error("CUSTOM frequency requires customMonthEnds");
      }
    }

    return prisma.reportingScheduleConfig.update({
      where: { id },
      data,
    });
  }

  static async delete(id: string) {
    try {
      await prisma.reportingScheduleConfig.delete({ where: { id } });
      return true;
    } catch {
      return false;
    }
  }

  static resolveAttachmentsFromConfig(stored: unknown): ReportingMandatoryAttachment[] | null {
    return resolveMandatoryAttachmentsFromOptionIds(stored);
  }
}
