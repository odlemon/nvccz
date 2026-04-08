// @ts-nocheck
import { Request, Response } from "express";
import { ReportingReminderService } from "../services/ReportingReminderService";

export class ReportingRemindersCronController {
  private static isLoopbackSocket(req: Request): boolean {
    const a = req.socket?.remoteAddress ?? "";
    return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
  }

  /**
   * Cron: send due/overdue reporting reminders for a reportingPeriod.
   * - If REPORTING_REMINDERS_CRON_SECRET is set: require X-Reporting-Reminders-Cron-Secret.
   * - If unset: only loopback (local dev).
   *
   * Body: { reportingPeriod: "YYYY-MM-DD", dueDate: "YYYY-MM-DD", asOfDate?: "YYYY-MM-DD" }
   */
  static async postReportingRemindersCron(req: Request, res: Response): Promise<void> {
    try {
      const secret = process.env.REPORTING_REMINDERS_CRON_SECRET?.trim();

      let authMode: "shared-secret" | "loopback-local" = "shared-secret";

      if (secret) {
        const headerSecret = String(
          req.headers["x-reporting-reminders-cron-secret"] ||
            req.headers["X-Reporting-Reminders-Cron-Secret"] ||
            ""
        );
        if (headerSecret !== secret) {
          res.status(401).json({ success: false, error: "Unauthorized" });
          return;
        }
        authMode = "shared-secret";
      } else {
        if (!ReportingRemindersCronController.isLoopbackSocket(req)) {
          res.status(403).json({
            success: false,
            error:
              "Reporting reminders cron is not allowed from this host without REPORTING_REMINDERS_CRON_SECRET.",
          });
          return;
        }
        authMode = "loopback-local";
      }

      const { reportingPeriod, dueDate, asOfDate, phase } = req.body || {};
      const result = await ReportingReminderService.run({ reportingPeriod, dueDate, asOfDate, phase });

      res.json({
        success: true,
        message: "Reporting reminders run completed",
        data: result,
        meta: { authMode },
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

