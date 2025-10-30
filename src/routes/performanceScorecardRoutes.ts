// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { PerformanceScorecardController } from "../controllers/PerformanceScorecardController";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/performance/scorecards/user:
 *   get:
 *     summary: Get user performance scorecard
 *     description: Retrieve comprehensive performance scorecard for the current user including goals, tasks, and metrics
 *     tags: [📊 Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User scorecard retrieved successfully
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
 *                   example: "User scorecard retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                         department:
 *                           type: string
 *                         role:
 *                           type: string
 *                         roleCode:
 *                           type: string
 *                     goals:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           title:
 *                             type: string
 *                           type:
 *                             type: string
 *                           category:
 *                             type: string
 *                           targetValue:
 *                             type: string
 *                           currentValue:
 *                             type: string
 *                           progressPercentage:
 *                             type: string
 *                           stage:
 *                             type: string
 *                           kpi:
 *                             type: object
 *                           parentGoal:
 *                             type: object
 *                     tasks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           title:
 *                             type: string
 *                           stage:
 *                             type: string
 *                           priority:
 *                             type: string
 *                           isOverdue:
 *                             type: boolean
 *                           goal:
 *                             type: object
 *                     metrics:
 *                       type: object
 *                       properties:
 *                         goals:
 *                           type: object
 *                           properties:
 *                             total:
 *                               type: number
 *                             completed:
 *                               type: number
 *                             inProgress:
 *                               type: number
 *                             notStarted:
 *                               type: number
 *                             completionRate:
 *                               type: string
 *                         tasks:
 *                           type: object
 *                           properties:
 *                             total:
 *                               type: number
 *                             completed:
 *                               type: number
 *                             overdue:
 *                               type: number
 *                             completionRate:
 *                               type: string
 *                         progress:
 *                           type: object
 *                           properties:
 *                             totalTargetValue:
 *                               type: number
 *                             totalCurrentValue:
 *                               type: number
 *                             progressPercentage:
 *                               type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/user", PerformanceScorecardController.getUserScorecard);

/**
 * @swagger
 * /api/performance/scorecards/department/{department}:
 *   get:
 *     summary: Get department performance scorecard
 *     description: Retrieve comprehensive performance scorecard for a specific department including goals, users, and metrics
 *     tags: [📊 Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: department
 *         required: true
 *         schema:
 *           type: string
 *           enum: [Finance, Sales, Operations, Procurement, "Human Resources", Marketing, Legal, IT]
 *         description: Department name
 *     responses:
 *       200:
 *         description: Department scorecard retrieved successfully
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
 *                   example: "Department scorecard retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     department:
 *                       type: string
 *                     goals:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           title:
 *                             type: string
 *                           type:
 *                             type: string
 *                           category:
 *                             type: string
 *                           targetValue:
 *                             type: string
 *                           currentValue:
 *                             type: string
 *                           progressPercentage:
 *                             type: string
 *                           stage:
 *                             type: string
 *                           kpi:
 *                             type: object
 *                           parentGoal:
 *                             type: object
 *                           individualGoals:
 *                             type: array
 *                             items:
 *                               type: object
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           email:
 *                             type: string
 *                           role:
 *                             type: string
 *                           roleCode:
 *                             type: string
 *                     metrics:
 *                       type: object
 *                       properties:
 *                         goals:
 *                           type: object
 *                           properties:
 *                             total:
 *                               type: number
 *                             completed:
 *                               type: number
 *                             inProgress:
 *                               type: number
 *                             completionRate:
 *                               type: string
 *                         individualGoals:
 *                           type: object
 *                           properties:
 *                             total:
 *                               type: number
 *                             completed:
 *                               type: number
 *                             completionRate:
 *                               type: string
 *                         users:
 *                           type: object
 *                           properties:
 *                             total:
 *                               type: number
 *                             managers:
 *                               type: number
 *                             officers:
 *                               type: number
 *                             members:
 *                               type: number
 *                         progress:
 *                           type: object
 *                           properties:
 *                             totalTargetValue:
 *                               type: number
 *                             totalCurrentValue:
 *                               type: number
 *                             progressPercentage:
 *                               type: string
 *       400:
 *         description: Bad request - department name is required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/department/:department", PerformanceScorecardController.getDepartmentScorecard);

export default router;