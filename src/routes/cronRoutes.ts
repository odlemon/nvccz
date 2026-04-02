// @ts-nocheck
import express from 'express';
import { AssetController } from '../controllers/AssetController';
import { VendorTaxComplianceCronController } from '../controllers/VendorTaxComplianceCronController';

/**
 * Machine-to-machine cron jobs: no JWT. Protected per-route (e.g. shared secret header).
 */
const router = express.Router();

router.post('/depreciation/monthly', AssetController.postMonthlyDepreciationCron);
router.post(
  '/vendors/tax-clearance-revalidation-alerts',
  VendorTaxComplianceCronController.postTaxClearanceRevalidationCron
);

export default router;
