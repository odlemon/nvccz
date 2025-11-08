// @ts-nocheck
import { Router } from "express";
import multer from "multer";
import { applicantPortalController } from "../controllers/ApplicantPortalController";
import { authenticate } from "../middleware/authenticate";
import { requireApplicantRole } from "../middleware/permissionAuth";

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     ApplicantProfile:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "cmhbqqk430001l204f71u6t2w"
 *         firstName:
 *           type: string
 *           example: "John"
 *         lastName:
 *           type: string
 *           example: "Doe"
 *         email:
 *           type: string
 *           example: "john.doe@example.com"
 *         userDepartment:
 *           type: string
 *           example: "Finance"
 *         roleCode:
 *           type: string
 *           example: "APPLICANT"
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     
 *     UpdateProfileRequest:
 *       type: object
 *       properties:
 *         firstName:
 *           type: string
 *           example: "John"
 *         lastName:
 *           type: string
 *           example: "Doe"
 *         email:
 *           type: string
 *           format: email
 *           example: "john.doe@example.com"
 *     
 *     ApplicationDetails:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "cmhcqiww30009l804sj0rjt2k"
 *         businessName:
 *           type: string
 *           example: "Tech Startup Ltd"
 *         applicantName:
 *           type: string
 *           example: "John Doe"
 *         applicantEmail:
 *           type: string
 *           example: "john.doe@example.com"
 *         currentStage:
 *           type: string
 *           enum: [SUBMITTED, UNDER_REVIEW, DUE_DILIGENCE, BOARD_REVIEW, TERM_SHEET, APPROVED, REJECTED]
 *           example: "UNDER_REVIEW"
 *         submittedAt:
 *           type: string
 *           format: date-time
 *         requestedAmount:
 *           type: number
 *           example: 500000
 *         industry:
 *           type: string
 *           example: "Technology"
 *         businessStage:
 *           type: string
 *           example: "Early Stage"
 *         fund:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *             description:
 *               type: string
 *         documents:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               documentType:
 *                 type: string
 *               fileName:
 *                 type: string
 *               fileUrl:
 *                 type: string
 *               isRequired:
 *                 type: boolean
 *               isSubmitted:
 *                 type: boolean
 *               uploadedAt:
 *                 type: string
 *                 format: date-time
 *     
 *     PortfolioCompany:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "cmhcqiww30009l804sj0rjt2k"
 *         name:
 *           type: string
 *           example: "Tech Startup Ltd"
 *         industry:
 *           type: string
 *           example: "Technology"
 *         status:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, EXITED]
 *           example: "ACTIVE"
 *         foundingDate:
 *           type: string
 *           format: date
 *         address:
 *           type: string
 *         website:
 *           type: string
 *         description:
 *           type: string
 *         logoUrl:
 *           type: string
 *         companySize:
 *           type: string
 *         employeeCount:
 *           type: number
 *         annualRevenue:
 *           type: number
 *         fundingStage:
 *           type: string
 *         contactPerson:
 *           type: string
 *         contactPhone:
 *           type: string
 *         contactEmail:
 *           type: string
 *         socialMedia:
 *           type: object
 *         fund:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *             description:
 *               type: string
 *     
 *     DashboardSummary:
 *       type: object
 *       properties:
 *         application:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             currentStage:
 *               type: string
 *             submittedAt:
 *               type: string
 *               format: date-time
 *             businessName:
 *               type: string
 *             requestedAmount:
 *               type: number
 *             industry:
 *               type: string
 *             businessStage:
 *               type: string
 *         portfolioCompany:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *             status:
 *               type: string
 *             industry:
 *               type: string
 *             fundingStage:
 *               type: string
 *         recentActivities:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               id:
 *                 type: string
 *               notificationType:
 *                 type: string
 *               title:
 *                 type: string
 *               message:
 *                 type: string
 *               createdAt:
 *                 type: string
 *                 format: date-time
 *         summary:
 *           type: object
 *           properties:
 *             hasApplication:
 *               type: boolean
 *             hasPortfolioCompany:
 *               type: boolean
 *             applicationStage:
 *               type: string
 *             companyStatus:
 *               type: string
 *     
 *     TimelineEvent:
 *       type: object
 *       properties:
 *         event:
 *           type: string
 *           example: "Application Submitted"
 *         date:
 *           type: string
 *           format: date-time
 *         status:
 *           type: string
 *           enum: [completed, in_progress, pending]
 *           example: "completed"
 *         description:
 *           type: string
 *           example: "Your application was successfully submitted for review"
 *     
 *     ApplicationTimeline:
 *       type: object
 *       properties:
 *         applicationId:
 *           type: string
 *         currentStage:
 *           type: string
 *         timeline:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/TimelineEvent'
 *     
 *     InvestmentDetails:
 *       type: object
 *       properties:
 *         portfolioCompany:
 *           $ref: '#/components/schemas/PortfolioCompany'
 *         termSheet:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             status:
 *               type: string
 *             isSigned:
 *               type: boolean
 *             signedAt:
 *               type: string
 *               format: date-time
 *             investmentAmount:
 *               type: number
 *             createdBy:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 firstName:
 *                   type: string
 *                 lastName:
 *                   type: string
 *                 email:
 *                   type: string
 *         investment:
 *           type: object
 *           properties:
 *             fund:
 *               type: object
 *             startDate:
 *               type: string
 *               format: date
 *             endDate:
 *               type: string
 *               format: date
 *             capTable:
 *               type: object
 *             financialKpis:
 *               type: object
 *     
 *     PerformanceReport:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         title:
 *           type: string
 *           example: "Q1 2025 Performance Report"
 *         type:
 *           type: string
 *           enum: [quarterly, annual, monthly]
 *           example: "quarterly"
 *         period:
 *           type: string
 *           example: "Q1 2025"
 *         status:
 *           type: string
 *           enum: [completed, in_progress, pending]
 *           example: "completed"
 *         generatedAt:
 *           type: string
 *           format: date-time
 *         downloadUrl:
 *           type: string
 *           example: "#"
 *     
 *     PerformanceReports:
 *       type: object
 *       properties:
 *         portfolioCompany:
 *           type: object
 *           properties:
 *             id:
 *               type: string
 *             name:
 *               type: string
 *             industry:
 *               type: string
 *         reports:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/PerformanceReport'
 *     FinancialReportSubmissionRequest:
 *       type: object
 *       required:
 *         - reportType
 *         - periodType
 *         - periodStart
 *         - periodEnd
 *         - title
 *       properties:
 *         reportType:
 *           type: string
 *           enum: [BALANCE_SHEET, INCOME_STATEMENT, CASHFLOW_STATEMENT]
 *           example: BALANCE_SHEET
 *         periodType:
 *           type: string
 *           enum: [WEEKLY, MONTHLY, QUARTERLY, ANNUAL]
 *           example: MONTHLY
 *         periodStart:
 *           type: string
 *           format: date
 *           example: 2025-01-01
 *         periodEnd:
 *           type: string
 *           format: date
 *           example: 2025-01-31
 *         title:
 *           type: string
 *           example: "January 2025 Balance Sheet"
 *         description:
 *           type: string
 *           example: "Preliminary month-end figures"
 *         templateVersion:
 *           type: string
 *           example: v1
 *     FinancialReportResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: cmj123...
 *         reportUrl:
 *           type: string
 *           format: uri
 *           example: https://storage.googleapis.com/.../report.csv
 */

/**
 * @swagger
 * /api/applicant/profile:
 *   get:
 *     summary: Get applicant profile
 *     description: Retrieve the profile information of the authenticated applicant
 *     tags: ['Applicant Portal']
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profile retrieved successfully
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
 *                   example: "Profile retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/ApplicantProfile'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get("/profile", authenticate, applicantPortalController.getProfile);

/**
 * @swagger
 * /api/applicant/profile:
 *   put:
 *     summary: Update applicant profile
 *     description: Update the profile information of the authenticated applicant
 *     tags: ['Applicant Portal']
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateProfileRequest'
 *     responses:
 *       200:
 *         description: Profile updated successfully
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
 *                   example: "Profile updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/ApplicantProfile'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.put("/profile", authenticate, applicantPortalController.updateProfile);

/**
 * @swagger
 * /api/applicant/application:
 *   get:
 *     summary: Get applicant's application details
 *     description: Retrieve the application details of the authenticated applicant
 *     tags: ['Applicant Portal']
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Application retrieved successfully
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
 *                   example: "Application retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/ApplicationDetails'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No application found for this user
 */
router.get("/application", authenticate, applicantPortalController.getApplication);

/**
 * @swagger
 * /api/applicant/company:
 *   get:
 *     summary: Get applicant's portfolio company
 *     description: Retrieve the portfolio company details of the authenticated applicant (if approved)
 *     tags: ['Applicant Portal']
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Company retrieved successfully
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
 *                   example: "Company retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/PortfolioCompany'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No portfolio company found for this user
 */
router.get("/company", authenticate, applicantPortalController.getCompany);

/**
 * @swagger
 * /api/applicant/company:
 *   put:
 *     summary: Update applicant's portfolio company
 *     description: Update the portfolio company details of the authenticated applicant
 *     tags: ['Applicant Portal']
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Tech Startup Ltd"
 *               industry:
 *                 type: string
 *                 example: "Technology"
 *               foundingDate:
 *                 type: string
 *                 format: date
 *               address:
 *                 type: string
 *               website:
 *                 type: string
 *               description:
 *                 type: string
 *               logoUrl:
 *                 type: string
 *               companySize:
 *                 type: string
 *               employeeCount:
 *                 type: number
 *               annualRevenue:
 *                 type: number
 *               fundingStage:
 *                 type: string
 *               contactPerson:
 *                 type: string
 *               contactPhone:
 *                 type: string
 *               contactEmail:
 *                 type: string
 *               socialMedia:
 *                 type: object
 *     responses:
 *       200:
 *         description: Company updated successfully
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
 *                   example: "Company updated successfully"
 *                 data:
 *                   $ref: '#/components/schemas/PortfolioCompany'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No portfolio company found for this user
 */
router.put("/company", authenticate, applicantPortalController.updateCompany);

/**
 * @swagger
 * /api/applicant/dashboard:
 *   get:
 *     summary: Get applicant dashboard
 *     description: Retrieve the dashboard summary for the authenticated applicant
 *     tags: ['Applicant Portal']
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard retrieved successfully
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
 *                   example: "Dashboard retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/DashboardSummary'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
router.get("/dashboard", authenticate, applicantPortalController.getDashboard);

/**
 * @swagger
 * /api/applicant/application/timeline:
 *   get:
 *     summary: Get application timeline
 *     description: Retrieve the timeline of events for the applicant's application
 *     tags: ['Applicant Portal']
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Application timeline retrieved successfully
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
 *                   example: "Application timeline retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/ApplicationTimeline'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No application found for this user
 */
router.get("/application/timeline", authenticate, applicantPortalController.getApplicationTimeline);

/**
 * @swagger
 * /api/applicant/investment:
 *   get:
 *     summary: Get investment details
 *     description: Retrieve the investment details for the authenticated applicant (if approved)
 *     tags: ['Applicant Portal']
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Investment details retrieved successfully
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
 *                   example: "Investment details retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/InvestmentDetails'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No portfolio company found for this user
 */
router.get("/investment", authenticate, applicantPortalController.getInvestmentDetails);

/**
 * @swagger
 * /api/applicant/valuations:
 *   get:
 *     summary: Get portfolio valuations
 *     description: Retrieve the portfolio valuations for the authenticated applicant (if approved)
 *     tags: ['Applicant Portal']
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Portfolio valuations retrieved successfully
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
 *                   example: "Portfolio valuations retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       valuationDate:
 *                         type: string
 *                         format: date
 *                       valuationAmount:
 *                         type: number
 *                       valuationMethod:
 *                         type: string
 *                       status:
 *                         type: string
 *                       assignedTo:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           firstName:
 *                             type: string
 *                           lastName:
 *                             type: string
 *                           email:
 *                             type: string
 *                       valuationActivities:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             activityType:
 *                               type: string
 *                             title:
 *                               type: string
 *                             description:
 *                               type: string
 *                             createdAt:
 *                               type: string
 *                               format: date-time
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No portfolio company found for this user
 */
router.get("/valuations", authenticate, applicantPortalController.getPortfolioValuations);

/**
 * @swagger
 * /api/applicant/reports:
 *   get:
 *     summary: Get performance reports
 *     description: Retrieve the performance reports for the authenticated applicant (if approved)
 *     tags: ['Applicant Portal']
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Performance reports retrieved successfully
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
 *                   example: "Performance reports retrieved successfully"
 *                 data:
 *                   $ref: '#/components/schemas/PerformanceReports'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: No portfolio company found for this user
 */
router.get("/reports", authenticate, applicantPortalController.getPerformanceReports);

/**
 * @swagger
 * /api/applicant/financial-reports:
 *   post:
 *     summary: Submit a financial report
 *     description: Allows an applicant to upload a financial report document for review.
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               reportType:
 *                 $ref: '#/components/schemas/FinancialReportSubmissionRequest/properties/reportType'
 *               periodType:
 *                 $ref: '#/components/schemas/FinancialReportSubmissionRequest/properties/periodType'
 *               periodStart:
 *                 $ref: '#/components/schemas/FinancialReportSubmissionRequest/properties/periodStart'
 *               periodEnd:
 *                 $ref: '#/components/schemas/FinancialReportSubmissionRequest/properties/periodEnd'
 *               title:
 *                 $ref: '#/components/schemas/FinancialReportSubmissionRequest/properties/title'
 *               description:
 *                 $ref: '#/components/schemas/FinancialReportSubmissionRequest/properties/description'
 *               templateVersion:
 *                 $ref: '#/components/schemas/FinancialReportSubmissionRequest/properties/templateVersion'
 *     responses:
 *       201:
 *         description: Financial report submitted successfully
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
 *                   example: "Financial report submitted successfully"
 *                 data:
 *                   $ref: '#/components/schemas/FinancialReportResponse'
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied (not an applicant)
 *       default:
 *         description: Unexpected error
 *   get:
 *     summary: List submitted financial reports
 *     description: Returns all financial reports submitted by the authenticated applicant.
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Financial reports retrieved successfully
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
 *                   example: "Financial reports retrieved successfully"
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied (not an applicant)
 *       default:
 *         description: Unexpected error
 */
router.post(
  "/financial-reports",
  authenticate,
  requireApplicantRole(),
  upload.single("file"),
  applicantPortalController.uploadFinancialReport
);
router.get(
  "/financial-reports",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.getFinancialReports
);
router.get(
  "/financial-reports/template/:reportType",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.downloadFinancialReportTemplate
);
router.post(
  "/financial-reports/submit",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.submitFinancialReport
);
router.post(
  "/financial-reports/:reportId/submit",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.submitFinancialReport
);

/**
 * @swagger
 * /api/applicant/financial-reports/template/{reportType}:
 *   get:
 *     summary: Download financial report template
 *     description: Provides the standard CSV template for the specified financial report type.
 *     tags: ['Financial Reporting']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [BALANCE_SHEET, INCOME_STATEMENT, CASHFLOW_STATEMENT]
 *         description: Financial report type.
 *     responses:
 *       200:
 *         description: Template file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Unknown report type
 *       401:
 *         description: Unauthorized
 *       default:
 *         description: Unexpected error
 */

export default router;
