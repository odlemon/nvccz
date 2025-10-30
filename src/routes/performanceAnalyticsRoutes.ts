// @ts-nocheck
import express from "express";
import { authenticate } from "../middleware/authenticate";
import { PerformanceAnalyticsController } from "../controllers/PerformanceAnalyticsController";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/performance/analytics/kpi:
 *   get:
 *     summary: Get KPI performance analysis
 *     description: Analyze KPI performance across goals with detailed metrics and trends
 *     tags: [📊 Performance Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: kpiId
 *         schema:
 *           type: string
 *         description: Filter by specific KPI ID
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *           enum: [Finance, Sales, Operations, Procurement, "Human Resources", Marketing, Legal, IT]
 *         description: Filter by department
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for analysis period
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for analysis period
 *     responses:
 *       200:
 *         description: KPI analysis retrieved successfully
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
 *                   example: "KPI analysis retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     kpiAnalytics:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           kpi:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                               type:
 *                                 type: string
 *                               unitSymbol:
 *                                 type: string
 *                               unitPosition:
 *                                 type: string
 *                           totalGoals:
 *                             type: number
 *                           completedGoals:
 *                             type: number
 *                           inProgressGoals:
 *                             type: number
 *                           notStartedGoals:
 *                             type: number
 *                           totalTargetValue:
 *                             type: number
 *                           totalCurrentValue:
 *                             type: number
 *                           progressPercentage:
 *                             type: string
 *                           completionRate:
 *                             type: string
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalKPIs:
 *                           type: number
 *                         totalGoals:
 *                           type: number
 *                         averageProgress:
 *                           type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/kpi", PerformanceAnalyticsController.getKPIAnalysis);

/**
 * @swagger
 * /api/performance/analytics/dashboard:
 *   get:
 *     summary: Get performance dashboard data
 *     description: Retrieve comprehensive performance dashboard with key metrics and overview
 *     tags: [📊 Performance Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Performance dashboard retrieved successfully
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
 *                   example: "Performance dashboard retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     overview:
 *                       type: object
 *                       properties:
 *                         totalCompanyGoals:
 *                           type: number
 *                         totalDepartments:
 *                           type: number
 *                         totalUsers:
 *                           type: number
 *                         totalTasks:
 *                           type: number
 *                         completedTasks:
 *                           type: number
 *                         overallProgress:
 *                           type: string
 *                     companyGoals:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           title:
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
 *                           departmentCount:
 *                             type: number
 *                     departmentBreakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           department:
 *                             type: string
 *                           goalCount:
 *                             type: number
 *                     userBreakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           department:
 *                             type: string
 *                           userCount:
 *                             type: number
 *                     taskBreakdown:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           stage:
 *                             type: string
 *                           count:
 *                             type: number
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/dashboard", PerformanceAnalyticsController.getPerformanceDashboard);

/**
 * @swagger
 * /api/performance/analytics/reports:
 *   get:
 *     summary: Get goal progress reports
 *     description: Generate comprehensive goal progress reports with filtering options
 *     tags: [📊 Performance Analytics]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [company, department, individual]
 *         description: Filter by goal type
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *           enum: [Finance, Sales, Operations, Procurement, "Human Resources", Marketing, Legal, IT]
 *         description: Filter by department
 *       - in: query
 *         name: stage
 *         schema:
 *           type: string
 *           enum: [planning, in_progress, completed]
 *         description: Filter by goal stage
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for report period
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for report period
 *     responses:
 *       200:
 *         description: Goal progress reports retrieved successfully
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
 *                   example: "Goal progress reports retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     reports:
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
 *                           department:
 *                             type: string
 *                           targetValue:
 *                             type: string
 *                           currentValue:
 *                             type: string
 *                           progressPercentage:
 *                             type: string
 *                           stage:
 *                             type: string
 *                           priority:
 *                             type: string
 *                           startDate:
 *                             type: string
 *                             format: date-time
 *                           endDate:
 *                             type: string
 *                             format: date-time
 *                           kpi:
 *                             type: object
 *                           assignedTo:
 *                             type: object
 *                           createdBy:
 *                             type: object
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           updatedAt:
 *                             type: string
 *                             format: date-time
 *                     summary:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         completed:
 *                           type: number
 *                         inProgress:
 *                           type: number
 *                         planning:
 *                           type: number
 *                         averageProgress:
 *                           type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/reports", PerformanceAnalyticsController.getGoalProgressReports);

/**
 * @swagger
 * /api/performance/analytics/departments/comparison:
 *   get:
 *     summary: Get department performance comparison
 *     description: Compare performance metrics across all departments
 *     tags: [📊 Performance Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Department comparison retrieved successfully
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
 *                   example: "Department comparison retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     departments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           department:
 *                             type: string
 *                           goals:
 *                             type: object
 *                             properties:
 *                               total:
 *                                 type: number
 *                               completed:
 *                                 type: number
 *                               completionRate:
 *                                 type: string
 *                           individualGoals:
 *                             type: object
 *                             properties:
 *                               total:
 *                                 type: number
 *                               completed:
 *                                 type: number
 *                               completionRate:
 *                                 type: string
 *                           users:
 *                             type: object
 *                             properties:
 *                               total:
 *                                 type: number
 *                               managers:
 *                                 type: number
 *                               officers:
 *                                 type: number
 *                               members:
 *                                 type: number
 *                           progress:
 *                             type: object
 *                             properties:
 *                               totalTargetValue:
 *                                 type: number
 *                               totalCurrentValue:
 *                                 type: number
 *                               progressPercentage:
 *                                 type: string
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalDepartments:
 *                           type: number
 *                         averageProgress:
 *                           type: string
 *                         bestPerformingDepartment:
 *                           type: object
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/departments/comparison", PerformanceAnalyticsController.getDepartmentComparison);

export default router;
