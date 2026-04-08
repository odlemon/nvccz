// @ts-nocheck
import { prisma } from "../utils/database";
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
    phase?: "AUTO" | "REQUEST" | "T_MINUS_3" | "OVERDUE";
    portfolioCompanyId?: string; // optional: restrict to one company (manual nudge)
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
    let eventType: string | null = null;
    let isOverdue = false;
    if (phase === "REQUEST") {
      eventType = "REQUEST";
    } else if (phase === "T_MINUS_3") {
      eventType = "REMINDER_T_MINUS_3";
    } else if (phase === "OVERDUE") {
      eventType = "OVERDUE_T_PLUS_1";
      isOverdue = true;
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

    const submittedRows = await prisma.$queryRawUnsafe<Array<{ portfolioCompanyId: string }>>(
      `SELECT DISTINCT portfolioCompanyId
       FROM financial_reports
       WHERE reportingPeriod = ?
         AND status IN ('PENDING', 'ACCEPTED')`,
      reportingIso
    );
    const submittedSet = new Set(submittedRows.map((r) => r.portfolioCompanyId));

    const companies = await prisma.portfolioCompany.findMany({
      where: {
        status: { in: ["APPROVED", "ACTIVE"] },
        ...(params.portfolioCompanyId ? { id: params.portfolioCompanyId } : {}),
      },
      select: {
        id: true,
        name: true,
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
      const email = c.user?.email;
      if (!email) {
        skipped++;
        continue;
      }
      await EmailNotificationService.sendReportingPeriodReminderEmail({
        recipientEmail: email,
        companyName: c.name,
        reportingPeriod: reportingIso,
        dueDate: dueIso,
        isOverdue,
      });
      await this.logEvent({
        portfolioCompanyId: c.id,
        reportingPeriodIso: reportingIso,
        eventType,
        recipientEmail: email,
        status: "SENT",
        meta: { dueDate: dueIso, asOfDate: asOfIso },
      });
      reminded++;
    }

    return { reportingPeriod: reportingIso, dueDate: dueIso, asOfDate: asOfIso, reminded, skipped };
  }
}

