// @ts-nocheck
import express from "express";
import VATReportController from "../controllers/VATReportController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * /api/vat/report:
 *   get:
 *     summary: Generate VAT/Tax Report for a quarter
 *     description: |
 *       Generates a comprehensive VAT/Tax report for a specified period.
 *       Aggregates all transactions tagged with VAT, separating totals into:
 *       - Input Tax (Claimable): VAT paid on purchases/payments
 *       - Output Tax (Payable): VAT collected on sales/receipts
 *       - Net Liability: Output Tax - Input Tax
 *     tags: [VAT Reports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-01-01"
 *         description: Start date of the reporting period (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *           example: "2025-03-31"
 *         description: End date of the reporting period (YYYY-MM-DD)
 *       - in: query
 *         name: currencyId
 *         required: false
 *         schema:
 *           type: string
 *         description: Optional currency ID to filter by currency
 *     responses:
 *       200:
 *         description: VAT report generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "VAT report generated successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     period:
 *                       type: object
 *                       properties:
 *                         startDate:
 *                           type: string
 *                           format: date
 *                         endDate:
 *                           type: string
 *                           format: date
 *                         quarter:
 *                           type: string
 *                           example: "Q1 2025"
 *                     inputTax:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                           example: 1500.00
 *                         transactionCount:
 *                           type: number
 *                           example: 25
 *                         transactions:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               date:
 *                                 type: string
 *                                 format: date
 *                               reference:
 *                                 type: string
 *                               description:
 *                                 type: string
 *                               amount:
 *                                 type: number
 *                               vatAmount:
 *                                 type: number
 *                               type:
 *                                 type: string
 *                                 enum: [Receipt, Payment, Invoice, Expense, Revenue, Manual Entry]
 *                     outputTax:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                           example: 2500.00
 *                         transactionCount:
 *                           type: number
 *                           example: 30
 *                         transactions:
 *                           type: array
 *                           items:
 *                             type: object
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalInputTax:
 *                           type: number
 *                           example: 1500.00
 *                         totalOutputTax:
 *                           type: number
 *                           example: 2500.00
 *                         netLiability:
 *                           type: number
 *                           example: 1000.00
 *                           description: "Output Tax - Input Tax (positive = payable, negative = refundable)"
 *                     breakdown:
 *                       type: object
 *                       properties:
 *                         byVATCode:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               vatCode:
 *                                 type: string
 *                               inputTax:
 *                                 type: number
 *                               outputTax:
 *                                 type: number
 *                               netAmount:
 *                                 type: number
 *       400:
 *         description: Bad request - missing or invalid parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/report", VATReportController.generateVATReport);

export default router;

