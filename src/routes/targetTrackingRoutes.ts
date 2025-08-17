// @ts-nocheck
import { Router } from "express";
import TargetTrackingController from "../controllers/TargetTrackingController";
import { authenticate } from "../middleware/authenticate";

const router = Router();

/**
 * @swagger
 * /api/target-tracking/actual-data:
 *   get:
 *     summary: Get actual revenue, expenses, and profit data
 *     description: Retrieve actual financial data from the accounting system for tracking purposes
 *     tags: [Target Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the period (YYYY-MM-DD)
 *         example: "2024-01-01"
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the period (YYYY-MM-DD)
 *         example: "2024-12-31"
 *     responses:
 *       200:
 *         description: Actual data retrieved successfully
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
 *                   example: "Actual data retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     revenue:
 *                       type: object
 *                       properties:
 *                         amount:
 *                           type: number
 *                           example: 150000
 *                         periodStart:
 *                           type: string
 *                           format: date-time
 *                         periodEnd:
 *                           type: string
 *                           format: date-time
 *                         breakdown:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               accountId:
 *                                 type: string
 *                               accountName:
 *                                 type: string
 *                               accountNo:
 *                                 type: string
 *                               amount:
 *                                 type: number
 *                               percentage:
 *                                 type: number
 *                     expenses:
 *                       type: object
 *                       properties:
 *                         amount:
 *                           type: number
 *                           example: 75000
 *                         periodStart:
 *                           type: string
 *                           format: date-time
 *                         periodEnd:
 *                           type: string
 *                           format: date-time
 *                         breakdown:
 *                           type: array
 *                           items:
 *                             type: object
 *                     profit:
 *                       type: object
 *                       properties:
 *                         amount:
 *                           type: number
 *                           example: 75000
 *                         periodStart:
 *                           type: string
 *                           format: date-time
 *                         periodEnd:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Invalid date format
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/actual-data", authenticate, TargetTrackingController.getActualData);

/**
 * @swagger
 * /api/target-tracking/transactions:
 *   get:
 *     summary: Get detailed transaction data
 *     description: Retrieve detailed transaction data for revenue or expenses
 *     tags: [Target Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [Revenue, Expenses]
 *         description: Type of transactions to retrieve
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the period (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the period (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Transaction details retrieved successfully
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
 *                     transactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           date:
 *                             type: string
 *                             format: date-time
 *                           description:
 *                             type: string
 *                           amount:
 *                             type: number
 *                           accountName:
 *                             type: string
 *                           accountNo:
 *                             type: string
 *                           referenceNumber:
 *                             type: string
 *                     totalAmount:
 *                       type: number
 *                     periodStart:
 *                       type: string
 *                       format: date-time
 *                     periodEnd:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/transactions", authenticate, TargetTrackingController.getTransactionDetails);

/**
 * @swagger
 * /api/target-tracking/revenue:
 *   get:
 *     summary: Get revenue data only
 *     description: Retrieve revenue data with breakdown by account
 *     tags: [Target Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the period (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the period (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Revenue data retrieved successfully
 *       400:
 *         description: Invalid date format
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/revenue", authenticate, TargetTrackingController.getRevenueData);

/**
 * @swagger
 * /api/target-tracking/expenses:
 *   get:
 *     summary: Get expenses data only
 *     description: Retrieve expenses data with breakdown by account
 *     tags: [Target Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the period (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the period (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Expenses data retrieved successfully
 *       400:
 *         description: Invalid date format
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/expenses", authenticate, TargetTrackingController.getExpensesData);

/**
 * @swagger
 * /api/target-tracking/profit:
 *   get:
 *     summary: Get profit data only
 *     description: Retrieve profit data (revenue minus expenses)
 *     tags: [Target Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for the period (YYYY-MM-DD)
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for the period (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Profit data retrieved successfully
 *       400:
 *         description: Invalid date format
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/profit", authenticate, TargetTrackingController.getProfitData);

export default router;
