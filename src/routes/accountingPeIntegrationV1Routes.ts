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
 *       with **6 decimal places** for manual performance sync (`endpointPath` must include `/v1/`).
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
 *                           example: 16.324567
 *                         precisionDigits:
 *                           type: integer
 *                           example: 6
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

export default router;
