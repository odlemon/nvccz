// @ts-nocheck
import { Router } from "express";
import { PerformanceDashboardController } from "../controllers/PerformanceDashboardController";
import { authenticate } from "../middleware/authenticate";

const router = Router();

/**
 * @swagger
 * tags:
 *   name: Dashboards
 *   description: Dashboard endpoints for comprehensive data visualization - Accounting, Payroll, Performance, and Portfolio Management dashboards with filtering capabilities
 */

/**
 * @swagger
 * /performance/dashboard:
 *   get:
 *     summary: Get performance dashboard data
 *     description: Returns comprehensive performance dashboard data including task metrics, monthly productivity, performance distribution, worker insights, budget tracker, and employee of the month
 *     tags: [Dashboards]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: month
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 12
 *         description: Month (1-12), or `all`. Omit with `year` for full-calendar-year scope (UI “All Months”).
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *         description: Year. Defaults to current year.
 *     responses:
 *       200:
 *         description: Dashboard data retrieved successfully
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
 *                   example: "Performance dashboard data retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     summaryCards:
 *                       type: object
 *                       properties:
 *                         pendingTasks:
 *                           type: object
 *                           properties:
 *                             value:
 *                               type: number
 *                               example: 21
 *                             change:
 *                               type: number
 *                               example: 2
 *                             changePercent:
 *                               type: number
 *                               example: 11
 *                             progress:
 *                               type: number
 *                               example: 0.42
 *                             total:
 *                               type: number
 *                               example: 50
 *                         inProgress:
 *                           type: object
 *                           properties:
 *                             value:
 *                               type: number
 *                               example: 18
 *                             change:
 *                               type: number
 *                               example: 1
 *                             changePercent:
 *                               type: number
 *                               example: 9
 *                             progress:
 *                               type: number
 *                               example: 0.36
 *                             total:
 *                               type: number
 *                               example: 50
 *                         completed:
 *                           type: object
 *                           properties:
 *                             value:
 *                               type: number
 *                               example: 33
 *                             change:
 *                               type: number
 *                               example: -5
 *                             changePercent:
 *                               type: number
 *                               example: -16
 *                             progress:
 *                               type: number
 *                               example: 0.66
 *                             total:
 *                               type: number
 *                               example: 50
 *                         completionRate:
 *                           type: object
 *                           properties:
 *                             value:
 *                               type: number
 *                               example: 26
 *                             change:
 *                               type: number
 *                               example: 3
 *                             changePercent:
 *                               type: number
 *                               example: 12
 *                     monthlyProductivity:
 *                       type: array
 *                       description: Last 12 months of task completion rates
 *                       items:
 *                         type: object
 *                         properties:
 *                           month:
 *                             type: string
 *                             example: "Jan"
 *                           monthNumber:
 *                             type: number
 *                             example: 1
 *                           year:
 *                             type: number
 *                             example: 2025
 *                           taskCompletedRate:
 *                             type: number
 *                             example: 45
 *                     performanceDistribution:
 *                       type: object
 *                       properties:
 *                         highPerformers:
 *                           type: number
 *                           example: 30
 *                           description: Percentage of high performers (>=70% completion rate)
 *                         average:
 *                           type: number
 *                           example: 25
 *                           description: Percentage of average performers (40-69% completion rate)
 *                         needImprovement:
 *                           type: number
 *                           example: 45
 *                           description: Percentage needing improvement (<40% completion rate)
 *                     workerPerformance:
 *                       type: array
 *                       description: List of workers with their performance metrics
 *                       items:
 *                         type: object
 *                         properties:
 *                           userId:
 *                             type: string
 *                           name:
 *                             type: string
 *                             example: "John Doe"
 *                           pictureUrl:
 *                             type: string
 *                             nullable: true
 *                           role:
 *                             type: string
 *                             example: "Full Time"
 *                           department:
 *                             type: string
 *                             example: "Marketing"
 *                           taskCount:
 *                             type: number
 *                             example: 12
 *                           progressPercentage:
 *                             type: number
 *                             example: 85.5
 *                     budgetTracker:
 *                       type: object
 *                       properties:
 *                         totalBudget:
 *                           type: number
 *                           example: 80000
 *                         totalSpend:
 *                           type: number
 *                           example: 60000
 *                         remaining:
 *                           type: number
 *                           example: 20000
 *                         percentageUsed:
 *                           type: number
 *                           description: Capped at 100 for UI when over budget
 *                           example: 75
 *                         overBudget:
 *                           type: boolean
 *                           example: false
 *                         lineItems:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               name: { type: string, example: Salaries and Wages }
 *                               budgeted: { type: number }
 *                               actual: { type: number }
 *                     employeeOfTheMonth:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         userId:
 *                           type: string
 *                         name:
 *                           type: string
 *                           example: "Eva Chowdary"
 *                         role:
 *                           type: string
 *                           example: "UI/UX Designer"
 *                         department:
 *                           type: string
 *                           example: "IT"
 *                         email:
 *                           type: string
 *                           example: "example@gmail.com"
 *                         taskCount:
 *                           type: number
 *                           description: Total tasks the user was on this month
 *                           example: 15
 *                         tasksCompleted:
 *                           type: number
 *                           example: 12
 *                         tasksInProgress:
 *                           type: number
 *                           example: 2
 *                         tasksPending:
 *                           type: number
 *                           example: 1
 *                         completionRate:
 *                           type: number
 *                           description: tasksCompleted / taskCount * 100
 *                           example: 80
 *                     period:
 *                       type: object
 *                       properties:
 *                         currentMonth:
 *                           type: number
 *                         currentYear:
 *                           type: number
 *                         startDate:
 *                           type: string
 *                           format: date-time
 *                         endDate:
 *                           type: string
 *                           format: date-time
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized - Invalid or missing authentication token
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: false
 *                 error:
 *                   type: string
 *                   example: "Failed to get performance dashboard"
 *                 details:
 *                   type: string
 */
router.get(
  "/",
  authenticate,
  PerformanceDashboardController.getDashboard
);

export default router;
