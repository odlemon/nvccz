// @ts-nocheck
import express from "express";
import { StakeholderController } from "../controllers/StakeholderController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Stakeholder:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         stakeholderId:
 *           type: string
 *         type:
 *           type: string
 *           enum: [INVESTOR, LP, ADVISOR, PARTNER, VENDOR]
 *         legalName:
 *           type: string
 *         email:
 *           type: string
 *         phone:
 *           type: string
 *         address:
 *           type: string
 *         country:
 *           type: string
 *         organizationName:
 *           type: string
 *         industry:
 *           type: string
 *         taxId:
 *           type: string
 *         registrationNumber:
 *           type: string
 *         totalCommitment:
 *           type: number
 *         currency:
 *           type: string
 *         investmentFocus:
 *           type: string
 *         riskTolerance:
 *           type: string
 *           enum: [LOW, MEDIUM, HIGH]
 *         relationshipManagerId:
 *           type: string
 *         relationshipStartDate:
 *           type: string
 *           format: date-time
 *         relationshipStatus:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, SUSPENDED, TERMINATED]
 *         contactFrequency:
 *           type: string
 *           enum: [WEEKLY, MONTHLY, QUARTERLY, ANNUALLY]
 *         preferredContactMethod:
 *           type: string
 *           enum: [EMAIL, PHONE, IN_PERSON, VIDEO]
 *         status:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, PENDING, SUSPENDED]
 *         isActive:
 *           type: boolean
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     
 *     StakeholderOnboarding:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         stakeholderId:
 *           type: string
 *         stage:
 *           type: string
 *           enum: [INITIAL_CONTACT, KYC_COMPLETED, DOCUMENTS_SIGNED, ONBOARDED, COMPLETED]
 *         status:
 *           type: string
 *           enum: [IN_PROGRESS, COMPLETED, FAILED, ON_HOLD]
 *         initiatedBy:
 *           type: string
 *         assignedTo:
 *           type: string
 *         startDate:
 *           type: string
 *           format: date-time
 *         completedDate:
 *           type: string
 *           format: date-time
 *         expectedCompletionDate:
 *           type: string
 *           format: date-time
 *         requiredDocuments:
 *           type: array
 *           items:
 *             type: string
 *         submittedDocuments:
 *           type: array
 *           items:
 *             type: string
 *         kycStatus:
 *           type: string
 *           enum: [PENDING, COMPLETED, FAILED]
 *         complianceStatus:
 *           type: string
 *           enum: [PENDING, COMPLETED, FAILED]
 *         notes:
 *           type: string
 *         internalNotes:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     
 *     StakeholderEngagement:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         stakeholderId:
 *           type: string
 *         engagementType:
 *           type: string
 *           enum: [EMAIL, PHONE_CALL, MEETING, PRESENTATION, REPORT, EVENT]
 *         subject:
 *           type: string
 *         description:
 *           type: string
 *         duration:
 *           type: integer
 *         satisfaction:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *         followUpRequired:
 *           type: boolean
 *         followUpDate:
 *           type: string
 *           format: date-time
 *         initiatedBy:
 *           type: string
 *         participants:
 *           type: array
 *           items:
 *             type: string
 *         outcome:
 *           type: string
 *           enum: [POSITIVE, NEUTRAL, NEGATIVE, FOLLOW_UP_REQUIRED]
 *         nextSteps:
 *           type: string
 *         actionItems:
 *           type: array
 *           items:
 *             type: object
 *         engagementDate:
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
 * /api/stakeholders:
 *   post:
 *     summary: Create a new stakeholder
 *     description: Create a new stakeholder with all required information
 *     tags: [Stakeholder Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - stakeholderId
 *               - type
 *               - legalName
 *               - email
 *             properties:
 *               stakeholderId:
 *                 type: string
 *                 description: Unique stakeholder identifier
 *               type:
 *                 type: string
 *                 enum: [INVESTOR, LP, ADVISOR, PARTNER, VENDOR]
 *               legalName:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *               country:
 *                 type: string
 *               organizationName:
 *                 type: string
 *               industry:
 *                 type: string
 *               taxId:
 *                 type: string
 *               registrationNumber:
 *                 type: string
 *               totalCommitment:
 *                 type: number
 *               currency:
 *                 type: string
 *                 default: USD
 *               investmentFocus:
 *                 type: string
 *               riskTolerance:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH]
 *               relationshipManagerId:
 *                 type: string
 *               relationshipStartDate:
 *                 type: string
 *                 format: date-time
 *               contactFrequency:
 *                 type: string
 *                 enum: [WEEKLY, MONTHLY, QUARTERLY, ANNUALLY]
 *                 default: MONTHLY
 *               preferredContactMethod:
 *                 type: string
 *                 enum: [EMAIL, PHONE, IN_PERSON, VIDEO]
 *                 default: EMAIL
 *     responses:
 *       201:
 *         description: Stakeholder created successfully
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
 *                   example: Stakeholder created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Stakeholder'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/", authenticate, authorize(["ADMIN", "MANAGER"]), StakeholderController.createStakeholder);

/**
 * @swagger
 * /api/stakeholders:
 *   get:
 *     summary: Get all stakeholders
 *     description: Retrieve all stakeholders with pagination and filtering
 *     tags: [Stakeholder Management]
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
 *         name: type
 *         schema:
 *           type: string
 *           enum: [INVESTOR, LP, ADVISOR, PARTNER, VENDOR]
 *         description: Filter by stakeholder type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [ACTIVE, INACTIVE, PENDING, SUSPENDED]
 *         description: Filter by stakeholder status
 *       - in: query
 *         name: relationshipManagerId
 *         schema:
 *           type: string
 *         description: Filter by relationship manager ID
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name, email, or organization
 *     responses:
 *       200:
 *         description: Stakeholders retrieved successfully
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
 *                   example: Stakeholders retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     stakeholders:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Stakeholder'
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
router.get("/", authenticate, authorize(["ADMIN", "MANAGER", "USER"]), StakeholderController.getAllStakeholders);

/**
 * @swagger
 * /api/stakeholders/analytics:
 *   get:
 *     summary: Get stakeholder analytics
 *     description: Retrieve stakeholder analytics including retention rates, onboarding metrics, and engagement data
 *     tags: [Stakeholder Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Stakeholder analytics retrieved successfully
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
 *                   example: Stakeholder analytics retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalStakeholders:
 *                       type: integer
 *                     activeStakeholders:
 *                       type: integer
 *                     retentionRate:
 *                       type: number
 *                     stakeholdersByType:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     stakeholdersByStatus:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           status:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     onboardingMetrics:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           stage:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     engagementMetrics:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           engagementType:
 *                             type: string
 *                           count:
 *                             type: integer
 *                           averageSatisfaction:
 *                             type: number
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/analytics", authenticate, authorize(["ADMIN", "MANAGER"]), StakeholderController.getStakeholderAnalytics);

/**
 * @swagger
 * /api/stakeholders/{id}:
 *   get:
 *     summary: Get stakeholder by ID
 *     description: Retrieve a specific stakeholder by their ID
 *     tags: [Stakeholder Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Stakeholder ID
 *     responses:
 *       200:
 *         description: Stakeholder retrieved successfully
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
 *                   example: Stakeholder retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/Stakeholder'
 *       404:
 *         description: Stakeholder not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/:id", authenticate, authorize(["ADMIN", "MANAGER", "USER"]), StakeholderController.getStakeholderById);

/**
 * @swagger
 * /api/stakeholders/stakeholder/{stakeholderId}:
 *   get:
 *     summary: Get stakeholder by stakeholder ID
 *     description: Retrieve a specific stakeholder by their external stakeholder ID
 *     tags: [Stakeholder Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: stakeholderId
 *         required: true
 *         schema:
 *           type: string
 *         description: External stakeholder ID
 *     responses:
 *       200:
 *         description: Stakeholder retrieved successfully
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
 *                   example: Stakeholder retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/Stakeholder'
 *       404:
 *         description: Stakeholder not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/stakeholder/:stakeholderId", authenticate, authorize(["ADMIN", "MANAGER", "USER"]), StakeholderController.getStakeholderByStakeholderId);

/**
 * @swagger
 * /api/stakeholders/{id}:
 *   put:
 *     summary: Update stakeholder
 *     description: Update an existing stakeholder's information
 *     tags: [Stakeholder Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Stakeholder ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *                 enum: [INVESTOR, LP, ADVISOR, PARTNER, VENDOR]
 *               legalName:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               address:
 *                 type: string
 *               country:
 *                 type: string
 *               organizationName:
 *                 type: string
 *               industry:
 *                 type: string
 *               taxId:
 *                 type: string
 *               registrationNumber:
 *                 type: string
 *               totalCommitment:
 *                 type: number
 *               currency:
 *                 type: string
 *               investmentFocus:
 *                 type: string
 *               riskTolerance:
 *                 type: string
 *                 enum: [LOW, MEDIUM, HIGH]
 *               relationshipManagerId:
 *                 type: string
 *               relationshipStartDate:
 *                 type: string
 *                 format: date-time
 *               contactFrequency:
 *                 type: string
 *                 enum: [WEEKLY, MONTHLY, QUARTERLY, ANNUALLY]
 *               preferredContactMethod:
 *                 type: string
 *                 enum: [EMAIL, PHONE, IN_PERSON, VIDEO]
 *               relationshipStatus:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE, SUSPENDED, TERMINATED]
 *               status:
 *                 type: string
 *                 enum: [ACTIVE, INACTIVE, PENDING, SUSPENDED]
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Stakeholder updated successfully
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
 *                   example: Stakeholder updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Stakeholder'
 *       404:
 *         description: Stakeholder not found
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put("/:id", authenticate, authorize(["ADMIN", "MANAGER"]), StakeholderController.updateStakeholder);

/**
 * @swagger
 * /api/stakeholders/{id}:
 *   delete:
 *     summary: Delete stakeholder
 *     description: Delete a stakeholder and all associated data
 *     tags: [Stakeholder Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Stakeholder ID
 *     responses:
 *       200:
 *         description: Stakeholder deleted successfully
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
 *                   example: Stakeholder deleted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: Stakeholder deleted successfully
 *       404:
 *         description: Stakeholder not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete("/:id", authenticate, authorize(["ADMIN"]), StakeholderController.deleteStakeholder);

// ===== STAKEHOLDER ONBOARDING ROUTES =====

/**
 * @swagger
 * /api/stakeholders/onboarding:
 *   post:
 *     summary: Create stakeholder onboarding
 *     description: Create a new stakeholder onboarding process
 *     tags: [Stakeholder Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - stakeholderId
 *               - stage
 *               - initiatedBy
 *             properties:
 *               stakeholderId:
 *                 type: string
 *               stage:
 *                 type: string
 *                 enum: [INITIAL_CONTACT, KYC_COMPLETED, DOCUMENTS_SIGNED, ONBOARDED, COMPLETED]
 *               initiatedBy:
 *                 type: string
 *               assignedTo:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               expectedCompletionDate:
 *                 type: string
 *                 format: date-time
 *               requiredDocuments:
 *                 type: array
 *                 items:
 *                   type: string
 *               notes:
 *                 type: string
 *               internalNotes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Stakeholder onboarding created successfully
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
 *                   example: Stakeholder onboarding created successfully
 *                 data:
 *                   $ref: '#/components/schemas/StakeholderOnboarding'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/onboarding", authenticate, authorize(["ADMIN", "MANAGER"]), StakeholderController.createStakeholderOnboarding);

/**
 * @swagger
 * /api/stakeholders/onboarding/{id}:
 *   put:
 *     summary: Update stakeholder onboarding
 *     description: Update an existing stakeholder onboarding process
 *     tags: [Stakeholder Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Onboarding ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               stage:
 *                 type: string
 *                 enum: [INITIAL_CONTACT, KYC_COMPLETED, DOCUMENTS_SIGNED, ONBOARDED, COMPLETED]
 *               status:
 *                 type: string
 *                 enum: [IN_PROGRESS, COMPLETED, FAILED, ON_HOLD]
 *               assignedTo:
 *                 type: string
 *               startDate:
 *                 type: string
 *                 format: date-time
 *               completedDate:
 *                 type: string
 *                 format: date-time
 *               expectedCompletionDate:
 *                 type: string
 *                 format: date-time
 *               requiredDocuments:
 *                 type: array
 *                 items:
 *                   type: string
 *               submittedDocuments:
 *                 type: array
 *                 items:
 *                   type: string
 *               kycStatus:
 *                 type: string
 *                 enum: [PENDING, COMPLETED, FAILED]
 *               complianceStatus:
 *                 type: string
 *                 enum: [PENDING, COMPLETED, FAILED]
 *               notes:
 *                 type: string
 *               internalNotes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Stakeholder onboarding updated successfully
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
 *                   example: Stakeholder onboarding updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/StakeholderOnboarding'
 *       404:
 *         description: Onboarding not found
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put("/onboarding/:id", authenticate, authorize(["ADMIN", "MANAGER"]), StakeholderController.updateStakeholderOnboarding);

// ===== STAKEHOLDER ENGAGEMENT ROUTES =====

/**
 * @swagger
 * /api/stakeholders/engagement:
 *   post:
 *     summary: Create stakeholder engagement
 *     description: Create a new stakeholder engagement record
 *     tags: [Stakeholder Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - stakeholderId
 *               - engagementType
 *               - subject
 *               - initiatedBy
 *             properties:
 *               stakeholderId:
 *                 type: string
 *               engagementType:
 *                 type: string
 *                 enum: [EMAIL, PHONE_CALL, MEETING, PRESENTATION, REPORT, EVENT]
 *               subject:
 *                 type: string
 *               description:
 *                 type: string
 *               duration:
 *                 type: integer
 *               satisfaction:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               followUpRequired:
 *                 type: boolean
 *               followUpDate:
 *                 type: string
 *                 format: date-time
 *               initiatedBy:
 *                 type: string
 *               participants:
 *                 type: array
 *                 items:
 *                   type: string
 *               outcome:
 *                 type: string
 *                 enum: [POSITIVE, NEUTRAL, NEGATIVE, FOLLOW_UP_REQUIRED]
 *               nextSteps:
 *                 type: string
 *               actionItems:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Stakeholder engagement created successfully
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
 *                   example: Stakeholder engagement created successfully
 *                 data:
 *                   $ref: '#/components/schemas/StakeholderEngagement'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/engagement", authenticate, authorize(["ADMIN", "MANAGER", "USER"]), StakeholderController.createStakeholderEngagement);

export default router;


