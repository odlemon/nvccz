// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { RollupCalculationController } from "../controllers/RollupCalculationController";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/performance/rollup/{goalId}:
 *   get:
 *     summary: Get goal with roll-up data
 *     description: Retrieve goal details with comprehensive roll-up calculations from all child goals
 *     tags: [📈 Roll-up Calculations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *         description: Goal ID to get roll-up data for
 *     responses:
 *       200:
 *         description: Goal roll-up data retrieved successfully
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
 *                   example: "Goal roll-up data retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     goal:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         title:
 *                           type: string
 *                         type:
 *                           type: string
 *                         category:
 *                           type: string
 *                         targetUnit:
 *                           type: string
 *                           nullable: true
 *                           description: Unit for target/current (e.g. USD, %, ZiG m) — same as GET /performance/goals/{id}
 *                         targetValue:
 *                           type: string
 *                         currentValue:
 *                           type: string
 *                         progressPercentage:
 *                           type: string
 *                         stage:
 *                           type: string
 *                         kpi:
 *                           type: object
 *                     rollup:
 *                       type: object
 *                       properties:
 *                         totalSubGoals:
 *                           type: number
 *                         completedSubGoals:
 *                           type: number
 *                         inProgressSubGoals:
 *                           type: number
 *                         notStartedSubGoals:
 *                           type: number
 *                         totalTargetValue:
 *                           type: number
 *                         totalCurrentValue:
 *                           type: number
 *                         overallProgressPercentage:
 *                           type: string
 *                         departmentBreakdown:
 *                           type: array
 *                           items:
 *                             type: object
 *                         individualBreakdown:
 *                           type: array
 *                           items:
 *                             type: object
 *       400:
 *         description: Bad request - goalId is required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/:goalId", RollupCalculationController.getGoalWithRollup);

/**
 * @swagger
 * /api/performance/rollup/{goalId}/recalculate:
 *   post:
 *     summary: Recalculate all roll-up data
 *     description: Recalculate roll-up data for a goal hierarchy from bottom up
 *     tags: [📈 Roll-up Calculations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: goalId
 *         required: true
 *         schema:
 *           type: string
 *         description: Goal ID to recalculate roll-up data for
 *     responses:
 *       200:
 *         description: Roll-up data recalculated successfully
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
 *                   example: "Roll-up data recalculated successfully"
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request - goalId is required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/:goalId/recalculate", RollupCalculationController.recalculateRollups);

export default router;
