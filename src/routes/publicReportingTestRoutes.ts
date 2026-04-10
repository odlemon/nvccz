// @ts-nocheck
import express from "express";
import { ReportingRemindersCronController } from "../controllers/ReportingRemindersCronController";
import { ReportingScheduleCronController } from "../controllers/ReportingScheduleCronController";

const router = express.Router();

/**
 * @swagger
 * /api/public/reporting/reminders:
 *   post:
 *     summary: Trigger reporting reminder emails (public test / no JWT)
 *     description: |
 *       Same handler as **POST** `/api/cron/reporting/reminders`. **No JWT.** For UAT when no scheduler is installed.
 *       Set `REPORTING_REMINDERS_CRON_SECRET` in `.env` and send header `X-Reporting-Reminders-Cron-Secret`. If unset, only localhost can call.
 *
 *       **Tiers:** `T_MINUS_3` = gentle reminder (Tier 2); `OVERDUE` = overdue (Tier 3); `REQUEST` / `AUTO` as documented on cron.
 *       Recipients: **Primary financial contact** (`portfolio_companies.contactEmail`), else portal user email.
 *     tags: ['Financial Reporting']
 *     parameters:
 *       - in: header
 *         name: X-Reporting-Reminders-Cron-Secret
 *         required: false
 *         schema:
 *           type: string
 *         description: Required when env `REPORTING_REMINDERS_CRON_SECRET` is set.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reportingPeriod, dueDate]
 *             properties:
 *               reportingPeriod:
 *                 type: string
 *                 example: "2024-03-31"
 *               dueDate:
 *                 type: string
 *                 example: "2024-04-15"
 *               asOfDate:
 *                 type: string
 *                 description: Simulation date for AUTO phase
 *                 example: "2024-04-12"
 *               phase:
 *                 type: string
 *                 enum: [REQUEST, T_MINUS_3, OVERDUE, AUTO]
 *                 example: "T_MINUS_3"
 *           examples:
 *             tier2GentleReminder:
 *               summary: Tier 2 — T−3 gentle reminder
 *               value:
 *                 reportingPeriod: "2024-03-31"
 *                 dueDate: "2024-04-15"
 *                 phase: "T_MINUS_3"
 *             tier3Overdue:
 *               summary: Tier 3 — overdue alert
 *               value:
 *                 reportingPeriod: "2024-03-31"
 *                 dueDate: "2024-04-15"
 *                 phase: "OVERDUE"
 *     responses:
 *       200:
 *         description: Run completed (see reminded/skipped counts)
 *       401:
 *         description: Missing/wrong secret
 *       403:
 *         description: Non-loopback without secret configured
 */
router.post("/reminders", ReportingRemindersCronController.postReportingRemindersCron);

/** Intentionally omitted from Swagger — ops-only (same handler as cron schedule-tick). */
router.post("/schedule-tick", ReportingScheduleCronController.postScheduleTick);

export default router;
