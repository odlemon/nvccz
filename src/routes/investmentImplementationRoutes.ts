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
 *         approvedById:
 *           type: string
 *         disbursedById:
 *           type: string
 *         notes:
 *           type: string
 *         transactionReference:
 *           type: string
 */

/**
 * @swagger
 * /api/investment-implementations/signed-term-sheets:
 *   get:
 *     summary: Get applications with signed term sheets
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
 *     tags: [Investment Implementation]
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
 *               applicationId:
 *                 type: string
 *               fundId:
 *                 type: string
 *                 description: ID of the fund to link this implementation to
 *               implementationPlan:
 *                 type: string
 *               assignedTeam:
 *                 type: string
 *               notes:
 *                 type: string
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
 *     tags: [Investment Implementation]
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
 *               milestoneId:
 *                 type: string
 *               amount:
 *                 type: number
 *               disbursementDate:
 *                 type: string
 *                 format: date-time
 *               disbursementType:
 *                 type: string
 *                 enum: [INITIAL, MILESTONE, FINAL]
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Fund disbursement created successfully
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
/**
 * @swagger
 * /api/investment-implementations/{investmentImplementationId}/disbursement-summary:
 *   get:
 *     summary: Get disbursement summary for an investment implementation
 *     tags: [Investment Implementation]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: investmentImplementationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Investment Implementation ID
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
 *                     totalDisbursedAmount:
 *                       type: number
 *                     remainingCommittedAmount:
 *                       type: number
 *                     disbursementCount:
 *                       type: number
 *                     disbursementMode:
 *                       type: string
 *                     disbursements:
 *                       type: array
 */
router.get('/:investmentImplementationId/disbursement-summary',
  authenticate,
  authorize(['admin', 'fund_manager']),
  InvestmentImplementationController.getDisbursementSummary
);

router.post('/disbursements', 
  authenticate, 
  authorize(['admin', 'fund_manager']), 
  InvestmentImplementationController.createFundDisbursement
);

/**
 * @swagger
 * /api/investment-implementations/disbursements/{disbursementId}/approve:
 *   post:
 *     summary: Approve fund disbursement
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
  authorize(['admin', 'fund_manager']), 
  InvestmentImplementationController.approveFundDisbursement
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
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               transactionReference:
 *                 type: string
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
  authorize(['admin', 'fund_manager']), 
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
