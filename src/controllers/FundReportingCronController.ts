// @ts-nocheck
import { Request, Response } from "express";
import { FundReportingScheduleService } from "../services/fundReporting/FundReportingScheduleService";

export class FundReportingCronController {
  private static isLoopback(req: Request): boolean {
    const a = req.socket?.remoteAddress ?? "";
    return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
  }

  static assertCronAuth(req: Request): { ok: true } | { ok: false; status: number; body: any } {
    const secret =
      process.env.FUND_REPORTING_CRON_SECRET?.trim() ||
      process.env.REPORTING_REMINDERS_CRON_SECRET?.trim();
    if (secret) {
      const header = String(
        req.headers["x-fund-reporting-cron-secret"] ||
          req.headers["x-reporting-reminders-cron-secret"] ||
          ""
      );
      if (header !== secret) {
        return { ok: false, status: 401, body: { success: false, error: "Unauthorized" } };
      }
      return { ok: true };
    }
    if (!FundReportingCronController.isLoopback(req)) {
      return {
        ok: false,
        status: 403,
        body: {
          success: false,
          error: "Fund reporting cron requires FUND_REPORTING_CRON_SECRET from non-loopback hosts",
        },
      };
    }
    return { ok: true };
  }

  static async scheduleTick(req: Request, res: Response) {
    try {
      const auth = FundReportingCronController.assertCronAuth(req);
      if (!auth.ok) return res.status(auth.status).json(auth.body);
      const data = await FundReportingScheduleService.runDueSchedules();
      res.json({ success: true, data });
    } catch (e: any) {
      res.status(500).json({ success: false, message: e.message });
    }
  }
}
