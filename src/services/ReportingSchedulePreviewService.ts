// @ts-nocheck
import { prisma } from "../utils/database";
import {
  addCalendarDaysToIso,
  compareIsoDates,
  listPeriodEndsFromAnchorUtc,
  shouldRunOpenCalendarAfterPeriodEnd,
  startOfUtcDay,
  toIsoDate,
} from "../utils/reportingScheduleDates";
import { reportingPeriodQuarterLabel } from "../utils/reportingEmail";
import { ReportingScheduleCronService } from "./ReportingScheduleCronService";
import { ReportingScheduleConfigService } from "./ReportingScheduleConfigService";

const REMINDER_T_MINUS_DAYS = 3;
const OVERDUE_T_PLUS_DAYS = 1;

export type ReportingSchedulePreviewRow = {
  reportingPeriod: string;
  reportingPeriodLabel: string;
  periodEndDate: string;
  /** Earliest day automation may send REQUEST (`periodEnd + openCalendarAfterPeriodEndDays`). */
  reportingOpensOn: string;
  submissionDueDate: string;
  /** Gentle reminder email (AUTO / `T_MINUS_3`) — due date minus 3 calendar days. */
  reminderTMinus3On: string;
  /** Overdue alert email (AUTO / `OVERDUE`) — due date plus 1 calendar day. */
  overdueAlertOn: string;
  calendarAlreadyOpened: boolean;
  openWindowReached: boolean;
  isSubmissionOverdue: boolean;
  /** True when tick could open this period today: auto-open on, window reached, not yet opened. */
  automationWouldOpenOnTick: boolean;
};

function reportingPeriodDisplayLabel(frequency: string, periodEndIso: string): string {
  const f = String(frequency || "").toUpperCase();
  const [ys, ms] = periodEndIso.split("-");
  const y = Number(ys);
  const m = Number(ms);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return periodEndIso;
  const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", {
    month: "long",
    timeZone: "UTC",
  });
  if (f === "MONTHLY") return `${monthName} ${y}`;
  if (f === "YEARLY") return `Year ended ${y}`;
  if (f === "CUSTOM") return `${monthName} ${y}`;
  return reportingPeriodQuarterLabel(periodEndIso);
}

function parseAsOfDate(input?: string): Date {
  const raw = input ? String(input).trim().slice(0, 10) : toIsoDate(new Date());
  const d = new Date(`${raw}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime())) {
    throw new Error("Invalid asOfDate; use YYYY-MM-DD");
  }
  return d;
}

function parseCount(input: unknown): number {
  const n = input == null ? 6 : Number(input);
  if (!Number.isFinite(n) || n < 1 || n > 24) {
    throw new Error("count must be an integer between 1 and 24");
  }
  return Math.floor(n);
}

async function openedPeriodSet(periodIsos: string[]): Promise<Set<string>> {
  if (!periodIsos.length) return new Set();
  const placeholders = periodIsos.map(() => "?").join(", ");
  const rows = await prisma.$queryRawUnsafe<Array<{ reporting_period: Date | string }>>(
    `SELECT DISTINCT reporting_period
       FROM reporting_notification_logs
      WHERE event_type = 'REQUEST'
        AND reporting_period IN (${placeholders})`,
    ...periodIsos
  );
  const set = new Set<string>();
  for (const r of rows) {
    const v = r.reporting_period;
    const iso =
      v instanceof Date ? toIsoDate(v) : String(v).trim().slice(0, 10);
    if (iso) set.add(iso);
  }
  return set;
}

function buildRow(params: {
  frequency: string;
  periodEnd: Date;
  asOf: Date;
  openAfterDays: number;
  dueOffsetDays: number;
  autoOpenCalendar: boolean;
  opened: Set<string>;
}): ReportingSchedulePreviewRow {
  const periodEndIso = toIsoDate(params.periodEnd);
  const reportingOpensOn = addCalendarDaysToIso(periodEndIso, params.openAfterDays);
  const submissionDueDate = addCalendarDaysToIso(periodEndIso, params.dueOffsetDays);
  const reminderTMinus3On = addCalendarDaysToIso(submissionDueDate, -REMINDER_T_MINUS_DAYS);
  const overdueAlertOn = addCalendarDaysToIso(submissionDueDate, OVERDUE_T_PLUS_DAYS);
  const asOfIso = toIsoDate(startOfUtcDay(params.asOf));
  const calendarAlreadyOpened = params.opened.has(periodEndIso);
  const openWindowReached = compareIsoDates(asOfIso, reportingOpensOn) >= 0;
  const isSubmissionOverdue = compareIsoDates(asOfIso, submissionDueDate) > 0;
  const automationWouldOpenOnTick =
    params.autoOpenCalendar &&
    openWindowReached &&
    !calendarAlreadyOpened &&
    shouldRunOpenCalendarAfterPeriodEnd(
      params.periodEnd,
      params.asOf,
      params.openAfterDays
    );

  return {
    reportingPeriod: periodEndIso,
    reportingPeriodLabel: reportingPeriodDisplayLabel(params.frequency, periodEndIso),
    periodEndDate: periodEndIso,
    reportingOpensOn,
    submissionDueDate,
    reminderTMinus3On,
    overdueAlertOn,
    calendarAlreadyOpened,
    openWindowReached,
    isSubmissionOverdue,
    automationWouldOpenOnTick,
  };
}

export class ReportingSchedulePreviewService {
  static async previewFromConfigRow(
    config: {
      id?: string;
      name?: string;
      frequency: string;
      customMonthEnds?: unknown;
      autoOpenCalendar?: boolean;
      dueDateOffsetDaysAfterPeriodEnd: number;
      openCalendarAfterPeriodEndDays: number;
    },
    opts?: { asOfDate?: string; count?: number }
  ) {
    const asOf = parseAsOfDate(opts?.asOfDate);
    const count = parseCount(opts?.count);
    const customMonths = Array.isArray(config.customMonthEnds)
      ? config.customMonthEnds.map((x) => Number(x))
      : null;

    const anchor = ReportingScheduleCronService.computePeriodEnd(
      { frequency: config.frequency, customMonthEnds: customMonths },
      asOf
    );
    if (!anchor) {
      throw new Error(
        "Cannot derive a reporting period end for this frequency (check CUSTOM customMonthEnds)"
      );
    }

    const periodEnds = listPeriodEndsFromAnchorUtc(
      config.frequency,
      anchor,
      count,
      customMonths
    );
    const opened = await openedPeriodSet(periodEnds.map(toIsoDate));

    const periods: ReportingSchedulePreviewRow[] = periodEnds.map((periodEnd) =>
      buildRow({
        frequency: config.frequency,
        periodEnd,
        asOf,
        openAfterDays: config.openCalendarAfterPeriodEndDays,
        dueOffsetDays: config.dueDateOffsetDaysAfterPeriodEnd,
        autoOpenCalendar: config.autoOpenCalendar !== false,
        opened,
      })
    );

    return {
      asOfDate: toIsoDate(startOfUtcDay(asOf)),
      count,
      config: {
        id: config.id ?? null,
        name: config.name ?? null,
        frequency: config.frequency,
        autoOpenCalendar: config.autoOpenCalendar !== false,
        openCalendarAfterPeriodEndDays: config.openCalendarAfterPeriodEndDays,
        dueDateOffsetDaysAfterPeriodEnd: config.dueDateOffsetDaysAfterPeriodEnd,
      },
      offsetsExplanation: {
        reportingOpensOn:
          "periodEndDate + openCalendarAfterPeriodEndDays (earliest day REQUEST / calendar open may run)",
        submissionDueDate:
          "periodEndDate + dueDateOffsetDaysAfterPeriodEnd (investee submission deadline)",
        reminderTMinus3On: `submissionDueDate − ${REMINDER_T_MINUS_DAYS} calendar days`,
        overdueAlertOn: `submissionDueDate + ${OVERDUE_T_PLUS_DAYS} calendar day`,
      },
      reminderScheduleNote:
        "Reminder emails send only when the daily reporting job runs on the exact dates above (AUTO phase), or when an operator triggers T_MINUS_3 / OVERDUE manually.",
      periods,
    };
  }

  static async previewByConfigId(
    configId: string,
    opts?: { asOfDate?: string; count?: number }
  ) {
    const row = await ReportingScheduleConfigService.getById(configId);
    if (!row) return null;
    const data = await this.previewFromConfigRow(row, opts);
    return { ...data, config: { ...data.config, id: row.id, name: row.name } };
  }

}
