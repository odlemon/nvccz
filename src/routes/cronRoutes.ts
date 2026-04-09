// @ts-nocheck
import express from 'express';
import { AssetController } from '../controllers/AssetController';
import { VendorTaxComplianceCronController } from '../controllers/VendorTaxComplianceCronController';
import { ReportingRemindersCronController } from '../controllers/ReportingRemindersCronController';
import { ReportingScheduleCronController } from '../controllers/ReportingScheduleCronController';

/**
 * Machine-to-machine cron jobs: no JWT. Protected per-route (e.g. shared secret header).
 * Reporting reminders are also mounted at **POST /api/public/reporting/reminders** for UAT without a scheduler.
 * Short-term investment daily accrual runs on user login (at most once per 24h) instead of cron.
 */
const router = express.Router();

router.post('/depreciation/monthly', AssetController.postMonthlyDepreciationCron);
router.post(
  '/vendors/tax-clearance-revalidation-alerts',
  VendorTaxComplianceCronController.postTaxClearanceRevalidationCron
);
router.post('/reporting/reminders', ReportingRemindersCronController.postReportingRemindersCron);
router.post('/reporting/schedule-tick', ReportingScheduleCronController.postScheduleTick);

export default router;
