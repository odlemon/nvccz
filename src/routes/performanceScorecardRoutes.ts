import express from "express";
import { PerformanceScorecardController } from "../controllers/PerformanceScorecardController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     UserScorecardData:
 *       type: object
 *       properties:
 *         userId:
 *           type: string
 *         userName:
 *           type: string
 *         department:
 *           type: string
 *         role:
 *           type: string
 *         overallScore:
 *           type: number
 *         performanceCategory:
 *           type: string
 *         taskMetrics:
 *           type: object
 *           properties:
 *             totalTasks:
 *               type: integer
 *             completedTasks:
 *               type: integer
 *             overdueTasks:
 *               type: integer
 *             completionRate:
 *               type: number
 *             averageCompletionTime:
 *               type: number
 *             overdueRate:
 *               type: number
 *             qualityScore:
 *               type: number
 *         goalMetrics:
 *           type: object
 *           properties:
 *             totalGoals:
 *               type: integer
 *             achievedGoals:
 *               type: integer
 *             overdueGoals:
 *               type: integer
 *             completionRate:
 *               type: number
 *             progressSpeed:
 *               type: number
 *             overdueRate:
 *               type: number
 *             averageProgress:
 *               type: number
 *         activityMetrics:
 *           type: object
 *           properties:
 *             totalActivities:
 *               type: integer
 *             logFrequency:
 *               type: number
 *             engagementScore:
 *               type: number
 *             responseTime:
 *               type: number
 *             proactiveActions:
 *               type: integer
 *         reviewMetrics:
 *           type: object
 *           properties:
 *             totalReviews:
 *               type: integer
 *             averageScore:
 *               type: number
 *             latestScore:
 *               type: number
 *             improvementTrend:
 *               type: string
 *             lastReviewDate:
 *               type: string
 *               format: date
 *     
 *     DepartmentScorecardData:
 *       type: object
 *       properties:
 *         departmentId:
 *           type: string
 *         departmentName:
 *           type: string
 *         totalUsers:
 *           type: integer
 *         averageScore:
 *           type: number
 *         performanceCategory:
 *           type: string
 *         taskMetrics:
 *           type: object
 *           properties:
 *             totalTasks:
 *               type: integer
 *             completedTasks:
 *               type: integer
 *             overdueTasks:
 *               type: integer
 *             completionRate:
 *               type: number
 *             averageCompletionTime:
 *               type: number
 *             overdueRate:
 *               type: number
 *             qualityScore:
 *               type: number
 *         goalMetrics:
 *           type: object
 *           properties:
 *             totalGoals:
 *               type: integer
 *             achievedGoals:
 *               type: integer
 *             overdueGoals:
 *               type: integer
 *             completionRate:
 *               type: number
 *             progressSpeed:
 *               type: number
 *             overdueRate:
 *               type: number
 *             averageProgress:
 *               type: number
 *         activityMetrics:
 *           type: object
 *           properties:
 *             totalActivities:
 *               type: integer
 *             averageLogFrequency:
 *               type: number
 *             engagementScore:
 *               type: number
 *             averageResponseTime:
 *               type: number
 *             proactiveActions:
 *               type: integer
 *         reviewMetrics:
 *           type: object
 *           properties:
 *             totalReviews:
 *               type: integer
 *             averageScore:
 *               type: number
 *             completionRate:
 *               type: number
 *             improvementTrend:
 *               type: string
 *             lastReviewDate:
 *               type: string
 *               format: date
 *         performanceDistribution:
 *           type: object
 *           properties:
 *             highPerformers:
 *               type: integer
 *             averagePerformers:
 *               type: integer
 *             needsImprovement:
 *               type: integer
 *             highPerformerPercentage:
 *               type: number
 *             averagePerformerPercentage:
 *               type: number
 *             needsImprovementPercentage:
 *               type: number
 *         comparison:
 *           type: object
 *           properties:
 *             rankInCompany:
 *               type: integer
 *             vsCompanyAverage:
 *               type: string
 *             vsBestDepartment:
 *               type: string
 *             vsWorstDepartment:
 *               type: string
 */

/**
 * @swagger
 * /api/performance-scorecards/users:
 *   get:
 *     summary: Get performance scorecards for all users
 *     description: Retrieve detailed performance metrics for all users including task completion, goal achievement, activity engagement, and review scores
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Users performance scorecards retrieved successfully
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
 *                   example: Users performance scorecards retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/UserScorecardData'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/users", authenticate, authorize(["admin", "ceo", "hr_manager"]), PerformanceScorecardController.getAllUsersScorecards);

/**
 * @swagger
 * /api/performance-scorecards/departments:
 *   get:
 *     summary: Get performance scorecards for all departments
 *     description: Retrieve detailed performance metrics for all departments including aggregated user metrics, performance distribution, and company comparisons
 *     tags: [Performance Scorecards]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Departments performance scorecards retrieved successfully
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
 *                   example: Departments performance scorecards retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/DepartmentScorecardData'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/departments", authenticate, authorize(["admin", "ceo", "hr_manager"]), PerformanceScorecardController.getAllDepartmentsScorecards);

export default router;

