// @ts-nocheck
import { Router } from "express";
import { applicantPortalController } from "../controllers/ApplicantPortalController";
import { authenticate } from "../middleware/authenticate";

const router = Router();

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

export default router;
