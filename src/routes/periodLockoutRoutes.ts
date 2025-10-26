// @ts-nocheck
// Period Lockout Routes
// Handles period lockout functionality

import express from "express";
import PeriodLockoutController from "../controllers/PeriodLockoutController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * /api/cashbook/periods/lock:
 *   post:
 *     summary: Lock/unlock accounting period
 *     description: Lock or unlock an accounting period to prevent transactions
 *     tags: [Period Lockout]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - period
 *               - isLocked
 *             properties:
 *               period:
 *                 type: string
 *                 pattern: '^\d{4}-\d{2}$'
 *                 description: Accounting period in YYYY-MM format
 *                 example: "2024-01"
 *               isLocked:
 *                 type: boolean
 *                 description: Whether to lock or unlock the period
 *               reason:
 *                 type: string
 *                 description: Reason for locking/unlocking the period
 *     responses:
 *       200:
 *         description: Period locked/unlocked successfully
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
 *       400:
 *         description: Bad request - Invalid period format or missing fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/lock', PeriodLockoutController.lockPeriod);

/**
 * @swagger
 * /api/cashbook/periods/{period}/status:
 *   get:
 *     summary: Get period lockout status
 *     description: Check if a specific accounting period is locked
 *     tags: [Period Lockout]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: period
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{4}-\d{2}$'
 *         description: Accounting period in YYYY-MM format
 *         example: "2024-01"
 *     responses:
 *       200:
 *         description: Period status retrieved successfully
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
 *                     period:
 *                       type: string
 *                     isLocked:
 *                       type: boolean
 *                     lockedAt:
 *                       type: string
 *                       format: date-time
 *                     lockedBy:
 *                       type: object
 *                     reason:
 *                       type: string
 *       400:
 *         description: Bad request - Invalid period format
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/:period/status', PeriodLockoutController.getPeriodStatus);

/**
 * @swagger
 * /api/cashbook/periods:
 *   get:
 *     summary: Get all periods with lockout status
 *     description: Retrieve all accounting periods with their lockout status
 *     tags: [Period Lockout]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Filter by year
 *         example: 2024
 *       - in: query
 *         name: isLocked
 *         schema:
 *           type: boolean
 *         description: Filter by lockout status
 *     responses:
 *       200:
 *         description: Periods retrieved successfully
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
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/', PeriodLockoutController.getAllPeriods);

/**
 * @swagger
 * /api/cashbook/periods/validate-date:
 *   post:
 *     summary: Validate transaction date against period lockout
 *     description: Check if a transaction can be created on a specific date
 *     tags: [Period Lockout]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionDate
 *             properties:
 *               transactionDate:
 *                 type: string
 *                 format: date-time
 *                 description: Transaction date to validate
 *     responses:
 *       200:
 *         description: Transaction date is valid
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       403:
 *         description: Forbidden - Period is locked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Cannot create transaction in locked period: 2024-01"
 *       400:
 *         description: Bad request - Invalid date format
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/validate-date', PeriodLockoutController.validateTransactionDate);

/**
 * @swagger
 * /api/cashbook/periods/{period}/history:
 *   get:
 *     summary: Get lockout history for a period
 *     description: Retrieve the lockout/unlock history for a specific period
 *     tags: [Period Lockout]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: period
 *         required: true
 *         schema:
 *           type: string
 *           pattern: '^\d{4}-\d{2}$'
 *         description: Accounting period in YYYY-MM format
 *         example: "2024-01"
 *     responses:
 *       200:
 *         description: Lockout history retrieved successfully
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
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Bad request - Invalid period format
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/:period/history', PeriodLockoutController.getLockoutHistory);

export default router;

