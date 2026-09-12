// @ts-nocheck
import express from "express";
import { AutomatedReportingController } from "../controllers/AutomatedReportingController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     ReportTemplate:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         name:
 *           type: string
 *         description:
 *           type: string
 *         reportType:
 *           type: string
 *           enum: [VARIANCE, TURNOVER, RECONCILIATION, PERFORMANCE, STAKEHOLDER, DEAL_METRICS]
 *         category:
 *           type: string
 *           enum: [FINANCIAL, OPERATIONAL, PERFORMANCE, COMPLIANCE]
 *         frequency:
 *           type: string
 *           enum: [DAILY, WEEKLY, MONTHLY, QUARTERLY, ANNUALLY, ON_DEMAND]
 *         schedule:
 *           type: string
 *         isActive:
 *           type: boolean
 *         template:
 *           type: object
 *         parameters:
 *           type: object
 *         recipients:
 *           type: array
 *           items:
 *             type: string
 *         createdBy:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     
 *     GeneratedReport:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         templateId:
 *           type: string
 *         reportName:
 *           type: string
 *         reportType:
 *           type: string
 *         reportPeriod:
 *           type: string
 *         status:
 *           type: string
 *           enum: [GENERATING, COMPLETED, FAILED, DELIVERED]
 *         data:
 *           type: object
 *         summary:
 *           type: string
 *         insights:
 *           type: array
 *           items:
 *             type: object
 *         recommendations:
 *           type: array
 *           items:
 *             type: object
 *         generatedAt:
 *           type: string
 *           format: date-time
 *         deliveredAt:
 *           type: string
 *           format: date-time
 *         recipients:
 *           type: array
 *           items:
 *             type: string
 *         fileUrl:
 *           type: string
 *         fileName:
 *           type: string
 *         fileSize:
 *           type: integer
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     
 *     VarianceReport:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         reportPeriod:
 *           type: string
 *         reportType:
 *           type: string
 *           enum: [MONTHLY, QUARTERLY, ANNUAL]
 *         status:
 *           type: string
 *           enum: [DRAFT, COMPLETED, APPROVED]
 *         actualExpenses:
 *           type: number
 *         budgetedExpenses:
 *           type: number
 *         variance:
 *           type: number
 *         variancePercentage:
 *           type: number
 *         significantVariances:
 *           type: array
 *           items:
 *             type: object
 *         explanations:
 *           type: array
 *           items:
 *             type: object
 *         actionItems:
 *           type: array
 *           items:
 *             type: object
 *         preparedBy:
 *           type: string
 *         approvedBy:
 *           type: string
 *         approvedAt:
 *           type: string
 *           format: date-time
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     
 *     TurnoverAnalysisReport:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         reportPeriod:
 *           type: string
 *         reportType:
 *           type: string
 *           enum: [QUARTERLY, ANNUAL]
 *         status:
 *           type: string
 *           enum: [DRAFT, COMPLETED, APPROVED]
 *         totalEmployees:
 *           type: integer
 *         employeesLeft:
 *           type: integer
 *         turnoverRate:
 *           type: number
 *         voluntaryTurnover:
 *           type: integer
 *         involuntaryTurnover:
 *           type: integer
 *         departmentBreakdown:
 *           type: object
 *         roleBreakdown:
 *           type: object
 *         tenureBreakdown:
 *           type: object
 *         exitInterviewData:
 *           type: object
 *         commonReasons:
 *           type: array
 *           items:
 *             type: object
 *         retentionRecommendations:
 *           type: array
 *           items:
 *             type: object
 *         preparedBy:
 *           type: string
 *         approvedBy:
 *           type: string
 *         approvedAt:
 *           type: string
 *           format: date-time
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /api/automated-reporting/templates:
 *   post:
 *     summary: Create a new report template
 *     description: Create a new report template for automated report generation
 *     tags: [Automated Reporting]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - reportType
 *               - category
 *               - frequency
 *               - template
 *               - parameters
 *               - recipients
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               reportType:
 *                 type: string
 *                 enum: [VARIANCE, TURNOVER, RECONCILIATION, PERFORMANCE, STAKEHOLDER, DEAL_METRICS]
 *               category:
 *                 type: string
 *                 enum: [FINANCIAL, OPERATIONAL, PERFORMANCE, COMPLIANCE]
 *               frequency:
 *                 type: string
 *                 enum: [DAILY, WEEKLY, MONTHLY, QUARTERLY, ANNUALLY, ON_DEMAND]
 *               schedule:
 *                 type: string
 *               template:
 *                 type: object
 *               parameters:
 *                 type: object
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Report template created successfully
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
 *                   example: Report template created successfully
 *                 data:
 *                   $ref: '#/components/schemas/ReportTemplate'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/templates", authenticate, authorize(["admin", "accountant", "finance_manager", "cfo"]), AutomatedReportingController.createReportTemplate);

/**
 * @swagger
 * /api/automated-reporting/templates:
 *   get:
 *     summary: Get all report templates
 *     description: Retrieve all report templates with pagination and filtering
 *     tags: [Automated Reporting]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of items per page
 *       - in: query
 *         name: reportType
 *         schema:
 *           type: string
 *           enum: [VARIANCE, TURNOVER, RECONCILIATION, PERFORMANCE, STAKEHOLDER, DEAL_METRICS]
 *         description: Filter by report type
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [FINANCIAL, OPERATIONAL, PERFORMANCE, COMPLIANCE]
 *         description: Filter by category
 *       - in: query
 *         name: frequency
 *         schema:
 *           type: string
 *           enum: [DAILY, WEEKLY, MONTHLY, QUARTERLY, ANNUALLY, ON_DEMAND]
 *         description: Filter by frequency
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or description
 *     responses:
 *       200:
 *         description: Report templates retrieved successfully
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
 *                   example: Report templates retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     templates:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/ReportTemplate'
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         limit:
 *                           type: integer
 *                         total:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/templates", authenticate, authorize(["admin", "accountant", "finance_manager", "cfo"]), AutomatedReportingController.getAllReportTemplates);

/**
 * @swagger
 * /api/automated-reporting/analytics:
 *   get:
 *     summary: Get reporting analytics
 *     description: Retrieve reporting analytics including template and report statistics
 *     tags: [Automated Reporting]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Reporting analytics retrieved successfully
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
 *                   example: Reporting analytics retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalTemplates:
 *                       type: integer
 *                     activeTemplates:
 *                       type: integer
 *                     totalReports:
 *                       type: integer
 *                     reportsByType:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           reportType:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     reportsByStatus:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           status:
 *                             type: string
 *                           count:
 *                             type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/analytics", authenticate, authorize(["admin", "accountant", "finance_manager", "cfo"]), AutomatedReportingController.getReportingAnalytics);

/**
 * @swagger
 * /api/automated-reporting/templates/{id}:
 *   get:
 *     summary: Get report template by ID
 *     description: Retrieve a specific report template by its ID
 *     tags: [Automated Reporting]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Report template ID
 *     responses:
 *       200:
 *         description: Report template retrieved successfully
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
 *                   example: Report template retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/ReportTemplate'
 *       404:
 *         description: Report template not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/templates/:id", authenticate, authorize(["admin", "accountant", "finance_manager", "cfo"]), AutomatedReportingController.getReportTemplateById);

/**
 * @swagger
 * /api/automated-reporting/templates/{id}:
 *   put:
 *     summary: Update report template
 *     description: Update an existing report template
 *     tags: [Automated Reporting]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Report template ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               reportType:
 *                 type: string
 *                 enum: [VARIANCE, TURNOVER, RECONCILIATION, PERFORMANCE, STAKEHOLDER, DEAL_METRICS]
 *               category:
 *                 type: string
 *                 enum: [FINANCIAL, OPERATIONAL, PERFORMANCE, COMPLIANCE]
 *               frequency:
 *                 type: string
 *                 enum: [DAILY, WEEKLY, MONTHLY, QUARTERLY, ANNUALLY, ON_DEMAND]
 *               schedule:
 *                 type: string
 *               template:
 *                 type: object
 *               parameters:
 *                 type: object
 *               recipients:
 *                 type: array
 *                 items:
 *                   type: string
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Report template updated successfully
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
 *                   example: Report template updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/ReportTemplate'
 *       404:
 *         description: Report template not found
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put("/templates/:id", authenticate, authorize(["admin", "accountant", "finance_manager", "cfo"]), AutomatedReportingController.updateReportTemplate);

/**
 * @swagger
 * /api/automated-reporting/templates/{id}:
 *   delete:
 *     summary: Delete report template
 *     description: Delete a report template and all associated generated reports
 *     tags: [Automated Reporting]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Report template ID
 *     responses:
 *       200:
 *         description: Report template deleted successfully
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
 *                   example: Report template deleted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: Report template deleted successfully
 *       404:
 *         description: Report template not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete("/templates/:id", authenticate, authorize(["admin", "accountant", "finance_manager", "cfo"]), AutomatedReportingController.deleteReportTemplate);

/**
 * @swagger
 * /api/automated-reporting/generate:
 *   post:
 *     summary: Generate a report
 *     description: Generate a report using an existing template
 *     tags: [Automated Reporting]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - templateId
 *               - reportPeriod
 *             properties:
 *               templateId:
 *                 type: string
 *               reportPeriod:
 *                 type: string
 *               parameters:
 *                 type: object
 *     responses:
 *       201:
 *         description: Report generated successfully
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
 *                   example: Report generated successfully
 *                 data:
 *                   $ref: '#/components/schemas/GeneratedReport'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/generate", authenticate, authorize(["admin", "accountant", "finance_manager", "cfo"]), AutomatedReportingController.generateReport);

/**
 * @swagger
 * /api/automated-reporting/variance-reports:
 *   post:
 *     summary: Create variance report
 *     description: Create a variance report comparing actual vs budgeted expenses
 *     tags: [Automated Reporting]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reportPeriod
 *               - reportType
 *               - actualExpenses
 *               - budgetedExpenses
 *             properties:
 *               reportPeriod:
 *                 type: string
 *               reportType:
 *                 type: string
 *                 enum: [MONTHLY, QUARTERLY, ANNUAL]
 *               actualExpenses:
 *                 type: number
 *               budgetedExpenses:
 *                 type: number
 *               significantVariances:
 *                 type: array
 *                 items:
 *                   type: object
 *               explanations:
 *                 type: array
 *                 items:
 *                   type: object
 *               actionItems:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Variance report created successfully
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
 *                   example: Variance report created successfully
 *                 data:
 *                   $ref: '#/components/schemas/VarianceReport'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/variance-reports", authenticate, authorize(["admin", "accountant", "finance_manager", "cfo"]), AutomatedReportingController.createVarianceReport);

/**
 * @swagger
 * /api/automated-reporting/turnover-reports:
 *   post:
 *     summary: Create turnover analysis report
 *     description: Create a turnover analysis report with employee retention metrics
 *     tags: [Automated Reporting]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reportPeriod
 *               - reportType
 *               - totalEmployees
 *               - employeesLeft
 *               - voluntaryTurnover
 *               - involuntaryTurnover
 *             properties:
 *               reportPeriod:
 *                 type: string
 *               reportType:
 *                 type: string
 *                 enum: [QUARTERLY, ANNUAL]
 *               totalEmployees:
 *                 type: integer
 *               employeesLeft:
 *                 type: integer
 *               voluntaryTurnover:
 *                 type: integer
 *               involuntaryTurnover:
 *                 type: integer
 *               departmentBreakdown:
 *                 type: object
 *               roleBreakdown:
 *                 type: object
 *               tenureBreakdown:
 *                 type: object
 *               exitInterviewData:
 *                 type: object
 *               commonReasons:
 *                 type: array
 *                 items:
 *                   type: object
 *               retentionRecommendations:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Turnover analysis report created successfully
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
 *                   example: Turnover analysis report created successfully
 *                 data:
 *                   $ref: '#/components/schemas/TurnoverAnalysisReport'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/turnover-reports", authenticate, authorize(["admin", "accountant", "finance_manager", "cfo"]), AutomatedReportingController.createTurnoverAnalysisReport);

export default router;
