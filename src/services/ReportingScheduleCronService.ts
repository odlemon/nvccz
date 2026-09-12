// @ts-nocheck
import { prisma } from "../utils/database";
import {
  addCalendarDaysToIso,
  lastCompletedCustomMonthEndsUtc,
  lastCompletedMonthEndUtc,
  lastCompletedQuarterEndUtc,
  lastCompletedYearEndUtc,
  shouldRunOpenCalendarAfterPeriodEnd,
  toIsoDate,
} from "../utils/reportingScheduleDates";
import { MANDATORY_REPORTING_ATTACHMENTS } from "../utils/reportingEmail";
import { ReportingCalendarService } from "./ReportingCalendarService";
import { ReportingReminderService } from "./ReportingReminderService";
import { ReportingScheduleConfigService } from "./ReportingScheduleConfigService";

export class ReportingScheduleCronService {
  static computePeriodEnd(config: { frequency: string; customMonthEnds: unknown }, asOf: Date): Date | null {
    const f = String(config.frequency || "").toUpperCase();
    if (f === "MONTHLY") return lastCompletedMonthEndUtc(asOf);
    if (f === "QUARTERLY") return lastCompletedQuarterEndUtc(asOf);
    if (f === "YEARLY") return lastCompletedYearEndUtc(asOf);
    if (f === "CUSTOM") {
      const months = config.customMonthEnds;
      const arr = Array.isArray(months) ? months.map((x) => Number(x)) : [];
      return lastCompletedCustomMonthEndsUtc(asOf, arr);
    }
    return null;
  }

  /**
   * Evaluates all active reporting schedule configs for `asOfDate` (default today UTC).
   * - **autoOpenCalendar true**: may broadcast REQUEST for the derived period (same scope as manual open — all eligible companies).
   * - **autoOpenCalendar false**: runs phase AUTO (T−3 / overdue) for periods already opened.
   */
  static async processScheduleTick(asOfDateInput?: string): Promise<{
    asOfDate: string;
    configsProcessed: number;
    actions: Array<{ configId: string; name: string; action: string; detail?: any }>;
  }> {
    const asOf = asOfDateInput
      ? new Date(`${normalizeAsOfDateInput(asOfDateInput)}T12:00:00.000Z`)
      : new Date();
    if (Number.isNaN(asOf.getTime())) {
      throw new Error("Invalid asOfDate; use YYYY-MM-DD");
    }
    const asOfIso = toIsoDate(asOf);

    const configs = await prisma.reportingScheduleConfig.findMany({
      where: { isActive: true },
      orderBy: { updatedAt: "asc" },
    });

    const actions: Array<{ configId: string; name: string; action: string; detail?: any }> = [];
    const globalReminderAutoKeys = new Set<string>();

    for (const cfg of configs) {
      if (cfg.autoOpenCalendar) {
        const periodEnd = this.computePeriodEnd(cfg, asOf);
        if (!periodEnd) {
          actions.push({
            configId: cfg.id,
            name: cfg.name,
            action: "skip_no_period_end",
            detail: { frequency: cfg.frequency },
          });
          continue;
        }
        if (!shouldRunOpenCalendarAfterPeriodEnd(periodEnd, asOf, cfg.openCalendarAfterPeriodEndDays)) {
          actions.push({
            configId: cfg.id,
            name: cfg.name,
            action: "skip_before_open_window",
            detail: { periodEnd: toIsoDate(periodEnd), openAfterDays: cfg.openCalendarAfterPeriodEndDays },
          });
          continue;
        }
        const reportingIso = toIsoDate(periodEnd);
        const already = await ReportingCalendarService.isReportingCalendarPeriodAlreadyOpen(reportingIso);
        if (already) {
          actions.push({
            configId: cfg.id,
            name: cfg.name,
            action: "skip_calendar_already_open",
            detail: { reportingPeriod: reportingIso },
          });
          continue;
        }
        const dueIso = addCalendarDaysToIso(reportingIso, cfg.dueDateOffsetDaysAfterPeriodEnd);
        const att = ReportingScheduleConfigService.resolveAttachmentsFromConfig(cfg.defaultAttachmentOptionIds);
        const mandatoryAttachments = att && att.length ? att : [...MANDATORY_REPORTING_ATTACHMENTS];
        try {
          const result = await ReportingReminderService.run({
            reportingPeriod: reportingIso,
            dueDate: dueIso,
            asOfDate: asOfIso,
            phase: "REQUEST",
            mandatoryAttachments,
          });
          actions.push({
            configId: cfg.id,
            name: cfg.name,
            action: "broadcast_request_opened_calendar",
            detail: result,
          });
        } catch (e: any) {
          actions.push({
            configId: cfg.id,
            name: cfg.name,
            action: "error_broadcast_request",
            detail: { message: e?.message || String(e) },
          });
        }
      } else {
        const pairs = await ReportingCalendarService.listOpenedPeriodDuePairs();
        if (!pairs.length) {
          actions.push({
            configId: cfg.id,
            name: cfg.name,
            action: "reminders_only_no_open_periods",
            detail: {},
          });
          continue;
        }
        const perConfig: any[] = [];
        for (const p of pairs) {
          const gk = `${p.reportingPeriod}|${p.dueDate}`;
          if (globalReminderAutoKeys.has(gk)) continue;
          globalReminderAutoKeys.add(gk);
          try {
            const r = await ReportingReminderService.run({
              reportingPeriod: p.reportingPeriod,
              dueDate: p.dueDate,
              asOfDate: asOfIso,
              phase: "AUTO",
            });
            perConfig.push({ reportingPeriod: p.reportingPeriod, ...r });
          } catch (e: any) {
            actions.push({
              configId: cfg.id,
              name: cfg.name,
              action: "error_reminder_auto",
              detail: { reportingPeriod: p.reportingPeriod, message: e?.message || String(e) },
            });
          }
        }
        actions.push({
          configId: cfg.id,
          name: cfg.name,
          action: "reminders_only_auto",
          detail: { runs: perConfig },
        });
      }
    }

    return { asOfDate: asOfIso, configsProcessed: configs.length, actions };
  }
}

function normalizeAsOfDateInput(s: string): string {
  return String(s).trim().slice(0, 10);
}
