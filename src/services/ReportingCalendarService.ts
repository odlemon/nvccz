// @ts-nocheck
import { prisma } from "../utils/database";
import {
  getInvesteeReportsPortalUrl,
  MANDATORY_REPORTING_ATTACHMENTS,
  parseMandatoryAttachmentsInput,
  reportingPeriodQuarterLabel,
  type ReportingMandatoryAttachment,
} from "../utils/reportingEmail";

export class ReportingCalendarService {
  /** True if this period already has a “Request for data” on the calendar (cannot open twice). */
  static async isReportingCalendarPeriodAlreadyOpen(reportingPeriodIso: string): Promise<boolean> {
    const rows = await prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c
         FROM reporting_notification_logs
        WHERE reporting_period = ?
          AND event_type = 'REQUEST'`,
      reportingPeriodIso
    );
    return Number(rows[0]?.c ?? 0) > 0;
  }

  /** Rich calendar list: one row per period that has been opened (≥1 REQUEST). */
  static async listCalendarPeriods(opts?: { limit?: number; offset?: number }): Promise<{
    periods: Array<{
      reportingPeriod: string;
      reportingPeriodLabel: string;
      dueDate: string | null;
      firstRequestAt: string | null;
      lastRequestAt: string | null;
      lastActivityAt: string | null;
      investeePortalUrl: string;
      mandatoryAttachments: ReportingMandatoryAttachment[];
      lastRequestEmailSubject: string | null;
      notificationSummary: {
        requestEmails: number;
        reminderTMinus3: number;
        overdue: number;
        manualNudge: number;
        viewedByInvestee: number;
      };
      distinctCompaniesRequestEmailed: number;
      companiesSubmitted: number;
    }>;
    meta: {
      investeePortalUrl: string;
      eligiblePortfolioCompanies: number;
      totalPeriods: number;
      limit: number;
      offset: number;
      listKind: "opened_calendars";
    };
  }> {
    const limit = Math.min(500, Math.max(1, Number(opts?.limit) || 200));
    const offset = Math.max(0, Number(opts?.offset) || 0);

    const mainQuery = prisma.$queryRawUnsafe<
      Array<{
        reporting_period: Date | string;
        first_request_at: Date | null;
        last_request_at: Date | null;
        last_activity_at: Date | null;
        due_date_latest: string | null;
        latest_request_meta: any;
        request_email_count: bigint;
        reminder_t_minus_3_count: bigint;
        overdue_count: bigint;
        manual_nudge_count: bigint;
        viewed_by_investee_count: bigint;
        distinct_companies_request: bigint;
      }>
    >(
      `SELECT
          l.reporting_period AS reporting_period,
          MIN(CASE WHEN l.event_type = 'REQUEST' THEN l.created_at END) AS first_request_at,
          MAX(CASE WHEN l.event_type = 'REQUEST' THEN l.created_at END) AS last_request_at,
          MAX(l.created_at) AS last_activity_at,
          (SELECT JSON_UNQUOTE(JSON_EXTRACT(x.meta, '$.dueDate'))
             FROM reporting_notification_logs x
            WHERE x.reporting_period = l.reporting_period
              AND x.event_type = 'REQUEST'
            ORDER BY x.created_at DESC
            LIMIT 1) AS due_date_latest,
          (SELECT x.meta
             FROM reporting_notification_logs x
            WHERE x.reporting_period = l.reporting_period
              AND x.event_type = 'REQUEST'
            ORDER BY x.created_at DESC
            LIMIT 1) AS latest_request_meta,
          SUM(CASE WHEN l.event_type = 'REQUEST' THEN 1 ELSE 0 END) AS request_email_count,
          SUM(CASE WHEN l.event_type = 'REMINDER_T_MINUS_3' THEN 1 ELSE 0 END) AS reminder_t_minus_3_count,
          SUM(CASE WHEN l.event_type = 'OVERDUE_T_PLUS_1' THEN 1 ELSE 0 END) AS overdue_count,
          SUM(CASE WHEN l.event_type = 'MANUAL_NUDGE' THEN 1 ELSE 0 END) AS manual_nudge_count,
          SUM(CASE WHEN l.event_type = 'VIEWED_BY_INVESTEE' THEN 1 ELSE 0 END) AS viewed_by_investee_count,
          COUNT(DISTINCT CASE WHEN l.event_type = 'REQUEST' THEN l.portfolio_company_id END) AS distinct_companies_request
         FROM reporting_notification_logs l
        GROUP BY l.reporting_period
       HAVING SUM(CASE WHEN l.event_type = 'REQUEST' THEN 1 ELSE 0 END) > 0
        ORDER BY l.reporting_period DESC
        LIMIT ? OFFSET ?`,
      limit,
      offset
    );

    const countQuery = prisma.$queryRawUnsafe<Array<{ c: bigint }>>(
      `SELECT COUNT(*) AS c
         FROM (
           SELECT l2.reporting_period
             FROM reporting_notification_logs l2
            GROUP BY l2.reporting_period
           HAVING SUM(CASE WHEN l2.event_type = 'REQUEST' THEN 1 ELSE 0 END) > 0
         ) t`
    );

    const eligibleQuery = prisma.portfolioCompany.count({
      where: { status: { in: ["ACTIVE", "APPROVED"] } },
    });

    const [rows, countRows, eligiblePortfolioCompanies] = await Promise.all([
      mainQuery,
      countQuery,
      eligibleQuery,
    ]);

    const totalPeriods = Number(countRows[0]?.c ?? 0);

    const portalUrl = getInvesteeReportsPortalUrl();

    const periodKeys = rows.map((x) => {
      const rp =
        x.reporting_period instanceof Date
          ? x.reporting_period.toISOString().split("T")[0]
          : String(x.reporting_period).slice(0, 10);
      return rp;
    });

    let submittedMap: Record<string, number> = {};
    if (periodKeys.length > 0) {
      const ph = periodKeys.map(() => "?").join(", ");
      const subRows = await prisma.$queryRawUnsafe<Array<{ rp: string | Date; c: bigint }>>(
        `SELECT reportingPeriod AS rp, COUNT(DISTINCT portfolioCompanyId) AS c
           FROM financial_reports
          WHERE status IN ('PENDING', 'ACCEPTED')
            AND reportingPeriod IN (${ph})
          GROUP BY reportingPeriod`,
        ...periodKeys
      );
      submittedMap = Object.fromEntries(
        subRows.map((s) => {
          const k =
            s.rp instanceof Date ? s.rp.toISOString().split("T")[0] : String(s.rp).slice(0, 10);
          return [k, Number(s.c || 0)];
        })
      );
    }

    const periods = rows.map((x) => {
      const rp =
        x.reporting_period instanceof Date
          ? x.reporting_period.toISOString().split("T")[0]
          : String(x.reporting_period).slice(0, 10);

      let meta = x.latest_request_meta;
      if (meta && typeof meta === "string") {
        try {
          meta = JSON.parse(meta);
        } catch {
          meta = null;
        }
      }

      let mandatoryAttachments = [...MANDATORY_REPORTING_ATTACHMENTS];
      const fromMeta = meta?.mandatoryAttachments;
      if (fromMeta != null) {
        const parsed = parseMandatoryAttachmentsInput(fromMeta, { required: true });
        if (parsed) mandatoryAttachments = parsed;
      }

      const fmt = (d: Date | null | undefined) =>
        d instanceof Date ? d.toISOString() : d != null ? String(d) : null;

      return {
        reportingPeriod: rp,
        reportingPeriodLabel: reportingPeriodQuarterLabel(rp),
        dueDate: x.due_date_latest || (meta?.dueDate != null ? String(meta.dueDate) : null),
        firstRequestAt: fmt(x.first_request_at),
        lastRequestAt: fmt(x.last_request_at),
        lastActivityAt: fmt(x.last_activity_at),
        investeePortalUrl: portalUrl,
        mandatoryAttachments,
        lastRequestEmailSubject: meta?.emailSubject != null ? String(meta.emailSubject) : null,
        notificationSummary: {
          requestEmails: Number(x.request_email_count || 0),
          reminderTMinus3: Number(x.reminder_t_minus_3_count || 0),
          overdue: Number(x.overdue_count || 0),
          manualNudge: Number(x.manual_nudge_count || 0),
          viewedByInvestee: Number(x.viewed_by_investee_count || 0),
        },
        distinctCompaniesRequestEmailed: Number(x.distinct_companies_request || 0),
        companiesSubmitted: submittedMap[rp] ?? 0,
      };
    });

    return {
      periods,
      /** Same as `periods` — one row per reporting period that has had at least one REQUEST (opened calendar). */
      openedCalendars: periods,
      meta: {
        investeePortalUrl: portalUrl,
        eligiblePortfolioCompanies,
        totalPeriods,
        limit,
        offset,
        listKind: "opened_calendars" as const,
      },
    };
  }

  /**
   * Distinct opened periods (REQUEST exists) with due date from latest REQUEST meta for that period.
   * Used by reminders-only schedule automation.
   */
  /** One round-trip: latest REQUEST row per period (MySQL 8+ window functions). */
  static async listOpenedPeriodDuePairs(): Promise<Array<{ reportingPeriod: string; dueDate: string }>> {
    const rows = await prisma.$queryRawUnsafe<
      Array<{ reporting_period: Date | string; dueDate: string | null }>
    >(
      `SELECT reporting_period, dueDate FROM (
         SELECT
           reporting_period,
           JSON_UNQUOTE(JSON_EXTRACT(meta, '$.dueDate')) AS dueDate,
           ROW_NUMBER() OVER (
             PARTITION BY reporting_period
             ORDER BY created_at DESC
           ) AS rn
         FROM reporting_notification_logs
         WHERE event_type = 'REQUEST'
       ) ranked
       WHERE rn = 1
         AND dueDate IS NOT NULL
         AND TRIM(IFNULL(dueDate, '')) != ''
         AND dueDate != 'null'`
    );

    return rows.map((r) => {
      const rp =
        r.reporting_period instanceof Date
          ? r.reporting_period.toISOString().split("T")[0]
          : String(r.reporting_period).slice(0, 10);
      return { reportingPeriod: rp, dueDate: String(r.dueDate) };
    });
  }

  static async getPeriodDetail(reportingPeriodIso: string): Promise<{
    reportingPeriod: string;
    reportingPeriodLabel: string;
    dueDate: string | null;
    investeePortalUrl: string;
    mandatoryAttachments: ReportingMandatoryAttachment[];
    lastRequestOpenedAt: string | null;
    sampleEmail: { subject: string | null; html: string | null; recipientEmail: string | null };
    notificationSummary: {
      requestEmails: number;
      reminderTMinus3: number;
      overdue: number;
      manualNudge: number;
      viewedByInvestee: number;
    };
  }> {
    const d = new Date(reportingPeriodIso);
    if (Number.isNaN(d.getTime())) {
      throw new Error("Invalid reportingPeriod; use YYYY-MM-DD");
    }
    const iso = d.toISOString().split("T")[0];

    const [latestReq, countsRows] = await Promise.all([
      prisma.$queryRawUnsafe<
        Array<{
          created_at: Date;
          recipient_email: string | null;
          meta: any;
        }>
      >(
        `SELECT created_at, recipient_email, meta
           FROM reporting_notification_logs
          WHERE reporting_period = ?
            AND event_type = 'REQUEST'
          ORDER BY created_at DESC
          LIMIT 1`,
        iso
      ),
      prisma.$queryRawUnsafe<Array<{ event_type: string; c: bigint }>>(
        `SELECT event_type AS event_type, COUNT(*) AS c
           FROM reporting_notification_logs
          WHERE reporting_period = ?
          GROUP BY event_type`,
        iso
      ),
    ]);

    const row0 = latestReq[0];
    let meta = row0?.meta;
    if (meta && typeof meta === "string") {
      try {
        meta = JSON.parse(meta);
      } catch {
        meta = null;
      }
    }
    let dueDate: string | null =
      meta && typeof meta.dueDate === "string" ? meta.dueDate : null;
    if (!dueDate && row0) {
      dueDate = await this.inferDueDateFromPeriod(iso);
    }

    const countMap = Object.fromEntries(countsRows.map((r) => [r.event_type, Number(r.c)]));

    const openedAt = row0?.created_at
      ? row0.created_at instanceof Date
        ? row0.created_at.toISOString()
        : String(row0.created_at)
      : null;

    let mandatoryAttachments = [...MANDATORY_REPORTING_ATTACHMENTS];
    const fromMeta = meta?.mandatoryAttachments;
    if (fromMeta != null) {
      const parsed = parseMandatoryAttachmentsInput(fromMeta, { required: true });
      if (parsed) mandatoryAttachments = parsed;
    }

    return {
      reportingPeriod: iso,
      reportingPeriodLabel: reportingPeriodQuarterLabel(iso),
      dueDate,
      investeePortalUrl: getInvesteeReportsPortalUrl(),
      mandatoryAttachments,
      lastRequestOpenedAt: openedAt,
      sampleEmail: {
        subject: meta?.emailSubject != null ? String(meta.emailSubject) : null,
        html: meta?.emailHtml != null ? String(meta.emailHtml) : null,
        recipientEmail: row0?.recipient_email ? String(row0.recipient_email) : null,
      },
      notificationSummary: {
        requestEmails: countMap.REQUEST || 0,
        reminderTMinus3: countMap.REMINDER_T_MINUS_3 || 0,
        overdue: countMap.OVERDUE_T_PLUS_1 || 0,
        manualNudge: countMap.MANUAL_NUDGE || 0,
        viewedByInvestee: countMap.VIEWED_BY_INVESTEE || 0,
      },
    };
  }

  private static async inferDueDateFromPeriod(iso: string): Promise<string | null> {
    const rows = await prisma.$queryRawUnsafe<Array<{ dueDate: string | null }>>(
      `SELECT JSON_UNQUOTE(JSON_EXTRACT(meta, '$.dueDate')) AS dueDate
         FROM reporting_notification_logs
        WHERE reporting_period = ?
        ORDER BY created_at DESC
        LIMIT 1`,
      iso
    );
    return rows[0]?.dueDate || null;
  }
}
