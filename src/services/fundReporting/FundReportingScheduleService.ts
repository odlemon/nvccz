// @ts-nocheck
import { prisma } from "../../utils/database";
import { FundReportRunOrchestrator } from "./FundReportRunOrchestrator";

function periodBounds(periodType: string, asOf: Date): { start: Date; end: Date } {
  const end = new Date(asOf);
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  switch (periodType) {
    case "MONTHLY":
      start.setMonth(start.getMonth() - 1);
      break;
    case "SEMI_ANNUAL":
      start.setMonth(start.getMonth() - 6);
      break;
    case "ANNUAL":
      start.setFullYear(start.getFullYear() - 1);
      break;
    case "QUARTERLY":
    default:
      start.setMonth(start.getMonth() - 3);
      break;
  }
  return { start, end };
}

function computeNextRunAt(schedule: {
  periodType: string;
  dayOfMonth: number | null;
  hourOfDay: number;
}): Date {
  const now = new Date();
  const next = new Date(now);
  next.setHours(schedule.hourOfDay, 0, 0, 0);
  const dom = schedule.dayOfMonth || 15;
  if (next.getDate() < dom) {
    next.setDate(dom);
  } else {
    next.setMonth(next.getMonth() + 1);
    next.setDate(dom);
  }
  return next;
}

export class FundReportingScheduleService {
  static async list(fundId?: string) {
    return prisma.fundReportSchedule.findMany({
      where: {
        isActive: true,
        ...(fundId ? { fundId } : {}),
      },
      include: { template: true, fund: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    });
  }

  static async create(body: {
    fundId: string;
    templateId: string;
    name: string;
    periodType: string;
    cronExpression?: string;
    timezone?: string;
    dayOfMonth?: number;
    hourOfDay?: number;
    distributionListId?: string;
  }) {
    const periodType = String(body.periodType || "QUARTERLY").toUpperCase();
    const cronExpression =
      body.cronExpression ||
      `0 ${body.hourOfDay ?? 8} ${body.dayOfMonth ?? 15} * *`;
    const nextRunAt = computeNextRunAt({
      periodType,
      dayOfMonth: body.dayOfMonth ?? 15,
      hourOfDay: body.hourOfDay ?? 8,
    });
    return prisma.fundReportSchedule.create({
      data: {
        fundId: body.fundId,
        templateId: body.templateId,
        name: body.name,
        periodType,
        cronExpression,
        timezone: body.timezone || "Africa/Harare",
        dayOfMonth: body.dayOfMonth ?? 15,
        hourOfDay: body.hourOfDay ?? 8,
        distributionListId: body.distributionListId || null,
        nextRunAt,
      },
    });
  }

  static async update(
    id: string,
    body: Partial<{
      name: string;
      isActive: boolean;
      dayOfMonth: number;
      hourOfDay: number;
      distributionListId: string;
    }>
  ) {
    const existing = await prisma.fundReportSchedule.findUnique({ where: { id } });
    if (!existing) throw new Error("Schedule not found");
    const nextRunAt = computeNextRunAt({
      periodType: existing.periodType,
      dayOfMonth: body.dayOfMonth ?? existing.dayOfMonth,
      hourOfDay: body.hourOfDay ?? existing.hourOfDay,
    });
    return prisma.fundReportSchedule.update({
      where: { id },
      data: {
        ...(body.name != null ? { name: body.name } : {}),
        ...(body.isActive != null ? { isActive: body.isActive } : {}),
        ...(body.dayOfMonth != null ? { dayOfMonth: body.dayOfMonth } : {}),
        ...(body.hourOfDay != null ? { hourOfDay: body.hourOfDay } : {}),
        ...(body.distributionListId != null ? { distributionListId: body.distributionListId } : {}),
        nextRunAt,
      },
    });
  }

  static async delete(id: string) {
    return prisma.fundReportSchedule.update({
      where: { id },
      data: { isActive: false },
    });
  }

  static async runDueSchedules() {
    const now = new Date();
    const due = await prisma.fundReportSchedule.findMany({
      where: { isActive: true, nextRunAt: { lte: now } },
    });
    const results = [];
    for (const s of due) {
      const { start, end } = periodBounds(s.periodType, now);
      const run = await FundReportRunOrchestrator.createRun({
        fundId: s.fundId,
        templateId: s.templateId,
        periodStart: start,
        periodEnd: end,
        triggerType: "SCHEDULE",
        scheduleId: s.id,
        distributionListId: s.distributionListId || undefined,
      });
      await prisma.fundReportSchedule.update({
        where: { id: s.id },
        data: {
          nextRunAt: computeNextRunAt({
            periodType: s.periodType,
            dayOfMonth: s.dayOfMonth,
            hourOfDay: s.hourOfDay,
          }),
        },
      });
      results.push({ scheduleId: s.id, runId: run.id });
    }
    return { triggered: results.length, runs: results };
  }
}
