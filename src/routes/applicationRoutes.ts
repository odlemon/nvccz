//@ts-nocheck
import express from "express";
import { ApplicationController } from "../controllers/ApplicationController";
import { DueDiligenceController } from "../controllers/DueDiligenceController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

/**
 * @swagger
 * /api/applications:
 *   post:
 *     summary: Create a new investment application (PUBLIC)
 *     description: Create a new investment application. No authentication required.
 *     tags: [Applications]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - applicantName
 *               - applicantEmail
 *               - businessName
 *               - requestedAmount
 *             properties:
 *               applicantName:
 *                 type: string
 *                 description: Full name of the applicant
 *                 example: "John Doe"
 *               applicantEmail:
 *                 type: string
 *                 format: email
 *                 description: Email address of the applicant
 *                 example: "john.doe@example.com"
 *               applicantPhone:
 *                 type: string
 *                 description: Phone number of the applicant
 *                 example: "+1234567890"
 *               applicantAddress:
 *                 type: string
 *                 description: Address of the applicant
 *                 example: "123 Main Street, City, Country"
 *               businessName:
 *                 type: string
 *                 description: Name of the business
 *                 example: "TechStart Inc."
 *               businessDescription:
 *                 type: string
 *                 description: Description of the business
 *                 example: "A technology startup focused on AI solutions"
 *               industry:
 *                 type: string
 *                 description: Industry sector
 *                 example: "Technology"
 *               businessStage:
 *                 type: string
 *                 enum: [IDEA, STARTUP, OPERATIONAL]
 *                 description: Current stage of the business
 *                 example: "STARTUP"
 *               foundingDate:
 *                 type: string
 *                 format: date
 *                 description: Date when the business was founded
 *                 example: "2023-01-15"
 *               requestedAmount:
 *                 type: number
 *                 description: Amount of investment requested
 *                 example: 100000
 *               fundId:
 *                 type: string
 *                 description: ID of the fund (optional)
 *                 example: "clx1234567890abcdef"
 *               documents:
 *                 type: array
 *                 description: Array of required documents
 *                 items:
 *                   type: object
 *                   properties:
 *                     documentType:
 *                       type: string
 *                       enum: [BUSINESS_PLAN, PROOF_OF_CONCEPT, MARKET_RESEARCH, PROJECTED_CASH_FLOWS, HISTORICAL_FINANCIALS]
 *                       description: Type of document
 *                     fileName:
 *                       type: string
 *                       description: Name of the file
 *                     fileUrl:
 *                       type: string
 *                       description: URL to the document
 *                     fileSize:
 *                       type: integer
 *                       description: Size of the file in bytes
 *                     isRequired:
 *                       type: boolean
 *                       description: Whether this document is required
 *     responses:
 *       201:
 *         description: Application created successfully
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
 *                   example: "Application created successfully"
 *                 data:
 *                   $ref: '#/components/schemas/Application'
 *       400:
 *         description: Bad request - validation error
 *       500:
 *         description: Internal server error
 */
router.post("/", ApplicationController.createApplication);

/**
 * @swagger
 * /api/applications/{id}/status:
 *   get:
 *     summary: Get application status (PUBLIC)
 *     description: Get the current status of an application. No authentication required.
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     responses:
 *       200:
 *         description: Application status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     currentStage:
 *                       type: string
 *                       example: "SHORTLISTED"
 *                     submittedAt:
 *                       type: string
 *                       format: date-time
 *                       example: "2024-01-15T10:30:00Z"
 *       404:
 *         description: Application not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id/status", ApplicationController.getApplicationStatus);

/**
 * @swagger
 * /api/applications/{id}/submit:
 *   post:
 *     summary: Submit application (PUBLIC)
 *     description: Submit a draft application for review. No authentication required.
 *     tags: [Applications]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     responses:
 *       200:
 *         description: Application submitted successfully
 *       400:
 *         description: Bad request - application not in SHORTLISTED stage or missing documents
 *       404:
 *         description: Application not found
 *       500:
 *         description: Internal server error
 */
router.post("/:id/submit", ApplicationController.submitApplication);

// Protected routes (require authentication)
router.use(authenticate);

/**
 * @swagger
 * /api/applications:
 *   get:
 *     summary: Get all applications (PROTECTED)
 *     description: Get all applications with filtering and pagination. Admin/Fund Manager access required.
 *     tags: [Applications]
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
 *         name: stage
 *         schema:
 *           type: string
 *         description: Filter by application stage
 *       - in: query
 *         name: fundId
 *         schema:
 *           type: string
 *         description: Filter by fund ID
 *     responses:
 *       200:
 *         description: Applications retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/", authorize(["admin", "fund_manager"]), ApplicationController.getAllApplications);

/**
 * @swagger
 * /api/applications/{id}:
 *   get:
 *     summary: Get application by ID (PROTECTED)
 *     description: Get detailed information about an application. Admin/Fund Manager access required.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     responses:
 *       200:
 *         description: Application retrieved successfully
 *       404:
 *         description: Application not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/:id", authorize(["admin", "fund_manager"]), ApplicationController.getApplicationById);

/**
 * @swagger
 * /api/applications/{id}:
 *   put:
 *     summary: Update application (PROTECTED)
 *     description: Update an application. Admin/Fund Manager access required.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               applicantName:
 *                 type: string
 *               applicantEmail:
 *                 type: string
 *               applicantPhone:
 *                 type: string
 *               applicantAddress:
 *                 type: string
 *               businessName:
 *                 type: string
 *               businessDescription:
 *                 type: string
 *               industry:
 *                 type: string
 *               businessStage:
 *                 type: string
 *               foundingDate:
 *                 type: string
 *                 format: date
 *               requestedAmount:
 *                 type: number
 *               fundId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Application updated successfully
 *       400:
 *         description: Bad request
 *       404:
 *         description: Application not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put("/:id", authorize(["admin", "fund_manager"]), ApplicationController.updateApplication);

/**
 * @swagger
 * /api/applications/{id}/change-stage:
 *   post:
 *     summary: Change application stage (PROTECTED)
 *     description: Change the stage of an application. Admin/Fund Manager access required.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - newStage
 *             properties:
 *               newStage:
 *                 type: string
 *                 enum: [UNDER_DUE_DILIGENCE, DUE_DILIGENCE_COMPLETED, UNDER_BOARD_REVIEW, BOARD_APPROVED, BOARD_REJECTED, BOARD_CONDITIONAL, TERM_SHEET_NEGOTIATION, IMPLEMENTATION, FUNDED, REJECTED]
 *                 description: New stage for the application
 *               notes:
 *                 type: string
 *                 description: Optional notes about the stage change
 *     responses:
 *       200:
 *         description: Application stage changed successfully
 *       400:
 *         description: Bad request - invalid stage transition
 *       404:
 *         description: Application not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/:id/change-stage", authorize(["admin", "fund_manager"]), ApplicationController.changeApplicationStage);

/**
 * @swagger
 * /api/applications/{id}:
 *   delete:
 *     summary: Delete application (PROTECTED)
 *     description: Delete an application. Admin access required.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     responses:
 *       200:
 *         description: Application deleted successfully
 *       400:
 *         description: Bad request - cannot delete application not in SHORTLISTED stage
 *       404:
 *         description: Application not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete("/:id", authorize(["admin"]), ApplicationController.deleteApplication);

// Due Diligence Routes
/**
 * @swagger
 * /api/applications/{id}/due-diligence/initiate:
 *   post:
 *     summary: Initiate due diligence for an application (PROTECTED)
 *     description: Start the due diligence process for an application. Admin/Fund Manager access required.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     responses:
 *       200:
 *         description: Due diligence initiated successfully
 *       400:
 *         description: Bad request - application not in SHORTLISTED stage or due diligence already exists
 *       404:
 *         description: Application not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/:id/due-diligence/initiate", authorize(["admin", "fund_manager"]), DueDiligenceController.initiateDueDiligence);

/**
 * @swagger
 * /api/applications/{id}/due-diligence:
 *   put:
 *     summary: Update due diligence data (PROTECTED)
 *     description: Update the due diligence assessment data. Admin/Fund Manager access required.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               marketResearchViable:
 *                 type: boolean
 *                 description: Whether market research shows viable market
 *               marketResearchComments:
 *                 type: string
 *                 description: Comments on market research
 *               financialViable:
 *                 type: boolean
 *                 description: Whether financial analysis shows viability
 *               financialComments:
 *                 type: string
 *                 description: Comments on financial analysis
 *               competitiveOpportunities:
 *                 type: boolean
 *                 description: Whether competitive analysis shows opportunities
 *               competitiveComments:
 *                 type: string
 *                 description: Comments on competitive analysis
 *               managementTeamQualified:
 *                 type: boolean
 *                 description: Whether management team is qualified
 *               managementComments:
 *                 type: string
 *                 description: Comments on management team
 *               legalCompliant:
 *                 type: boolean
 *                 description: Whether legal requirements are met
 *               legalComments:
 *                 type: string
 *                 description: Comments on legal compliance
 *               riskTolerable:
 *                 type: boolean
 *                 description: Whether risk is tolerable
 *               riskComments:
 *                 type: string
 *                 description: Comments on risk assessment
 *               overallScore:
 *                 type: number
 *                 description: Overall score (0-100)
 *               recommendation:
 *                 type: string
 *                 enum: [APPROVE, REJECT, CONDITIONAL]
 *                 description: Final recommendation
 *               finalComments:
 *                 type: string
 *                 description: Final comments and summary
 *     responses:
 *       200:
 *         description: Due diligence updated successfully
 *       400:
 *         description: Bad request - due diligence not found or already completed
 *       404:
 *         description: Application not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put("/:id/due-diligence", authorize(["admin", "fund_manager"]), DueDiligenceController.updateDueDiligence);

/**
 * @swagger
 * /api/applications/{id}/due-diligence:
 *   get:
 *     summary: Get due diligence report (PROTECTED)
 *     description: Get the due diligence report for an application. Admin/Fund Manager access required.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     responses:
 *       200:
 *         description: Due diligence report retrieved successfully
 *       404:
 *         description: Due diligence report not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/:id/due-diligence", authorize(["admin", "fund_manager"]), DueDiligenceController.getDueDiligenceReport);

/**
 * @swagger
 * /api/applications/{id}/due-diligence/complete:
 *   post:
 *     summary: Complete due diligence (PROTECTED)
 *     description: Mark due diligence as completed and move application to next stage. Admin/Fund Manager access required.
 *     tags: [Applications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     responses:
 *       200:
 *         description: Due diligence completed successfully
 *       400:
 *         description: Bad request - missing required fields or already completed
 *       404:
 *         description: Due diligence not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/:id/due-diligence/complete", authorize(["admin", "fund_manager"]), DueDiligenceController.completeDueDiligence);

/**
 * @swagger
 * /api/applications/due-diligence:
 *   get:
 *     summary: Get all due diligence reviews (PROTECTED)
 *     description: Get all due diligence reviews with pagination and filtering. Admin/Fund Manager access required.
 *     tags: [Applications]
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
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status (IN_PROGRESS, COMPLETED)
 *     responses:
 *       200:
 *         description: Due diligence reviews retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/due-diligence", authorize(["admin", "fund_manager"]), DueDiligenceController.getAllDueDiligenceReviews);

export default router;
