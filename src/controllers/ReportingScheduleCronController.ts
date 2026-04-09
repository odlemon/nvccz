// @ts-nocheck
import { Request, Response } from "express";
import { ReportingRemindersCronController } from "./ReportingRemindersCronController";
import { ReportingScheduleCronService } from "../services/ReportingScheduleCronService";

/**
 * Daily-style job: apply **active** rows from `reporting_schedule_configs`.
 * Same auth as **POST** `/api/cron/reporting/reminders` (secret header or localhost).
 */
export class ReportingScheduleCronController {
  static async postScheduleTick(req: Request, res: Response): Promise<void> {
    try {
      const auth = ReportingRemindersCronController.assertReportingCronAuth(req);
      if (!auth.ok) {
        res.status(auth.status).json(auth.body);
        return;
      }
      const asOfDate = req.body?.asOfDate != null ? String(req.body.asOfDate).trim() : undefined;
      const result = await ReportingScheduleCronService.processScheduleTick(asOfDate || undefined);
      res.json({
        success: true,
        message: "Reporting schedule tick completed",
        data: result,
        meta: { authMode: auth.authMode },
      });
    } catch (error: any) {
      console.error("[reporting-schedule-tick]", error);
      res.status(500).json({
        success: false,
        error: error?.message || "Schedule tick failed",
      });
    }
  }
}
