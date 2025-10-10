// @ts-nocheck
import { Router } from 'express';
import { TrialBalanceController } from '../controllers/TrialBalanceController';
import { authenticate } from '../middleware/authenticate';

const router = Router();

/**
 * @swagger
 * /api/accounting/trial-balance:
 *   get:
 *     summary: Generate trial balance for a specific date
 *     tags: [Trial Balance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Date for trial balance (YYYY-MM-DD). Defaults to current date if not provided.
 *     responses:
 *       200:
 *         description: Trial balance generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     date:
 *                       type: string
 *                     accounts:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           accountId:
 *                             type: string
 *                           accountName:
 *                             type: string
 *                           accountNo:
 *                             type: string
 *                           accountType:
 *                             type: string
 *                           debitBalance:
 *                             type: number
 *                           creditBalance:
 *                             type: number
 *                           netBalance:
 *                             type: number
 *                     totals:
 *                       type: object
 *                       properties:
 *                         totalDebits:
 *                           type: number
 *                         totalCredits:
 *                           type: number
 *                         isBalanced:
 *                           type: boolean
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticate, TrialBalanceController.generateTrialBalance);

/**
 * @swagger
 * /api/accounting/trial-balance/summary:
 *   get:
 *     summary: Get trial balance summary
 *     tags: [Trial Balance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Date for trial balance (YYYY-MM-DD). Defaults to current date if not provided.
 *     responses:
 *       200:
 *         description: Trial balance summary retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalAccounts:
 *                       type: number
 *                     totalDebits:
 *                       type: number
 *                     totalCredits:
 *                       type: number
 *                     isBalanced:
 *                       type: boolean
 *                     balanceDifference:
 *                       type: number
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/summary', authenticate, TrialBalanceController.getTrialBalanceSummary);

/**
 * @swagger
 * /api/accounting/trial-balance/by-account-type:
 *   get:
 *     summary: Get trial balance grouped by account type
 *     tags: [Trial Balance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: date
 *         required: false
 *         schema:
 *           type: string
 *           format: date
 *         description: Date for trial balance (YYYY-MM-DD). Defaults to current date if not provided.
 *     responses:
 *       200:
 *         description: Trial balance by account type retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   additionalProperties:
 *                     type: object
 *                     properties:
 *                       accounts:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             accountId:
 *                               type: string
 *                             accountName:
 *                               type: string
 *                             accountNo:
 *                               type: string
 *                             accountType:
 *                               type: string
 *                             debitBalance:
 *                               type: number
 *                             creditBalance:
 *                               type: number
 *                             netBalance:
 *                               type: number
 *                       totalDebits:
 *                         type: number
 *                       totalCredits:
 *                         type: number
 *                       netBalance:
 *                         type: number
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/by-account-type', authenticate, TrialBalanceController.getTrialBalanceByAccountType);

export default router;
