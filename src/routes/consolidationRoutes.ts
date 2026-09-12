// @ts-nocheck
import { Router } from "express";
import { BalanceSheetController } from "../controllers/BalanceSheetController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = Router();

/**
 * @swagger
 * /api/accounting/consolidation/summary:
 *   get:
 *     summary: Group Consolidation summary across ForecastEntities
 *     description: |
 *       Every active ForecastEntity's own GL summary (balance sheet + income statement totals,
 *       currency-consolidated into one reporting currency), plus a combined total across all
 *       entities and a "consolidated" total netted against manually-flagged elimination journals
 *       (isEliminationEntry=true), shown as its own separate line rather than silently subtracted.
 *       Pass forecastEntityId to scope the response to a single entity's own summary instead.
 *     tags: [Accounting - Consolidation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: forecastEntityId
 *         required: false
 *         schema:
 *           type: string
 *         description: Scope to one ForecastEntity's own summary. Omit for the full multi-entity + eliminations envelope.
 *       - in: query
 *         name: consolidationCurrencyId
 *         required: false
 *         schema:
 *           type: string
 *         description: Target reporting currency. Defaults to the first active currency.
 *       - in: query
 *         name: asOfDate
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Balance sheet as-of date. Defaults to now.
 *       - in: query
 *         name: periodStart
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Income statement period start. Defaults to start of current month.
 *       - in: query
 *         name: periodEnd
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Income statement period end. Defaults to asOfDate.
 *     responses:
 *       200:
 *         description: Consolidation summary generated successfully
 *       400:
 *         description: Bad request - invalid parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/summary", authenticate, authorize(["admin", "accountant"]), BalanceSheetController.getConsolidationSummary);

export default router;
