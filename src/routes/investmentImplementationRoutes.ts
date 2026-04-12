//@ts-nocheck
import express from 'express';
import { InvestmentImplementationController } from '../controllers/InvestmentImplementationController';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/permissionAuth';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     InvestmentImplementation:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         portfolioCompanyId:
 *           type: string
 *         applicationId:
 *           type: string
 *         fundId:
 *           type: string
 *         initiatedById:
 *           type: string
 *         finalDueDiligence:
 *           type: boolean
 *         contractsSigned:
 *           type: boolean
 *         fundsDisbursed:
 *           type: boolean
 *         implementationPlan:
 *           type: string
 *         assignedTeam:
 *           type: string
 *         notes:
 *           type: string
 *         status:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         completedAt:
 *           type: string
 *           format: date-time
 *     InvestmentMilestone:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         investmentImplementationId:
 *           type: string
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         amount:
 *           type: number
 *         dueDate:
 *           type: string
 *           format: date-time
 *         isCompleted:
 *           type: boolean
 *         completedAt:
 *           type: string
 *           format: date-time
 *         notes:
 *           type: string
 *         deliverables:
 *           type: string
 *     FundDisbursement:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         fundId:
 *           type: string
 *         investmentImplementationId:
 *           type: string
 *         milestoneId:
 *           type: string
 *         amount:
 *           type: number
 *         disbursementDate:
 *           type: string
 *           format: date-time
 *         disbursementType:
 *           type: string
 *         status:
 *           type: string
 *           description: PENDING (awaiting CFO), DISBURSED (after CFO approve + post), REJECTED, or legacy APPROVED if not yet migrated
 *         approvedById:
 *           type: string
 *         disbursedById:
 *           type: string
 *         notes:
 *           type: string
 *         transactionReference:
 *           type: string
 *         trancheIndex:
 *           type: integer
 *           description: 1-based tranche order for this implementation (API-computed on create and summary)
 *         cfoApprovalStatusLabel:
 *           type: string
 *           example: PENDING_CFO_APPROVAL
 *           description: PENDING_CFO_APPROVAL when PENDING; REJECTED when rejected
 */

/**
 * @swagger
 * /api/investment-implementations/signed-term-sheets:
 *   get:
 *     summary: Get applications with signed term sheets
 *     tags: [Investment Implementation, Updated investment flow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Applications with signed term sheets retrieved successfully
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
 *                     applications:
 *                       type: array
 *                       items:
 *                         type: object
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 */
router.get('/signed-term-sheets', 
  authenticate, 
  authorize(['admin', 'fund_manager']), 
  InvestmentImplementationController.getApplicationsWithSignedTermSheets
);

/**
 * @swagger
 * /api/investment-implementations/initiate:
 *   post:
 *     summary: Initiate investment implementation
 *     tags: [Investment Implementation, Updated investment flow]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - portfolioCompanyId
 *               - applicationId
 *               - fundId
 *             properties:
 *               portfolioCompanyId:
 *                 type: string
 *                 example: "cmi79aihl000ajx04sc7x6ec7"
 *                 description: Portfolio company ID
 *               applicationId:
 *                 type: string
 *                 example: "cmi78trsi0000jx048i72bb7m"
 *                 description: Application ID
 *               fundId:
 *                 type: string
 *                 example: "cmjfpk2g0000lktwmt25ni8p8"
 *                 description: Fund ID to link this implementation to
 *               implementationPlan:
 *                 type: string
 *                 example: "Phase 1: Product development, Phase 2: Market launch"
 *                 description: Implementation plan details
 *               notes:
 *                 type: string
 *                 example: "Investment implementation for LY company"
 *                 description: Additional notes
 *               disbursementMode:
 *                 type: string
 *                 enum: [ONE_TIME, MILESTONE_BASED]
 *                 example: "MILESTONE_BASED"
 *                 default: "ONE_TIME"
 *                 description: Disbursement mode. Defaults to ONE_TIME if not provided.
 *               totalCommittedAmount:
 *                 type: number
 *                 example: 30000
 *                 description: Required if disbursementMode is MILESTONE_BASED. Total amount committed for this investment.
 *               commitmentCurrencyId:
 *                 type: string
 *                 description: Optional. Currency of IC cap / totalCommittedAmount (currencies.id). Defaults to system default or USD when omitted.
 *           examples:
 *             milestoneBased:
 *               summary: Milestone-based disbursement
 *               value:
 *                 portfolioCompanyId: "cmi79aihl000ajx04sc7x6ec7"
 *                 applicationId: "cmi78trsi0000jx048i72bb7m"
 *                 fundId: "cmjfpk2g0000lktwmt25ni8p8"
 *                 implementationPlan: "Phase 1: Product development, Phase 2: Market launch"
 *                 notes: "Investment implementation for LY company"
 *                 disbursementMode: "MILESTONE_BASED"
 *                 totalCommittedAmount: 30000
 *                 commitmentCurrencyId: "cmh3bymy70000una4yk8leusu"
 *             oneTime:
 *               summary: One-time disbursement
 *               value:
 *                 portfolioCompanyId: "cmi79aihl000ajx04sc7x6ec7"
 *                 applicationId: "cmi78trsi0000jx048i72bb7m"
 *                 fundId: "cmjfpk2g0000lktwmt25ni8p8"
 *                 implementationPlan: "Full investment implementation"
 *                 notes: "Investment implementation for LY company"
 *                 disbursementMode: "ONE_TIME"
 *     responses:
 *       201:
 *         description: Investment implementation initiated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/InvestmentImplementation'
 *                 message:
 *                   type: string
 */
router.post('/initiate', 
  authenticate, 
  authorize(['admin', 'fund_manager']), 
  InvestmentImplementationController.initiateInvestmentImplementation
);

/**
 * @swagger
 * /api/investment-implementations/disbursement-banks:
 *   get:
 *     summary: Banks eligible for fund disbursement approval (with GL accounts)
 *     description: JWT only. For CFO picker; optional query paymentCurrencyId matches tranche payout currency.
 *     tags: [Investment Implementation, Updated investment flow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: paymentCurrencyId
 *         schema:
 *           type: string
 *           example: "cmh3bymy70000una4yk8leusu"
 *         description: When set, only banks in this currency (currencies.id)
 *     responses:
 *       200:
 *         description: Active banks with linked chart-of-accounts GL
 */
router.get(
  '/disbursement-banks',
  authenticate,
  InvestmentImplementationController.listDisbursementBanks
);

/**
 * @swagger
 * /api/investment-implementations/{portfolioCompanyId}:
 *   get:
 *     summary: Get investment implementation by portfolio company ID
 *     tags: [Investment Implementation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: portfolioCompanyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Portfolio company ID
 *     responses:
 *       200:
 *         description: Investment implementation retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/InvestmentImplementation'
 *       404:
 *         description: Investment implementation not found
 */
router.get('/:portfolioCompanyId', 
  authenticate, 
  InvestmentImplementationController.getInvestmentImplementationByPortfolioCompanyId
);

/**
 * @swagger
 * /api/investment-implementations/{portfolioCompanyId}/checklist:
 *   put:
 *     summary: Update implementation checklist
 *     tags: [Investment Implementation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: portfolioCompanyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Portfolio company ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               finalDueDiligence:
 *                 type: boolean
 *               contractsSigned:
 *                 type: boolean
 *               fundsDisbursed:
 *                 type: boolean
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Implementation checklist updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/InvestmentImplementation'
 *                 message:
 *                   type: string
 */
router.put('/:portfolioCompanyId/checklist', 
  authenticate, 
  authorize(['admin', 'fund_manager']), 
  InvestmentImplementationController.updateImplementationChecklist
);

/**
 * @swagger
 * /api/investment-implementations/{portfolioCompanyId}/milestones:
 *   post:
 *     summary: Add milestone to implementation
 *     tags: [Investment Implementation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: portfolioCompanyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Portfolio company ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - description
 *               - amount
 *               - dueDate
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               amount:
 *                 type: number
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *               deliverables:
 *                 type: string
 *     responses:
 *       201:
 *         description: Milestone added successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/InvestmentMilestone'
 *                 message:
 *                   type: string
 */
router.post('/:portfolioCompanyId/milestones', 
  authenticate, 
  authorize(['admin', 'fund_manager']), 
  InvestmentImplementationController.addMilestone
);

/**
 * @swagger
 * /api/investment-implementations/milestones/{milestoneId}/complete:
 *   post:
 *     summary: Complete milestone
 *     tags: [Investment Implementation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: milestoneId
 *         required: true
 *         schema:
 *           type: string
 *         description: Milestone ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Milestone completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/InvestmentMilestone'
 *                 message:
 *                   type: string
 */
router.post('/milestones/:milestoneId/complete', 
  authenticate, 
  authorize(['admin', 'fund_manager']), 
  InvestmentImplementationController.completeMilestone
);

/**
 * @swagger
 * /api/investment-implementations/disbursements:
 *   post:
 *     summary: Create fund disbursement
 *     description: JWT only; no role authorize middleware.
 *     tags: [Investment Implementation, Updated investment flow]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - investmentImplementationId
 *               - amount
 *               - disbursementDate
 *               - disbursementType
 *             properties:
 *               investmentImplementationId:
 *                 type: string
 *                 example: "cmnvimpl0001ktwm9abcde01"
 *               amount:
 *                 type: number
 *                 example: 20000
 *               disbursementDate:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-04-12T12:00:00.000Z"
 *               disbursementType:
 *                 type: string
 *                 enum: [INITIAL, MILESTONE, FINAL]
 *                 example: "INITIAL"
 *               milestoneId:
 *                 type: string
 *                 description: Optional; for MILESTONE_BASED implementations
 *               notes:
 *                 type: string
 *                 example: "Tranche 1 — first draw"
 *               paymentCurrencyId:
 *                 type: string
 *                 example: "cmh3bymy70000una4yk8leusu"
 *                 description: Optional. Currency of `amount` (payout). Defaults to implementation commitment currency. If different, commitment cap uses latest system `exchange_rates` as of disbursementDate (not manual).
 *           examples:
 *             firstTranche:
 *               summary: Example — first draw
 *               value:
 *                 investmentImplementationId: "cmnvimpl0001ktwm9abcde01"
 *                 amount: 20000
 *                 disbursementDate: "2026-04-12T12:00:00.000Z"
 *                 disbursementType: "INITIAL"
 *                 notes: "Tranche 1 — first draw"
 *                 paymentCurrencyId: "cmh3bymy70000una4yk8leusu"
 *     responses:
 *       201:
 *         description: Fund disbursement created (status PENDING); data includes trancheIndex and cfoApprovalStatusLabel
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/FundDisbursement'
 *                 message:
 *                   type: string
 */
router.post('/disbursements', 
  authenticate, 
  InvestmentImplementationController.createFundDisbursement
);

/**
 * @swagger
 * /api/investment-implementations/disbursements/pending:
 *   get:
 *     summary: List PENDING fund disbursement requests (review queue)
 *     description: JWT only. Same payload shape as prior CFO queue endpoint.
 *     tags: [Investment Implementation, Updated investment flow]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending disbursements with tranche index and company context
 */
router.get(
  '/disbursements/pending',
  authenticate,
  InvestmentImplementationController.listPendingDisbursementRequests
);

/**
 * @swagger
 * /api/investment-implementations/disbursements/{disbursementId}/decision:
 *   post:
 *     summary: Approve or reject a PENDING disbursement
 *     description: Universal action. APPROVE requires bankId (payout bank), posts cashbook/GL, sets tranche DISBURSED (disbursedById/At), and moves application to DISBURSED when all tranches are disbursed. REJECT optional reason.
 *     tags: [Investment Implementation, Updated investment flow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: disbursementId
 *         required: true
 *         schema:
 *           type: string
 *           example: "cmnvpjsep0001unnsx7bwfjdi"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - decision
 *             properties:
 *               decision:
 *                 type: string
 *                 enum: [APPROVE, REJECT]
 *               bankId:
 *                 type: string
 *                 example: "cmh3bank00001unnvccbzusd01"
 *                 description: Required when decision is APPROVE (from GET /disbursement-banks)
 *               reason:
 *                 type: string
 *                 description: Optional; stored on disbursement notes when decision is REJECT
 *                 example: "Incorrect milestone evidence — please resubmit tranche request."
 *           examples:
 *             approve:
 *               summary: Example APPROVE
 *               value:
 *                 decision: "APPROVE"
 *                 bankId: "cmh3bank00001unnvccbzusd01"
 *             reject:
 *               summary: Example REJECT
 *               value:
 *                 decision: "REJECT"
 *                 reason: "Incorrect milestone evidence — please resubmit tranche request."
 *     responses:
 *       200:
 *         description: Updated fund disbursement
 */
router.post(
  '/disbursements/:disbursementId/decision',
  authenticate,
  InvestmentImplementationController.applyFundDisbursementDecision
);

/**
 * @swagger
 * /api/investment-implementations/disbursements/{disbursementId}/approve:
 *   post:
 *     summary: Approve fund disbursement (legacy)
 *     description: Same as POST .../decision with APPROVE; requires bankId. Completes disbursement (DISBURSED) in one step.
 *     tags: [Investment Implementation, Updated investment flow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: disbursementId
 *         required: true
 *         schema:
 *           type: string
 *         description: Disbursement ID
 *         example: "cmnvpjsep0001unnsx7bwfjdi"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - bankId
 *             properties:
 *               bankId:
 *                 type: string
 *                 example: "cmh3bank00001unnvccbzusd01"
 *                 description: Payout bank (from GET /disbursement-banks)
 *           examples:
 *             approveOnly:
 *               summary: Example
 *               value:
 *                 bankId: "cmh3bank00001unnvccbzusd01"
 *     responses:
 *       200:
 *         description: Fund disbursement approved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/FundDisbursement'
 *                 message:
 *                   type: string
 */
router.post('/disbursements/:disbursementId/approve', 
  authenticate, 
  InvestmentImplementationController.approveFundDisbursement
);

/**
 * @swagger
 * /api/investment-implementations/{investmentImplementationId}/disbursement-summary:
 *   get:
 *     summary: Get disbursement summary
 *     tags: [Investment Implementation, Updated investment flow]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: investmentImplementationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Investment Implementation ID
 *         example: "cmnvimpl0001ktwm9abcde01"
 *     responses:
 *       200:
 *         description: Disbursement summary retrieved successfully
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
 *                     totalCommittedAmount:
 *                       type: number
 *                       example: 30000
 *                     totalDisbursedAmount:
 *                       type: number
 *                       example: 5000
 *                     remainingCommittedAmount:
 *                       type: number
 *                       example: 25000
 *                     undrawnCommittedAmount:
 *                       type: number
 *                       example: 25000
 *                       description: Same as remainingCommittedAmount
 *                     complianceCleared:
 *                       type: boolean
 *                     kycVerified:
 *                       type: boolean
 *                     disbursementBlockedReason:
 *                       type: string
 *                       nullable: true
 *                     disbursementCount:
 *                       type: number
 *                       example: 1
 *                     disbursementMode:
 *                       type: string
 *                       example: "MILESTONE_BASED"
 *                     disbursements:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           trancheIndex:
 *                             type: integer
 *                           cfoApprovalStatusLabel:
 *                             type: string
 *                           milestoneId:
 *                             type: string
 *                           amount:
 *                             type: string
 *                           status:
 *                             type: string
 *                           disbursementType:
 *                             type: string
 *                           disbursementDate:
 *                             type: string
 *                           approvedAt:
 *                             type: string
 */
router.get('/:investmentImplementationId/disbursement-summary',
  authenticate,
  InvestmentImplementationController.getDisbursementSummary
);

/**
 * @swagger
 * /api/investment-implementations/disbursements/{disbursementId}/disburse:
 *   post:
 *     summary: Mark disbursement as disbursed
 *     tags: [Investment Implementation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: disbursementId
 *         required: true
 *         schema:
 *           type: string
 *         description: Disbursement ID
 *         example: "disb_123"
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               transactionReference:
 *                 type: string
 *                 example: "TXN-123456"
 *     responses:
 *       200:
 *         description: Fund disbursement marked as disbursed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/FundDisbursement'
 *                 message:
 *                   type: string
 */
router.post('/disbursements/:disbursementId/disburse', 
  authenticate, 
  InvestmentImplementationController.markDisbursementAsDisbursed
);

/**
 * @swagger
 * /api/investment-implementations:
 *   get:
 *     summary: Get all investment implementations
 *     tags: [Investment Implementation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Investment implementations retrieved successfully
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
 *                     implementations:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/InvestmentImplementation'
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 */
router.get('/', 
  authenticate, 
  authorize(['admin', 'fund_manager']), 
  InvestmentImplementationController.getAllInvestmentImplementations
);

export default router;
