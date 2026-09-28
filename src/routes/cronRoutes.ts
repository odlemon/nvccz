// @ts-nocheck
import express from 'express';
import { VendorComplianceJobService } from '../services/VendorComplianceJobService';
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
router.post('/vendors/compliance-cycle', async (req, res) => {
  // Same guard as the tax-clearance cron: shared secret when configured, otherwise loopback only.
  const secret = process.env.VENDOR_TAX_CLEARANCE_CRON_SECRET?.trim();
  const a = req.socket?.remoteAddress ?? '';
  const loopback = a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
  const ok = secret ? String(req.headers['x-vendor-tax-cron-secret'] || '') === secret : loopback;
  if (!ok) return res.status(401).json({ success: false, error: 'Unauthorized' });
  try {
    res.status(200).json({ success: true, data: await VendorComplianceJobService.runCycle() });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});
router.post('/reporting/reminders', ReportingRemindersCronController.postReportingRemindersCron);
router.post('/reporting/schedule-tick', ReportingScheduleCronController.postScheduleTick);

export default router;
