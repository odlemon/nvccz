// @ts-nocheck
import express from "express";
import { CEODashboardController } from "../controllers/CEODashboardController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     CEODashboardData:
 *       type: object
 *       properties:
 *         financialPerformance:
 *           type: object
 *           properties:
 *             totalAUM:
 *               type: number
 *               description: Total Assets Under Management
 *             totalFunds:
 *               type: integer
 *               description: Total number of funds
 *             activeFunds:
 *               type: integer
 *               description: Number of active funds
 *             fundPerformance:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/FundPerformanceMetrics'
 *             averageIRR:
 *               type: number
 *               description: Average Internal Rate of Return
 *             averageTVPI:
 *               type: number
 *               description: Average Total Value to Paid-In
 *             averageDPI:
 *               type: number
 *               description: Average Distributions to Paid-In
 *         investmentPipeline:
 *           $ref: '#/components/schemas/PipelineMetrics'
 *         portfolioHealth:
 *           $ref: '#/components/schemas/PortfolioValuation'
 *         operationalMetrics:
 *           $ref: '#/components/schemas/OperationalMetrics'
 *         hierarchicalTaskView:
 *           type: object
 *           properties:
 *             totalTasks:
 *               type: integer
 *             completedTasks:
 *               type: integer
 *             inProgressTasks:
 *               type: integer
 *             overdueTasks:
 *               type: integer
 *             assignedTasks:
 *               type: integer
 *             tasksByDepartment:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   departmentId:
 *                     type: string
 *                   departmentName:
 *                     type: string
 *                   total:
 *                     type: integer
 *                   completed:
 *                     type: integer
 *                   inProgress:
 *                     type: integer
 *                   overdue:
 *                     type: integer
 *         keyInsights:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [success, warning, error, info]
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               value:
 *                 type: string
 *               trend:
 *                 type: string
 *                 enum: [up, down, stable]
 *         lastUpdated:
 *           type: string
 *           format: date-time
 *     
 *     FundPerformanceMetrics:
 *       type: object
 *       properties:
 *         fundId:
 *           type: string
 *         fundName:
 *           type: string
 *         totalAmount:
 *           type: number
 *         remainingAmount:
 *           type: number
 *         disbursedAmount:
 *           type: number
 *         irr:
 *           type: number
 *           description: Internal Rate of Return percentage
 *         tvpi:
 *           type: number
 *           description: Total Value to Paid-In ratio
 *         dpi:
 *           type: number
 *           description: Distributions to Paid-In ratio
 *         portfolioCompanies:
 *           type: integer
 *         totalInvestments:
 *           type: number
 *         averageInvestmentSize:
 *           type: number
 *         status:
 *           type: string
 *     
 *     PipelineMetrics:
 *       type: object
 *       properties:
 *         totalPipelineValue:
 *           type: number
 *         totalDeals:
 *           type: integer
 *         dealsByStage:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               stage:
 *                 type: string
 *               count:
 *                 type: integer
 *               totalValue:
 *                 type: number
 *               averageValue:
 *                 type: number
 *         averageTimeToClose:
 *           type: number
 *           description: Average time to close in days
 *         conversionRates:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               fromStage:
 *                 type: string
 *               toStage:
 *                 type: string
 *               rate:
 *                 type: number
 *     
 *     PortfolioValuation:
 *       type: object
 *       properties:
 *         totalPortfolioValue:
 *           type: number
 *         totalCompanies:
 *           type: integer
 *         averageValuation:
 *           type: number
 *         sectorBreakdown:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               sector:
 *                 type: string
 *               count:
 *                 type: integer
 *               totalValue:
 *                 type: number
 *               percentage:
 *                 type: number
 *         topPerformers:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               companyId:
 *                 type: string
 *               companyName:
 *                 type: string
 *               currentValue:
 *                 type: number
 *               returnMultiple:
 *                 type: number
 *         bottomPerformers:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               companyId:
 *                 type: string
 *               companyName:
 *                 type: string
 *               currentValue:
 *                 type: number
 *               returnMultiple:
 *                 type: number
 *     
 *     OperationalMetrics:
 *       type: object
 *       properties:
 *         totalExpenses:
 *           type: number
 *         budgetedExpenses:
 *           type: number
 *         expenseVariance:
 *           type: number
 *         expenseVariancePercentage:
 *           type: number
 *         employeeHeadcount:
 *           type: integer
 *         departmentBreakdown:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               departmentId:
 *                 type: string
 *               departmentName:
 *                 type: string
 *               headcount:
 *                 type: integer
 *               percentage:
 *                 type: number
 *         taskSummary:
 *           type: object
 *           properties:
 *             total:
 *               type: integer
 *             completed:
 *               type: integer
 *             inProgress:
 *               type: integer
 *             overdue:
 *               type: integer
 *             assigned:
 *               type: integer
 */

/**
 * @swagger
 * /api/ceo-dashboard:
 *   get:
 *     summary: Get comprehensive CEO dashboard data
 *     description: Retrieve all key metrics and insights for the CEO dashboard including financial performance, investment pipeline, portfolio health, and operational metrics
 *     tags: [CEO Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: CEO dashboard data retrieved successfully
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
 *                   example: CEO dashboard data retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/CEODashboardData'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/", 
  authenticate, 
  authorize(['admin', 'ceo']), 
  CEODashboardController.getDashboard
);

/**
 * @swagger
 * /api/ceo-dashboard/drill-down/{type}/{id}:
 *   get:
 *     summary: Get drill-down data for specific entities
 *     description: Retrieve detailed information for specific entities like funds, portfolio companies, departments, or tasks
 *     tags: [CEO Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [fund, portfolio, pipeline, department, task]
 *         description: Type of entity to drill down into
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the entity
 *     responses:
 *       200:
 *         description: Drill-down data retrieved successfully
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
 *                   example: Drill-down data retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                     id:
 *                       type: string
 *                     data:
 *                       type: object
 *                     relatedData:
 *                       type: object
 *       400:
 *         description: Bad request - missing parameters
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/drill-down/:type/:id", 
  authenticate, 
  authorize(['admin', 'ceo']), 
  CEODashboardController.getDrillDown
);

/**
 * @swagger
 * /api/ceo-dashboard/fund-performance/{fundId}:
 *   get:
 *     summary: Get fund performance metrics
 *     description: Calculate and retrieve performance metrics for a specific fund including IRR, TVPI, and DPI
 *     tags: [CEO Dashboard]
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
 *         description: Fund performance calculated successfully
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
 *                   example: Fund performance calculated successfully
 *                 data:
 *                   $ref: '#/components/schemas/FundPerformanceMetrics'
 *       400:
 *         description: Bad request - fund ID required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/fund-performance/:fundId", 
  authenticate, 
  authorize(['admin', 'ceo', 'fund_manager']), 
  CEODashboardController.getFundPerformance
);

/**
 * @swagger
 * /api/ceo-dashboard/funds-performance:
 *   get:
 *     summary: Get all funds performance
 *     description: Retrieve performance metrics for all funds including AUM breakdown
 *     tags: [CEO Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All funds performance retrieved successfully
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
 *                   example: All funds performance retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     aum:
 *                       type: object
 *                     fundPerformance:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/FundPerformanceMetrics'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/funds-performance", 
  authenticate, 
  authorize(['admin', 'ceo', 'fund_manager']), 
  CEODashboardController.getAllFundsPerformance
);

/**
 * @swagger
 * /api/ceo-dashboard/pipeline-analytics:
 *   get:
 *     summary: Get investment pipeline analytics
 *     description: Retrieve comprehensive pipeline metrics including deal flow, stage analysis, and conversion rates
 *     tags: [CEO Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Investment pipeline analytics retrieved successfully
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
 *                   example: Investment pipeline analytics retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/PipelineMetrics'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/pipeline-analytics", 
  authenticate, 
  authorize(['admin', 'ceo', 'fund_manager']), 
  CEODashboardController.getPipelineAnalytics
);

/**
 * @swagger
 * /api/ceo-dashboard/portfolio-health:
 *   get:
 *     summary: Get portfolio health metrics
 *     description: Retrieve portfolio valuation, sector breakdown, and top/bottom performers
 *     tags: [CEO Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Portfolio health metrics retrieved successfully
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
 *                   example: Portfolio health metrics retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/PortfolioValuation'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/portfolio-health", 
  authenticate, 
  authorize(['admin', 'ceo', 'fund_manager']), 
  CEODashboardController.getPortfolioHealth
);

/**
 * @swagger
 * /api/ceo-dashboard/operational-metrics:
 *   get:
 *     summary: Get operational metrics
 *     description: Retrieve operational expenses, budget variance, employee headcount, and task summary
 *     tags: [CEO Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Operational metrics retrieved successfully
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
 *                   example: Operational metrics retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/OperationalMetrics'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/operational-metrics", 
  authenticate, 
  authorize(['admin', 'ceo']), 
  CEODashboardController.getOperationalMetrics
);

/**
 * @swagger
 * /api/ceo-dashboard/hierarchical-tasks:
 *   get:
 *     summary: Get hierarchical task view
 *     description: Retrieve organizational task summary with department breakdown
 *     tags: [CEO Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: departmentId
 *         schema:
 *           type: string
 *         description: Optional department ID to filter tasks
 *     responses:
 *       200:
 *         description: Hierarchical task view retrieved successfully
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
 *                   example: Hierarchical task view retrieved successfully
 *                 data:
 *                   type: object
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/hierarchical-tasks", 
  authenticate, 
  authorize(['admin', 'ceo']), 
  CEODashboardController.getHierarchicalTaskView
);

/**
 * @swagger
 * /api/ceo-dashboard/key-insights:
 *   get:
 *     summary: Get key insights and alerts
 *     description: Retrieve AI-generated insights and alerts based on current data
 *     tags: [CEO Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Key insights retrieved successfully
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
 *                   example: Key insights retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     insights:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             enum: [success, warning, error, info]
 *                           title:
 *                             type: string
 *                           description:
 *                             type: string
 *                           value:
 *                             type: string
 *                           trend:
 *                             type: string
 *                             enum: [up, down, stable]
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/key-insights", 
  authenticate, 
  authorize(['admin', 'ceo']), 
  CEODashboardController.getKeyInsights
);

/**
 * @swagger
 * /api/ceo-dashboard/real-time-metrics:
 *   get:
 *     summary: Get real-time metrics
 *     description: Retrieve specific metrics for live dashboard updates
 *     tags: [CEO Dashboard]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: metrics
 *         required: true
 *         schema:
 *           type: string
 *         description: Comma-separated list of metrics to retrieve (aum, pipeline, portfolio, operational)
 *     responses:
 *       200:
 *         description: Real-time metrics retrieved successfully
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
 *                   example: Real-time metrics retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     metrics:
 *                       type: object
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request - metrics parameter required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/real-time-metrics", 
  authenticate, 
  authorize(['admin', 'ceo']), 
  CEODashboardController.getRealTimeMetrics
);

router.get("/advanced-deal-metrics", 
  authenticate, 
  authorize(['admin', 'ceo']), 
  CEODashboardController.getAdvancedDealMetrics
);

export default router;
