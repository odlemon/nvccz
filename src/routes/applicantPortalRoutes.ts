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
 *           enum: [INCOME_STATEMENTS, STATEMENT_OF_FINANCIAL_POSITION, CASHFLOW_STATEMENTS, NON_FINANCIAL_KPIS, BALANCE_SHEET, INCOME_STATEMENT, CASHFLOW_STATEMENT]
 *           example: INCOME_STATEMENTS
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
 *           nullable: true
 *           description: Public download URL after upload; null on new draft until file is attached.
 *         fileUrl:
 *           type: string
 *           format: uri
 *           nullable: true
 *           description: Same as reportUrl (stable alias for clients).
 *         storagePath:
 *           type: string
 *           nullable: true
 *           description: Backend storage key/path.
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
 * /applicant/procurement/drawdown:
 *   get:
 *     summary: Investee drawdown summary & PR ledger (Suite 02)
 *     description: Committed/reserved/available tranche, ledger-approved PRs, full PR list for the portfolio company.
 *     tags:
 *       - Applicant Portal
 *       - Investee Portal — Investment Drawdown
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not an applicant
 *       404:
 *         description: No portfolio company
 */
router.get(
  "/procurement/drawdown",
  authenticate,
  applicantPortalController.getInvesteeDrawdownSummary
);
/**
 * @swagger
 * /applicant/procurement/requisitions:
 *   post:
 *     summary: Create investee purchase requisition — DRAFT (Suite 02)
 *     tags:
 *       - Applicant Portal
 *       - Investee Portal — Investment Drawdown
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - items
 *               - drawdownRequestAmount
 *               - useOfFundsDocumentUrl
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               sourcingCategory:
 *                 type: string
 *                 example: IT_SERVICES
 *               drawdownRequestAmount:
 *                 type: number
 *               useOfFundsDocumentUrl:
 *                 type: string
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - itemName
 *                     - quantity
 *                   properties:
 *                     itemName:
 *                       type: string
 *                     quantity:
 *                       type: number
 *                     unit:
 *                       type: string
 *     responses:
 *       201:
 *         description: Created
 *       400:
 *         description: Validation error
 */
router.post(
  "/procurement/requisitions",
  authenticate,
  applicantPortalController.createInvesteePurchaseRequisition
);
/**
 * @swagger
 * /applicant/procurement/requisitions/{id}/submit:
 *   put:
 *     summary: Submit investee PR for VC executive review (Suite 02)
 *     tags:
 *       - Applicant Portal
 *       - Investee Portal — Investment Drawdown
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Submitted — PENDING_VC_EXECUTIVE_REVIEW
 */
router.put(
  "/procurement/requisitions/:id/submit",
  authenticate,
  applicantPortalController.submitInvesteePurchaseRequisition
);
/**
 * @swagger
 * /applicant/procurement/requisitions/{id}/cancel:
 *   post:
 *     summary: Cancel investee PR — returns to DRAFT (Suite 02)
 *     tags:
 *       - Applicant Portal
 *       - Investee Portal — Investment Drawdown
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Cancelled / back to DRAFT
 */
router.post(
  "/procurement/requisitions/:id/cancel",
  authenticate,
  applicantPortalController.cancelInvesteePurchaseRequisition
);

router.put(
  "/procurement/requisitions/:id",
  authenticate,
  applicantPortalController.updateInvesteePurchaseRequisition
);

/**
 * @swagger
 * /applicant/procurement/goods-received-notes:
 *   get:
 *     summary: List investee GRNs (Suite 05)
 *     description: GRNs whose PO is linked to a purchase requisition for this applicant’s portfolio company only.
 *     tags:
 *       - Applicant Portal
 *       - Investee Portal — Investment Drawdown
 *       - Procurement — GRN & QC (Suite 05)
 *       - Procurement - GRN
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: purchaseOrderId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: qualityStatus
 *         schema:
 *           type: string
 *       - in: query
 *         name: grnNumber
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *     responses:
 *       200:
 *         description: Paginated list (`data.items`, `data.total`, `data.limit`, `data.offset`)
 *       403:
 *         description: Not an applicant
 *   post:
 *     summary: Create investee GRN (Suite 05) — PO must tie to this portfolio company’s PR
 *     tags:
 *       - Applicant Portal
 *       - Investee Portal — Investment Drawdown
 *       - Procurement — GRN & QC (Suite 05)
 *       - Procurement - GRN
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - purchaseOrderId
 *               - items
 *             properties:
 *               purchaseOrderId:
 *                 type: string
 *               receivedDate:
 *                 type: string
 *                 format: date-time
 *               attachmentUrls:
 *                 description: Delivery note / waybill URLs (JSON array or object — stored as JSON)
 *               latitude:
 *                 type: number
 *               longitude:
 *                 type: number
 *               geoCapturedAt:
 *                 type: string
 *                 format: date-time
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - purchaseOrderItemId
 *                     - quantityReceived
 *                     - quantityAccepted
 *                     - quantityRejected
 *                     - qualityStatus
 *                   properties:
 *                     purchaseOrderItemId:
 *                       type: string
 *                     quantityReceived:
 *                       type: number
 *                     quantityAccepted:
 *                       type: number
 *                     quantityRejected:
 *                       type: number
 *                     qualityStatus:
 *                       type: string
 *                       enum: [PENDING, PASSED, FAILED, CONDITIONAL]
 *                     qualityNotes:
 *                       type: string
 *     responses:
 *       201:
 *         description: GRN created (may be PENDING_GP_REVIEW per workflow)
 *       400:
 *         description: Validation / over-delivery / PO scope
 */
router.get(
  "/procurement/goods-received-notes",
  authenticate,
  applicantPortalController.listInvesteeGoodsReceivedNotes
);
/**
 * @swagger
 * /applicant/procurement/goods-received-notes/{id}:
 *   get:
 *     summary: Get investee GRN by id (Suite 05)
 *     tags:
 *       - Applicant Portal
 *       - Investee Portal — Investment Drawdown
 *       - Procurement — GRN & QC (Suite 05)
 *       - Procurement - GRN
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: GRN detail
 *       404:
 *         description: Not found or not in portfolio scope
 */
router.get(
  "/procurement/goods-received-notes/:id",
  authenticate,
  applicantPortalController.getInvesteeGoodsReceivedNoteById
);
router.post(
  "/procurement/goods-received-notes",
  authenticate,
  applicantPortalController.createInvesteeGoodsReceivedNote
);

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
 *     summary: Submit a financial report (Applicant / investee)
 *     description: |
 *       **Audience:** Applicant (investee) — authenticated user linked to a portfolio company.
 *       Upload financial report document(s) for fund review.
 *     tags: ['Investee Reporting']
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - reportingPeriod
 *               - periodType
 *               - periodStart
 *               - periodEnd
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Single-file upload (same as before). Use `files` for multiple files in one request.
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: Multiple files in one request (field name repeated or array in clients that support it).
 *               reportingPeriod:
 *                 type: string
 *                 format: date
 *                 description: Reporting period date (e.g. quarter-end 2026-03-31). Same for all files in this request.
 *               reportType:
 *                 $ref: '#/components/schemas/FinancialReportSubmissionRequest/properties/reportType'
 *               periodType:
 *                 $ref: '#/components/schemas/FinancialReportSubmissionRequest/properties/periodType'
 *               periodStart:
 *                 $ref: '#/components/schemas/FinancialReportSubmissionRequest/properties/periodStart'
 *               periodEnd:
 *                 $ref: '#/components/schemas/FinancialReportSubmissionRequest/properties/periodEnd'
 *               title:
 *                 type: string
 *                 description: >
 *                   Required for income statement / balance sheet / cash flow. Optional for file-only types
 *                   (e.g. BUSINESS_PLAN, BANK_STATEMENTS); omitted title defaults to the uploaded filename.
 *               description:
 *                 $ref: '#/components/schemas/FinancialReportSubmissionRequest/properties/description'
 *               templateVersion:
 *                 $ref: '#/components/schemas/FinancialReportSubmissionRequest/properties/templateVersion'
 *               data:
 *                 type: string
 *                 description: >
 *                   Optional JSON string of manual line items — **only** for INCOME_STATEMENTS, balance sheet /
 *                   STATEMENT_OF_FINANCIAL_POSITION, CASHFLOW_STATEMENTS, or NON_FINANCIAL_KPIS. Ignored for
 *                   BUSINESS_PLAN and other file-only uploads.
 *               items:
 *                 type: string
 *                 description: >
 *                   JSON array, one object per uploaded file (same order as `files`). Each object must include
 *                   reportType and title; optional description, templateVersion, data (JSON object or string).
 *                   When set, top-level reportType/title are not required. Use this to upload IS + BS + bank PDF in one call.
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
 *     tags: ['Investee Reporting']
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
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "files", maxCount: 25 },
  ]),
  applicantPortalController.uploadFinancialReport
);

router.post(
  "/financial-reports/income-statement/draft",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.createIncomeStatementDraft
);
router.post(
  "/financial-reports/balance-sheet/draft",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.createBalanceSheetDraft
);
router.post(
  "/financial-reports/cash-flow/draft",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.createCashFlowStatementDraft
);
router.post(
  "/financial-reports/operational-kpis/draft",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.createOperationalKpisDraft
);

/** Attach file to draft: use either this or `POST /financial-reports/:reportId/file`. */
router.post(
  "/financial-reports/file",
  authenticate,
  requireApplicantRole(),
  upload.single("file"),
  applicantPortalController.uploadFinancialReportFile
);

router.post(
  "/financial-reports/:reportId/file",
  authenticate,
  requireApplicantRole(),
  upload.single("file"),
  applicantPortalController.uploadFinancialReportFile
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

/**
 * @swagger
 * /api/applicant/financial-reports/{reportId}:
 *   get:
 *     summary: Get one report for edit (investee)
 *     description: Returns report with `data` (parsed line items), reviewerComment, canSubmit, canUploadFile.
 *     tags: ['Investee Reporting']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Report detail
 *       404:
 *         description: Not found
 */
router.get(
  "/financial-reports/:reportId",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.getFinancialReportById
);

/**
 * @swagger
 * /api/applicant/financial-reports/{reportId}/data:
 *   patch:
 *     summary: Update manual line-item data on a report (investee)
 *     description: |
 *       For INCOME_STATEMENT(S), BALANCE_SHEET / STATEMENT_OF_FINANCIAL_POSITION, CASHFLOW_* , NON_FINANCIAL_KPIS.
 *       Allowed when status is DRAFT, NEEDS_REVISION, or REJECTED. Replaces `parsedSnapshot`. Use `POST .../file` to replace the file.
 *       Status stays NEEDS_REVISION until you call submit.
 *     tags: ['Investee Reporting']
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [data]
 *             properties:
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Updated report
 *       400:
 *         description: Invalid body or report type
 */
router.patch(
  "/financial-reports/:reportId/data",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.updateFinancialReportData
);

/**
 * @swagger
 * /api/applicant/financial-reports/submit:
 *   post:
 *     summary: Submit a reporting period bundle (by reportId)
 *     description: >
 *       Submits all DRAFT, NEEDS_REVISION, and REJECTED reports for the same company + reportingPeriod as the provided reportId.
 *       Accepts reportId in body, query, or path variants.
 *     tags: ['Investee Reporting']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: reportId
 *         required: false
 *         schema:
 *           type: string
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reportId:
 *                 type: string
 *               reportIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Submitted for review
 *       400:
 *         description: Missing reportId/reportIds
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/financial-reports/submit",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.submitFinancialReport
);

/**
 * @swagger
 * /api/applicant/financial-reports/submit/{reportId}:
 *   post:
 *     summary: Submit a reporting period bundle (path alias)
 *     description: Convenience alias for clients that prefer `/submit/{reportId}`.
 *     tags: ['Investee Reporting']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Submitted for review
 */
// Alias for clients that prefer /submit/:reportId
router.post(
  "/financial-reports/submit/:reportId",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.submitFinancialReport
);
router.post(
  "/financial-reports/period-kpis",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.savePeriodKPIs
);
router.post(
  "/financial-reports/period-kpis/income-statement",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.savePeriodKPIsIncomeStatement
);
router.post(
  "/financial-reports/period-kpis/balance-sheet",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.savePeriodKPIsBalanceSheet
);
router.post(
  "/financial-reports/period-kpis/cash-flow",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.savePeriodKPIsCashFlow
);
router.get(
  "/financial-reports/period-kpis/summary",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.getPeriodKpiSummary
);
router.post(
  "/financial-reports/:reportId/submit",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.submitFinancialReport
);

router.post(
  "/procurement-requests",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.createProcurementRequest
);

router.get(
  "/reporting/requests",
  authenticate,
  requireApplicantRole(),
  applicantPortalController.getOpenReportingRequests
);

/**
 * @swagger
 * /api/applicant/reporting/requests:
 *   get:
 *     summary: List open reporting requests for the authenticated investee
 *     description: Returns reporting periods that are open (requested) for this investee to submit documents/KPIs against.
 *     tags: ['Investee Reporting']
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Open requests list
 *       401:
 *         description: Unauthorized
 */

/**
 * @swagger
 * /api/applicant/financial-reports/template/{reportType}:
 *   get:
 *     summary: Download financial report template
 *     description: Provides the standard CSV template for the specified financial report type.
 *     tags: ['Investee Reporting']
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: reportType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [INCOME_STATEMENTS, STATEMENT_OF_FINANCIAL_POSITION, CASHFLOW_STATEMENTS, NON_FINANCIAL_KPIS, BALANCE_SHEET, INCOME_STATEMENT, CASHFLOW_STATEMENT]
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
