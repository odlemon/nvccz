//@ts-nocheck
import express from 'express';
import { FundController } from '../controllers/FundController';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/permissionAuth';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Fund:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         totalAmount:
 *           type: number
 *         remainingAmount:
 *           type: number
 *         minInvestment:
 *           type: number
 *         maxInvestment:
 *           type: number
 *         focusIndustries:
 *           type: array
 *           items:
 *             type: string
 *         applicationStart:
 *           type: string
 *           format: date-time
 *         applicationEnd:
 *           type: string
 *           format: date-time
 *         status:
 *           type: string
 *           enum: [OPEN, CLOSED, COMING_SOON]
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/funds:
 *   post:
 *     summary: Create a new fund
 *     tags: [Fund Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *               - totalAmount
 *               - minInvestment
 *               - maxInvestment
 *               - focusIndustries
 *               - applicationStart
 *               - applicationEnd
 *             note: createdById is automatically extracted from the authenticated user
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               totalAmount:
 *                 type: number
 *               minInvestment:
 *                 type: number
 *               maxInvestment:
 *                 type: number
 *               focusIndustries:
 *                 type: array
 *                 items:
 *                   type: string
 *               applicationStart:
 *                 type: string
 *                 format: date-time
 *               applicationEnd:
 *                 type: string
 *                 format: date-time
 *               status:
 *                 type: string
 *                 enum: [OPEN, CLOSED, COMING_SOON]
 *     responses:
 *       201:
 *         description: Fund created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Fund'
 *                 message:
 *                   type: string
 */
router.post('/', 
  authenticate, 
  authorize(['admin']), 
  FundController.createFund
);

/**
 * @swagger
 * /api/funds:
 *   get:
 *     summary: Get all funds with filtering
 *     tags: [Fund Management]
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
 *           enum: [OPEN, CLOSED, COMING_SOON]
 *         description: Filter by status
 *       - in: query
 *         name: industry
 *         schema:
 *           type: string
 *         description: Filter by industry focus
 *       - in: query
 *         name: minAvailableBalance
 *         schema:
 *           type: number
 *         description: Minimum available balance
 *       - in: query
 *         name: maxAvailableBalance
 *         schema:
 *           type: number
 *         description: Maximum available balance
 *     responses:
 *       200:
 *         description: Funds retrieved successfully
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
 *                     funds:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Fund'
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
  FundController.getAllFunds
);

/**
 * @swagger
 * /api/funds/statistics:
 *   get:
 *     summary: Get fund statistics
 *     tags: [Fund Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Fund statistics retrieved successfully
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
 *                     totalFunds:
 *                       type: integer
 *                     openFunds:
 *                       type: integer
 *                     closedFunds:
 *                       type: integer
 *                     comingSoonFunds:
 *                       type: integer
 *                     totalAmount:
 *                       type: number
 *                     totalRemainingAmount:
 *                       type: number
 *                     totalDisbursedAmount:
 *                       type: number
 */
router.get('/statistics', 
  authenticate, 
  authorize(['admin', 'fund_manager']), 
  FundController.getFundStatistics
);

/**
 * @swagger
 * /api/funds/{fundId}:
 *   get:
 *     summary: Get fund by ID
 *     tags: [Fund Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fundId
 *         required: true
 *         schema:
 *           type: string
 *         description: Fund ID
 *     responses:
 *       200:
 *         description: Fund retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Fund'
 *       404:
 *         description: Fund not found
 */
router.get('/:fundId', 
  authenticate, 
  authorize(['admin', 'fund_manager']), 
  FundController.getFundById
);

/**
 * @swagger
 * /api/funds/{fundId}:
 *   put:
 *     summary: Update fund details
 *     tags: [Fund Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fundId
 *         required: true
 *         schema:
 *           type: string
 *         description: Fund ID
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               totalAmount:
 *                 type: number
 *               minInvestment:
 *                 type: number
 *               maxInvestment:
 *                 type: number
 *               focusIndustries:
 *                 type: array
 *                 items:
 *                   type: string
 *               applicationStart:
 *                 type: string
 *                 format: date-time
 *               applicationEnd:
 *                 type: string
 *                 format: date-time
 *               status:
 *                 type: string
 *                 enum: [OPEN, CLOSED, COMING_SOON]
 *     responses:
 *       200:
 *         description: Fund updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Fund'
 *                 message:
 *                   type: string
 */
router.put('/:fundId', 
  authenticate, 
  authorize(['admin']), 
  FundController.updateFund
);

/**
 * @swagger
 * /api/funds/{fundId}/close:
 *   post:
 *     summary: Close a fund
 *     tags: [Fund Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: fundId
 *         required: true
 *         schema:
 *           type: string
 *         description: Fund ID
 *     responses:
 *       200:
 *         description: Fund closed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Fund'
 *                 message:
 *                   type: string
 */
router.post('/:fundId/close', 
  authenticate, 
  authorize(['admin']), 
  FundController.closeFund
);

/**
 * @swagger
 * /api/funds/industry/{industry}:
 *   get:
 *     summary: Get funds by industry focus
 *     tags: [Fund Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: industry
 *         required: true
 *         schema:
 *           type: string
 *         description: Industry name
 *     responses:
 *       200:
 *         description: Funds retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Fund'
 */
router.get('/industry/:industry', 
  authenticate, 
  authorize(['admin', 'fund_manager']), 
  FundController.getFundsByIndustry
);

/**
 * @swagger
 * /api/funds/status/{status}:
 *   get:
 *     summary: Get funds by status
 *     tags: [Fund Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [OPEN, CLOSED, COMING_SOON]
 *         description: Fund status
 *     responses:
 *       200:
 *         description: Funds retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Fund'
 */
router.get('/status/:status', 
  authenticate, 
  authorize(['admin', 'fund_manager']), 
  FundController.getFundsByStatus
);

/**
 * @swagger
 * /api/funds/balance/{minBalance}/{maxBalance}:
 *   get:
 *     summary: Get funds by available balance range
 *     tags: [Fund Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: minBalance
 *         required: true
 *         schema:
 *           type: number
 *         description: Minimum available balance
 *       - in: path
 *         name: maxBalance
 *         required: true
 *         schema:
 *           type: number
 *         description: Maximum available balance
 *     responses:
 *       200:
 *         description: Funds retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Fund'
 */
router.get('/balance/:minBalance/:maxBalance', 
  authenticate, 
  authorize(['admin', 'fund_manager']), 
  FundController.getFundsByAvailableBalance
);

export default router;
