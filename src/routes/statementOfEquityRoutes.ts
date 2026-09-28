// @ts-nocheck
import { Router } from "express";
import { StatementOfEquityController } from "../controllers/StatementOfEquityController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

// Who may use these routes is decided by the Accounting access guard in front of every accounting router
// (src/middleware/accountingAccessGuard.ts); the role-name lists that stood here refused the Finance Manager and auditors.
const router = Router();

/**
 * @swagger
 * /api/accounting/statement-of-equity/generate:
 *   post:
 *     summary: Generate Statement of Equity for a specific period
 *     tags: [Accounting - Statement of Equity]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startDate
 *               - endDate
 *             properties:
 *               startDate:
 *                 type: string
 *                 format: date
 *                 description: Start date of the period
 *               endDate:
 *                 type: string
 *                 format: date
 *                 description: End date of the period
 *               currencyId:
 *                 type: string
 *                 description: Currency ID (optional, uses default if not provided)
 *     responses:
 *       200:
 *         description: Statement of Equity generated successfully
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/generate", authenticate, StatementOfEquityController.generateStatementOfEquity);

export default router;

