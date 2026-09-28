// @ts-nocheck
import express from "express";
import { EnhancedGoalTrackingController } from "../controllers/EnhancedGoalTrackingController";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard"
import { goalRule, orgOnly } from "../services/PerformanceScope";

const router = express.Router();
const READ_KEYS = ["performance.goals.view", "performance.goals.manage"]
const WRITE_KEYS = ["performance.goals.manage"]
const guard = methodGuard(READ_KEYS, WRITE_KEYS)

/**
 * @swagger
 * components:
 *   schemas:
 *     GoalTrackingResult:
 *       type: object
 *       properties:
 *         goalId:
 *           type: string
 *           description: Goal ID
 *         currentValue:
 *           type: number
 *           description: Current progress value
 *         targetValue:
 *           type: number
 *           description: Target value
 *         isSuccess:
 *           type: boolean
 *           description: Whether goal is achieved
 *         progressPercentage:
 *           type: number
 *           description: Progress percentage
 *         status:
 *           type: string
 *           description: Goal status
 *         lastCheckDate:
 *           type: string
 *           format: date-time
 *           description: Last check date
 *         nextCheckDate:
 *           type: string
 *           format: date-time
 *           description: Next check date
 */

/**
 * @swagger
 * /api/performance/goal-tracking/{goalId}:
 *   post:
 *     summary: Check goal status
 *     tags: [Enhanced Goal Tracking]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *         description: Goal ID
 *     responses:
 *       200:
 *         description: Goal status checked successfully
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
 *                   $ref: '#/components/schemas/GoalTrackingResult'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */


/**
 * @swagger
 * /api/performance/goal-tracking/check-all:
 *   post:
 *     summary: Check all due goals
 *     tags: [Enhanced Goal Tracking]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All due goals checked successfully
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
 *                     totalChecked:
 *                       type: number
 *                     results:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/GoalTrackingResult'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/check-all", authenticate, guard, orgOnly(), EnhancedGoalTrackingController.checkAllDueGoals);

/**
 * @swagger
 * /api/performance/goal-tracking/schedule:
 *   post:
 *     summary: Schedule goal tracking (for cron jobs)
 *     tags: [Enhanced Goal Tracking]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Goal tracking scheduled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/schedule", authenticate, guard, orgOnly(), EnhancedGoalTrackingController.scheduleGoalTracking);

/**
 * @swagger
 * /api/performance/goal-tracking/stats:
 *   get:
 *     summary: Get goal tracking statistics
 *     tags: [Enhanced Goal Tracking]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Goal tracking statistics retrieved successfully
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
 *                     totalGoals:
 *                       type: number
 *                     achievedGoals:
 *                       type: number
 *                     behindGoals:
 *                       type: number
 *                     aheadGoals:
 *                       type: number
 *                     averageProgress:
 *                       type: number
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/stats", authenticate, guard, EnhancedGoalTrackingController.getGoalTrackingStats);
// declared after the fixed paths above: as the first route it swallowed "/check-all" and "/schedule" (goalId = "check-all")
router.post("/:goalId", authenticate, guard, goalRule("goalId", "write"), EnhancedGoalTrackingController.checkGoalStatus);

export default router;
