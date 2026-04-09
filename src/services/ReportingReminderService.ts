// @ts-nocheck
import { prisma } from "../utils/database";
import { MANDATORY_REPORTING_ATTACHMENTS } from "../utils/reportingEmail";
import { resolveReportingNotificationRecipient } from "../utils/reportingRecipient";
import { ReportingCalendarService } from "./ReportingCalendarService";
import { EmailNotificationService } from "./EmailNotificationService";

export class ReportingReminderService {
  private static iso(date: Date): string {
    return date.toISOString().split("T")[0];
  }

  private static async logEvent(args: {
    portfolioCompanyId: string;
    reportingPeriodIso: string;
    eventType: string;
    recipientEmail?: string | null;
    status?: string;
    meta?: any;
  }): Promise<void> {
    await prisma.$executeRawUnsafe(
      `INSERT INTO reporting_notification_logs
        (id, portfolio_company_id, reporting_period, event_type, channel, recipient_email, status, meta, created_at)
       VALUES
        (?, ?, ?, ?, 'EMAIL', ?, ?, ?, NOW(3))`,
      (global as any).crypto?.randomUUID?.() || require("crypto").randomUUID(),
      args.portfolioCompanyId,
      args.reportingPeriodIso,
      args.eventType,
      args.recipientEmail || null,
      args.status || "SENT",
      args.meta ? JSON.stringify(args.meta) : null
    );
  }

  static async run(params: {
    reportingPeriod: string; // YYYY-MM-DD
    dueDate: string; // YYYY-MM-DD
    asOfDate?: string; // YYYY-MM-DD (default today)
    phase?: "AUTO" | "REQUEST" | "T_MINUS_3" | "OVERDUE" | "MANUAL_NUDGE";
    portfolioCompanyId?: string; // required for MANUAL_NUDGE; optional otherwise (restrict to one company)
    /** Required when phase is MANUAL_NUDGE — included in the email body and stored in notification log meta. */
    analystMessage?: string;
    analystUserId?: string | null;
    /** Excel/PDF list for emails; defaults when omitted (cron/reminders). */
    mandatoryAttachments?: ReadonlyArray<{ name: string; formats: string }>;
  }): Promise<{
    reportingPeriod: string;
    dueDate: string;
    asOfDate: string;
    reminded: number;
    skipped: number;
  }> {
    const reportingPeriod = new Date(params.reportingPeriod);
    const dueDate = new Date(params.dueDate);
    const asOfDate = params.asOfDate ? new Date(params.asOfDate) : new Date();

    if (Number.isNaN(reportingPeriod.getTime()) || Number.isNaN(dueDate.getTime()) || Number.isNaN(asOfDate.getTime())) {
      throw new Error("Invalid dates. Expected YYYY-MM-DD for reportingPeriod, dueDate, asOfDate");
    }

    const reportingIso = reportingPeriod.toISOString().split("T")[0];
    const dueIso = dueDate.toISOString().split("T")[0];
    const asOfIso = asOfDate.toISOString().split("T")[0];

    const phase = (params.phase || "AUTO") as any;

    if (phase === "REQUEST" && !params.portfolioCompanyId) {
      const exists = await ReportingCalendarService.isReportingCalendarPeriodAlreadyOpen(reportingIso);
      if (exists) {
        throw new Error(
          "This reporting period already has a REQUEST batch. Use POST /api/portfolio-companies/reporting/requests to open the calendar once, then use phase T_MINUS_3 or OVERDUE for reminder tiers (or the public/cron trigger endpoints)."
        );
      }
    }

    let eventType: string | null = null;
    let isOverdue = false;
    if (phase === "REQUEST") {
      eventType = "REQUEST";
    } else if (phase === "T_MINUS_3") {
      eventType = "REMINDER_T_MINUS_3";
    } else if (phase === "OVERDUE") {
      eventType = "OVERDUE_T_PLUS_1";
      isOverdue = true;
    } else if (phase === "MANUAL_NUDGE") {
      if (!params.portfolioCompanyId) {
        throw new Error("portfolioCompanyId is required for MANUAL_NUDGE");
      }
      const msg = String(params.analystMessage || "").trim();
      if (!msg) {
        throw new Error("analystMessage is required for MANUAL_NUDGE");
      }
      eventType = "MANUAL_NUDGE";
      isOverdue = asOfIso > dueIso;
    } else {
      // AUTO: only send on T-3 or T+1 (so we don't spam daily)
      const dueMs = new Date(dueIso).getTime();
      const asOfMs = new Date(asOfIso).getTime();
      const day = 24 * 60 * 60 * 1000;
      if (asOfMs === dueMs - 3 * day) {
        eventType = "REMINDER_T_MINUS_3";
      } else if (asOfMs === dueMs + 1 * day) {
        eventType = "OVERDUE_T_PLUS_1";
        isOverdue = true;
      } else {
        return { reportingPeriod: reportingIso, dueDate: dueIso, asOfDate: asOfIso, reminded: 0, skipped: 0 };
      }
    }

    const resolvedAttachments =
      Array.isArray(params.mandatoryAttachments) && params.mandatoryAttachments.length > 0
        ? params.mandatoryAttachments
        : [...MANDATORY_REPORTING_ATTACHMENTS];

    const submittedRows = await prisma.$queryRawUnsafe<Array<{ portfolioCompanyId: string }>>(
      `SELECT DISTINCT portfolioCompanyId
       FROM financial_reports
       WHERE reportingPeriod = ?
         AND status IN ('PENDING', 'ACCEPTED')`,
      reportingIso
    );
    const submittedSet = new Set(submittedRows.map((r) => r.portfolioCompanyId));

    // “Active” investees eligible for reporting (live portfolio companies).
    const companies = await prisma.portfolioCompany.findMany({
      where: {
        status: { in: ["ACTIVE", "APPROVED"] },
        ...(params.portfolioCompanyId ? { id: params.portfolioCompanyId } : {}),
      },
      select: {
        id: true,
        name: true,
        contactEmail: true,
        contactPerson: true,
        user: { select: { email: true } },
      },
    });

    let reminded = 0;
    let skipped = 0;

    for (const c of companies) {
      if (submittedSet.has(c.id)) {
        skipped++;
        continue;
      }
      const rcpt = resolveReportingNotificationRecipient({
        companyName: c.name,
        contactEmail: c.contactEmail,
        contactPerson: c.contactPerson,
        portalUserEmail: c.user?.email,
      });
      if (!rcpt) {
        skipped++;
        continue;
      }
      let emailSnapshot: { subject: string; html: string };
      if (phase === "MANUAL_NUDGE") {
        emailSnapshot = await EmailNotificationService.sendReportingManualNudgeEmail({
          recipientEmail: rcpt.email,
          companyName: c.name,
          reportingPeriod: reportingIso,
          dueDate: dueIso,
          analystMessage: String(params.analystMessage || "").trim(),
          isOverdue,
          mandatoryAttachments: resolvedAttachments,
          recipientMailboxName: rcpt.mailboxDisplayName,
          recipientGreetingName: rcpt.salutation,
        });
      } else {
        const kind =
          eventType === "REQUEST"
            ? "REQUEST"
            : eventType === "REMINDER_T_MINUS_3"
              ? "REMINDER"
              : "OVERDUE";
        emailSnapshot = await EmailNotificationService.sendReportingPeriodReminderEmail({
          recipientEmail: rcpt.email,
          companyName: c.name,
          reportingPeriod: reportingIso,
          dueDate: dueIso,
          isOverdue,
          kind,
          mandatoryAttachments: resolvedAttachments,
          recipientMailboxName: rcpt.mailboxDisplayName,
          recipientGreetingName: rcpt.salutation,
        });
      }
      await this.logEvent({
        portfolioCompanyId: c.id,
        reportingPeriodIso: reportingIso,
        eventType,
        recipientEmail: rcpt.email,
        status: "SENT",
        meta: {
          dueDate: dueIso,
          asOfDate: asOfIso,
          emailSubject: emailSnapshot.subject,
          emailHtml: emailSnapshot.html,
          mandatoryAttachments: resolvedAttachments,
          recipientSource: rcpt.source,
          portalUserEmail: rcpt.source === "PRIMARY_FINANCIAL_CONTACT" ? c.user?.email || null : null,
          contactPerson: c.contactPerson || null,
          ...(phase === "MANUAL_NUDGE"
            ? {
                analystUserId: params.analystUserId ?? null,
                analystMessage: String(params.analystMessage || "").trim(),
              }
            : {}),
        },
      });
      reminded++;
    }

    return { reportingPeriod: reportingIso, dueDate: dueIso, asOfDate: asOfIso, reminded, skipped };
  }
}

