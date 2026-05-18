// @ts-nocheck
import express from "express";
import {
  FundFeePolicyController,
  ManagementFeeController,
  DistributionController,
} from "../controllers/LpFeesAndDistributionsController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router({ mergeParams: true });

/**
 * @swagger
 * /funds/{fundId}/fee-policy:
 *   get:
 *     summary: Get the fund's LP fee policy
 *     description: |
 *       Returns the configured **management fee** (rate / base / frequency / start date)
 *       and **carry policy** (carry rate, hurdle, catch-up, waterfall type) for the fund.
 *       All values are nullable until set via `PUT /fee-policy`.
 *     tags: ['LP Fees & Distributions']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fundId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Fee policy returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 data:   { $ref: '#/components/schemas/FundFeePolicy' }
 *       404: { description: Fund not found }
 *
 *   put:
 *     summary: Create or update the fund's LP fee policy
 *     description: |
 *       Upserts the policy in one call. Rates are **fractions** (`0.02` = 2%/yr).
 *       Rules:
 *       - If `managementFeeRate` is set, `managementFeeBase` and `managementFeeFrequency` are required.
 *       - If `hurdleType` = `PREFERRED_RETURN`, `hurdleRate` is required.
 *       Any field can be cleared by sending `null`.
 *     tags: ['LP Fees & Distributions']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fundId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/FundFeePolicyUpsertRequest'
 *           examples:
 *             twoAndTwenty:
 *               summary: Classic "2 and 20" with 8% hurdle and 100% GP catch-up
 *               value:
 *                 managementFeeRate: 0.02
 *                 managementFeeBase: COMMITTED
 *                 managementFeeFrequency: QUARTERLY
 *                 managementFeeStartDate: '2025-01-01'
 *                 carryRate: 0.20
 *                 hurdleRate: 0.08
 *                 hurdleType: PREFERRED_RETURN
 *                 catchUpRate: 1.0
 *                 waterfallType: EUROPEAN
 *     responses:
 *       200:
 *         description: Policy saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 message: { type: string }
 *                 data:   { $ref: '#/components/schemas/FundFeePolicy' }
 *       400: { description: Validation error }
 */
router.get("/:fundId/fee-policy", authenticate, FundFeePolicyController.get);
router.put("/:fundId/fee-policy", authenticate, FundFeePolicyController.upsert);

/**
 * @swagger
 * /funds/{fundId}/management-fees:
 *   get:
 *     summary: List management-fee periods for the fund
 *     description: Returns all accrued/invoiced/paid management-fee periods, newest first.
 *     tags: ['LP Fees & Distributions']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fundId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: List of management fee periods }
 *
 *   post:
 *     summary: Accrue a management fee for one period
 *     description: |
 *       Computes `totalFee = feeBaseAmount × rate × (periodDays / 365)` (half-up to 2dp),
 *       splits it pro-rata across eligible LP commitments (`ACTIVE` or `PENDING`),
 *       creates the period + allocations, and posts the journal entry in one transaction:
 *
 *       - **Dr 1220** Management Fee Receivable
 *       - **Cr 4010** Management Fee Revenue
 *
 *       Default `rate` comes from `Fund.managementFeeRate`, default `feeBase` from `Fund.managementFeeBase`.
 *       Pass `rateOverride` / `feeBase` / `feeBaseAmountOverride` for one-off adjustments.
 *
 *       Fee bases:
 *       - **COMMITTED** — total LP commitments (default for blind-pool funds)
 *       - **INVESTED**  — sum of `DISBURSED` `FundDisbursement.amount`
 *       - **NAV**       — invested minus dividends received (proxy until a NAV roll-up is wired)
 *     tags: ['LP Fees & Distributions']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fundId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ManagementFeeAccrueRequest'
 *           examples:
 *             q1_2026:
 *               summary: Standard quarterly accrual using fund policy
 *               value:
 *                 periodStart: '2026-01-01'
 *                 periodEnd:   '2026-03-31'
 *                 transactionDate: '2026-03-31'
 *                 notes: 'Q1 2026 management fee accrual'
 *             ad_hoc_override:
 *               summary: One-off accrual with all overrides
 *               value:
 *                 periodStart: '2026-01-01'
 *                 periodEnd:   '2026-06-30'
 *                 feeBase: INVESTED
 *                 rateOverride: 0.015
 *                 feeBaseAmountOverride: 12000000
 *                 transactionDate: '2026-06-30'
 *                 notes: 'Mid-year reset at reduced rate'
 *     responses:
 *       201: { description: Management fee accrued }
 *       400: { description: Validation or missing fee policy }
 */
router.get("/:fundId/management-fees", authenticate, ManagementFeeController.list);
router.post("/:fundId/management-fees", authenticate, ManagementFeeController.accrue);

/**
 * @swagger
 * /funds/{fundId}/management-fees/{periodId}:
 *   get:
 *     summary: Get one management-fee period with allocations and payments
 *     tags: ['LP Fees & Distributions']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fundId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: periodId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Period details }
 *       404: { description: Not found }
 */
router.get(
  "/:fundId/management-fees/:periodId",
  authenticate,
  ManagementFeeController.getOne
);

/**
 * @swagger
 * /funds/{fundId}/management-fees/{periodId}/send-invoices:
 *   post:
 *     summary: Email management-fee invoices to each LP allocation
 *     description: |
 *       Sends one HTML email per LP allocation showing their share of the fee, commitment,
 *       rate, base, and the period. Uses the **active company letterhead**.
 *       On full success the period flips to `INVOICED` and `invoicesSentAt` is set.
 *
 *       Idempotency note: re-running this will re-send emails.
 *     tags: ['LP Fees & Distributions']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fundId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: periodId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: No body required — the action is fully driven by the period record.
 *             properties: {}
 *           examples:
 *             empty:
 *               summary: Send invoices (no body needed)
 *               value: {}
 *     responses:
 *       200: { description: Invoice dispatch report }
 *       400: { description: No valid LP emails or send failure }
 */
router.post(
  "/:fundId/management-fees/:periodId/send-invoices",
  authenticate,
  ManagementFeeController.sendInvoices
);

/**
 * @swagger
 * /funds/{fundId}/management-fees/{periodId}/allocations/{allocationId}/payments:
 *   post:
 *     summary: Record an LP payment against a management-fee allocation
 *     description: |
 *       Appends a payment row, updates `amountPaid` / `status` on the allocation,
 *       recomputes the header `status`, and posts the receipt journal entry:
 *
 *       - **Dr** cash/bank (`cashChartOfAccountId` → env → first bank GL → 1100 fallback)
 *       - **Cr 1220** Management Fee Receivable
 *
 *       Amount must be > 0 and ≤ remaining balance for this allocation.
 *     tags: ['LP Fees & Distributions']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fundId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: periodId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: allocationId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AllocationPaymentRequest'
 *           examples:
 *             full:
 *               summary: Full payment, today's date, default bank
 *               value:
 *                 amount: 25000
 *             partial:
 *               summary: Partial payment with explicit GL & date
 *               value:
 *                 amount: 10000
 *                 transactionDate: '2026-04-10'
 *                 cashChartOfAccountId: 'clx0bankglacctid'
 *     responses:
 *       200: { description: Payment recorded }
 *       400: { description: Validation error }
 */
router.post(
  "/:fundId/management-fees/:periodId/allocations/:allocationId/payments",
  authenticate,
  ManagementFeeController.recordPayment
);

/**
 * @swagger
 * /funds/{fundId}/distributions:
 *   get:
 *     summary: List distributions for the fund
 *     tags: ['LP Fees & Distributions']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fundId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Distributions, newest first }
 *
 *   post:
 *     summary: Declare a distribution (runs carry/hurdle waterfall and splits to LPs)
 *     description: |
 *       Creates a `Distribution` header and one `DistributionAllocation` per eligible LP.
 *       The waterfall uses the fund policy (`carryRate`, `hurdleType`, `hurdleRate`):
 *
 *       1. If `hurdleType=PREFERRED_RETURN`, `hurdleRate × grossAmount` is returned to LPs first.
 *       2. The remainder is split between **GP carry** (`carryRate`) and **LPs**.
 *       3. **LP net** is then allocated pro-rata by **paid-in capital** (sum of capital-call payments)
 *          — falls back to commitment-weighted split when no LP has paid in yet.
 *
 *       Journal posting (Dr/Cr):
 *       - **Dr 4100** Dividend Income (reclassifies the gross out of income into the payable)
 *       - **Cr 2400** Distributions Payable to LPs (= `netToLPs`)
 *       - **Cr 4020** Performance Fee Revenue (= `carryAmount`, when > 0)
 *
 *       `source` is one of: `DIVIDEND`, `EXIT_PROCEEDS`, `INTEREST`, `OTHER`.
 *       Optionally link to a `PortfolioCompany` (`sourceCompanyId`) and/or the originating
 *       `PortfolioCompanyDividend` (`sourceDividendId`) for traceability.
 *     tags: ['LP Fees & Distributions']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fundId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DistributionCreateRequest'
 *           examples:
 *             dividend_passthrough:
 *               summary: Pass a portfolio-company dividend through to LPs
 *               value:
 *                 distributionDate: '2026-05-30'
 *                 source: DIVIDEND
 *                 sourceCompanyId: 'cmpxxxxxxxxxxxxxxxxxxxxxxx'
 *                 sourceDividendId: 'cmdyxxxxxxxxxxxxxxxxxxxxx'
 *                 grossAmount: 250000
 *                 notes: 'FY2025 interim dividend pass-through'
 *             exit_proceeds:
 *               summary: Realized exit proceeds with 20% carry
 *               value:
 *                 distributionDate: '2026-06-15'
 *                 source: EXIT_PROCEEDS
 *                 sourceCompanyId: 'cmpxxxxxxxxxxxxxxxxxxxxxxx'
 *                 grossAmount: 5000000
 *                 carryRateOverride: 0.20
 *                 notes: 'Sale of Investee X — full liquidation'
 *     responses:
 *       201: { description: Distribution declared and JE posted }
 *       400: { description: Validation error }
 */
router.get("/:fundId/distributions", authenticate, DistributionController.list);
router.post("/:fundId/distributions", authenticate, DistributionController.create);

/**
 * @swagger
 * /funds/{fundId}/distributions/{distributionId}:
 *   get:
 *     summary: Get one distribution with allocations and payouts
 *     tags: ['LP Fees & Distributions']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fundId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: distributionId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Distribution details }
 *       404: { description: Not found }
 */
router.get(
  "/:fundId/distributions/:distributionId",
  authenticate,
  DistributionController.getOne
);

/**
 * @swagger
 * /funds/{fundId}/distributions/{distributionId}/send-notices:
 *   post:
 *     summary: Email distribution notices to each LP allocation
 *     description: |
 *       Sends one HTML email per LP allocation showing gross/carry/net, hurdle (if applied),
 *       commitment, paid-in capital, and the LP's share. Uses the **active company letterhead**.
 *       On full success the distribution flips to `NOTICES_SENT` and `noticesSentAt` is stamped.
 *     tags: ['LP Fees & Distributions']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fundId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: distributionId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: No body required.
 *             properties: {}
 *           examples:
 *             empty:
 *               summary: Send notices (no body needed)
 *               value: {}
 *     responses:
 *       200: { description: Notice dispatch report }
 *       400: { description: No valid LP emails or send failure }
 */
router.post(
  "/:fundId/distributions/:distributionId/send-notices",
  authenticate,
  DistributionController.sendNotices
);

/**
 * @swagger
 * /funds/{fundId}/distributions/{distributionId}/allocations/{allocationId}/payouts:
 *   post:
 *     summary: Record a payout to an LP for one distribution allocation
 *     description: |
 *       Appends a payment row, updates `amountPaid` / `status`, recomputes the header `status`,
 *       and posts the payout journal entry:
 *
 *       - **Dr 2400** Distributions Payable to LPs
 *       - **Cr** cash/bank (`cashChartOfAccountId` → env → first bank GL → 1100 fallback)
 *
 *       Amount must be > 0 and ≤ remaining balance for this allocation.
 *     tags: ['LP Fees & Distributions']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fundId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: distributionId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: allocationId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/AllocationPaymentRequest'
 *           examples:
 *             full:
 *               summary: Full payout, today's date, default bank
 *               value:
 *                 amount: 80000
 *             partial:
 *               summary: Partial payout with explicit GL & date
 *               value:
 *                 amount: 50000
 *                 transactionDate: '2026-06-20'
 *                 cashChartOfAccountId: 'clx0bankglacctid'
 *     responses:
 *       200: { description: Payout recorded }
 *       400: { description: Validation error }
 */
router.post(
  "/:fundId/distributions/:distributionId/allocations/:allocationId/payouts",
  authenticate,
  DistributionController.recordPayout
);

export default router;
