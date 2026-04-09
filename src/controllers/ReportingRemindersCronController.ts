// @ts-nocheck
import { Request, Response } from "express";
import { ReportingReminderService } from "../services/ReportingReminderService";

export type ReportingCronAuthMode = "shared-secret" | "loopback-local";

export class ReportingRemindersCronController {
  private static isLoopbackSocket(req: Request): boolean {
    const a = req.socket?.remoteAddress ?? "";
    return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
  }

  /** Shared by reporting cron routes (reminders + schedule tick). */
  static assertReportingCronAuth(req: Request): { ok: true; authMode: ReportingCronAuthMode } | { ok: false; status: number; body: any } {
    const secret = process.env.REPORTING_REMINDERS_CRON_SECRET?.trim();
    if (secret) {
      const headerSecret = String(
        req.headers["x-reporting-reminders-cron-secret"] || req.headers["X-Reporting-Reminders-Cron-Secret"] || ""
      );
      if (headerSecret !== secret) {
        return { ok: false, status: 401, body: { success: false, error: "Unauthorized" } };
      }
      return { ok: true, authMode: "shared-secret" };
    }
    if (!ReportingRemindersCronController.isLoopbackSocket(req)) {
      return {
        ok: false,
        status: 403,
        body: {
          success: false,
          error:
            "Reporting cron is not allowed from this host without REPORTING_REMINDERS_CRON_SECRET.",
        },
      };
    }
    return { ok: true, authMode: "loopback-local" };
  }

  /**
   * Cron / public test: reporting reminder emails for a reportingPeriod.
   * **Routes:** `POST /api/cron/reporting/reminders` and `POST /api/public/reporting/reminders` (same handler).
   * - If REPORTING_REMINDERS_CRON_SECRET is set: require header `X-Reporting-Reminders-Cron-Secret`.
   * - If unset: only loopback (local dev).
   *
   * Body: { reportingPeriod, dueDate, asOfDate?, phase? } — `phase`: `T_MINUS_3` | `OVERDUE` | `REQUEST` | `AUTO`.
   */
  static async postReportingRemindersCron(req: Request, res: Response): Promise<void> {
    try {
      const auth = ReportingRemindersCronController.assertReportingCronAuth(req);
      if (!auth.ok) {
        res.status(auth.status).json(auth.body);
        return;
      }

      const { reportingPeriod, dueDate, asOfDate, phase } = req.body || {};
      const result = await ReportingReminderService.run({ reportingPeriod, dueDate, asOfDate, phase });

      res.json({
        success: true,
        message: "Reporting reminders run completed",
        data: result,
        meta: { authMode: auth.authMode },
      });
    } catch (error: any) {
      console.error("[reporting-reminders-cron]", error);
      res.status(500).json({
        success: false,
        error: error?.message || "Cron failed",
      });
    }
  }
}

