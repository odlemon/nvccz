// @ts-nocheck
import { Router } from "express";
import { AccountingPeIntegrationController } from "../controllers/AccountingPeIntegrationController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = Router();

/**
 * @swagger
 * /accounting/v1/pe/portfolio-irr:
 *   get:
 *     summary: Portfolio gross IRR (PE / accounting feed for performance sync)
 *     description: |
 *       Weighted aggregate fund gross IRR from the same PE data path as the portfolio dashboard,
 *       with **4 decimal places** for performance sync (Portfolio IRR UAT) (`endpointPath` must include `/v1/`).
 *     tags: [Accounting]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: fundId
 *         schema:
 *           type: string
 *         description: Optional fund id; omit to aggregate all funds (paid-in weighted).
 *     responses:
 *       200:
 *         description: Payload shape supports `fieldPath` `data.metrics.irr`
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     metrics:
 *                       type: object
 *                       properties:
 *                         irr:
 *                           type: number
 *                           example: 0.1878
 *                         precisionDigits:
 *                           type: integer
 *                           example: 4
 */
router.get(
  "/pe/portfolio-irr",
  authenticate,
  authorize(["admin", "ceo", "fund_manager", "investments_manager", "finance_manager"]),
  AccountingPeIntegrationController.getPortfolioIrr
);

/**
 * Alias path for older sync configs / docs that referenced `kpis/portfolio-irr`.
 */
router.get(
  "/kpis/portfolio-irr",
  authenticate,
  authorize(["admin", "ceo", "fund_manager", "investments_manager", "finance_manager"]),
  AccountingPeIntegrationController.getPortfolioIrr
);

/**
 * @swagger
 * /accounting/v1/pe/portfolio-total-revenue:
 *   get:
 *     summary: Aggregated portfolio company total revenue (PE feed for performance sync)
 *     description: |
 *       Sums `latestKpiValues.TOTAL_REVENUE` from each `PortfolioCompany.financialKpis`.
 *       Use with performance sync `fieldPath` `data.metrics.totalRevenue` and optional `fundId` query.
 *     tags: [Accounting]
 *     security:
 *       - bearerAuth: []
 */
router.get(
  "/pe/portfolio-total-revenue",
  authenticate,
  authorize(["admin", "ceo", "fund_manager", "investments_manager", "finance_manager"]),
  AccountingPeIntegrationController.getPortfolioTotalRevenue
);

export default router;
