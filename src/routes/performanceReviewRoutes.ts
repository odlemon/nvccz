// @ts-nocheck
import express from "express";
import { PerformanceReviewController } from "../controllers/PerformanceReviewController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

/**
 * @swagger-disabled-legacy
 * components:
 *   schemas:
 *     PerformanceReview:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         reviewType:
 *           type: string
 *           enum: [ANNUAL, QUARTERLY, MONTHLY, PROJECT_BASED, GOAL_BASED]
 *         reviewPeriod:
 *           type: string
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         revieweeId:
 *           type: string
 *         reviewerId:
 *           type: string
 *         stakeholderId:
 *           type: string
 *         status:
 *           type: string
 *           enum: [DRAFT, IN_PROGRESS, COMPLETED, APPROVED, REJECTED]
 *         stage:
 *           type: string
 *           enum: [SELF_ASSESSMENT, SELF_REVIEW, PEER_REVIEW, HR_REVIEW, MANAGER_REVIEW, FINAL_REVIEW, FINALIZED]
 *         reviewStartDate:
 *           type: string
 *           format: date-time
 *         reviewEndDate:
 *           type: string
 *           format: date-time
 *         dueDate:
 *           type: string
 *           format: date-time
 *         completedDate:
 *           type: string
 *           format: date-time
 *         criteria:
 *           type: array
 *           items:
 *             type: object
 *         scores:
 *           type: array
 *           items:
 *             type: object
 *         overallScore:
 *           type: number
 *         rating:
 *           type: string
 *           enum: [EXCEEDS_EXPECTATIONS, MEETS_EXPECTATIONS, BELOW_EXPECTATIONS, NEEDS_IMPROVEMENT]
 *         strengths:
 *           type: string
 *         areasForImprovement:
 *           type: string
 *         achievements:
 *           type: string
 *         goals:
 *           type: string
 *         developmentPlan:
 *           type: string
 *         managerFeedback:
 *           type: string
 *         selfFeedback:
 *           type: string
 *         peerFeedback:
 *           type: string
 *         stakeholderFeedback:
 *           type: string
 *         actionItems:
 *           type: array
 *           items:
 *             type: object
 *         nextReviewDate:
 *           type: string
 *           format: date-time
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *     
 *     PerformanceReviewFeedback:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *         reviewId:
 *           type: string
 *         feedbackProviderId:
 *           type: string
 *         feedbackProviderType:
 *           type: string
 *           enum: [MANAGER, PEER, SELF, STAKEHOLDER, DIRECT_REPORT]
 *         feedbackType:
 *           type: string
 *           enum: [STRENGTHS, IMPROVEMENT_AREAS, GOALS, DEVELOPMENT, GENERAL]
 *         content:
 *           type: string
 *         rating:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *         isPrivate:
 *           type: boolean
 *         isAnonymous:
 *           type: boolean
 *         status:
 *           type: string
 *           enum: [DRAFT, SUBMITTED, APPROVED]
 *         submittedAt:
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
 * @swagger-disabled-legacy
 * /api/performance-reviews:
 *   post:
 *     summary: Create a new performance review
 *     description: Create a new performance review for an employee
 *     tags: [Performance Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reviewType
 *               - reviewPeriod
 *               - title
 *               - revieweeId
 *               - reviewerId
 *             properties:
 *               reviewType:
 *                 type: string
 *                 enum: [ANNUAL, QUARTERLY, MONTHLY, PROJECT_BASED, GOAL_BASED]
 *               reviewPeriod:
 *                 type: string
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               revieweeId:
 *                 type: string
 *               reviewerId:
 *                 type: string
 *               stakeholderId:
 *                 type: string
 *               reviewStartDate:
 *                 type: string
 *                 format: date-time
 *               reviewEndDate:
 *                 type: string
 *                 format: date-time
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *               criteria:
 *                 type: array
 *                 items:
 *                   type: object
 *               strengths:
 *                 type: string
 *               areasForImprovement:
 *                 type: string
 *               achievements:
 *                 type: string
 *               goals:
 *                 type: string
 *               developmentPlan:
 *                 type: string
 *               managerFeedback:
 *                 type: string
 *               selfFeedback:
 *                 type: string
 *               peerFeedback:
 *                 type: string
 *               stakeholderFeedback:
 *                 type: string
 *               actionItems:
 *                 type: array
 *                 items:
 *                   type: object
 *               nextReviewDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Performance review created successfully
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
 *                   example: Performance review created successfully
 *                 data:
 *                   $ref: '#/components/schemas/PerformanceReview'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/", authenticate, PerformanceReviewController.createPerformanceReview);

/**
 * @swagger-disabled-legacy
 * /api/performance-reviews:
 *   get:
 *     summary: Get all performance reviews
 *     description: Retrieve all performance reviews with pagination and filtering
 *     tags: [Performance Reviews]
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
 *         name: reviewType
 *         schema:
 *           type: string
 *           enum: [ANNUAL, QUARTERLY, MONTHLY, PROJECT_BASED, GOAL_BASED]
 *         description: Filter by review type
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, IN_PROGRESS, COMPLETED, APPROVED, REJECTED]
 *         description: Filter by review status
 *       - in: query
 *         name: stage
 *         schema:
 *           type: string
 *           enum: [SELF_ASSESSMENT, MANAGER_REVIEW, PEER_REVIEW, FINAL_REVIEW]
 *         description: Filter by review stage
 *       - in: query
 *         name: revieweeId
 *         schema:
 *           type: string
 *         description: Filter by reviewee ID
 *       - in: query
 *         name: reviewerId
 *         schema:
 *           type: string
 *         description: Filter by reviewer ID
 *       - in: query
 *         name: reviewPeriod
 *         schema:
 *           type: string
 *         description: Filter by review period
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by title or description
 *     responses:
 *       200:
 *         description: Performance reviews retrieved successfully
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
 *                   example: Performance reviews retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     reviews:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PerformanceReview'
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
router.get("/", authenticate, PerformanceReviewController.getAllPerformanceReviews);

/**
 * @swagger-disabled-legacy
 * /api/performance-reviews/analytics:
 *   get:
 *     summary: Get performance review analytics
 *     description: Retrieve performance review analytics including completion rates and average scores
 *     tags: [Performance Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Performance review analytics retrieved successfully
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
 *                   example: Performance review analytics retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalReviews:
 *                       type: integer
 *                     reviewsByType:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           reviewType:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     reviewsByStatus:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           status:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     reviewsByStage:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           stage:
 *                             type: string
 *                           count:
 *                             type: integer
 *                     completionRateByType:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           reviewType:
 *                             type: string
 *                           total:
 *                             type: integer
 *                           completed:
 *                             type: integer
 *                           completionRate:
 *                             type: number
 *                     averageScores:
 *                       type: object
 *                       properties:
 *                         average:
 *                           type: number
 *                         minimum:
 *                           type: number
 *                         maximum:
 *                           type: number
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/analytics", authenticate, PerformanceReviewController.getPerformanceReviewAnalytics);

/**
 * @swagger-disabled-legacy
 * /api/performance-reviews/completion-rates:
 *   get:
 *     summary: Get performance review completion rates by department
 *     description: Retrieve performance review completion rates grouped by department
 *     tags: [Performance Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Performance review completion rates retrieved successfully
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
 *                   example: Performance review completion rates retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       departmentId:
 *                         type: string
 *                       departmentName:
 *                         type: string
 *                       total:
 *                         type: integer
 *                       completed:
 *                         type: integer
 *                       inProgress:
 *                         type: integer
 *                       overdue:
 *                         type: integer
 *                       completionRate:
 *                         type: number
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/completion-rates", authenticate, PerformanceReviewController.getPerformanceReviewCompletionRates);

/**
 * @swagger-disabled-legacy
 * /api/performance-reviews/reports/rating-distribution:
 *   get:
 *     summary: Get department rating distribution
 *     tags: [Performance Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: organizationWide
 *         required: false
 *         description: If true or 1, aggregate all departments (departmentName not required)
 *         schema:
 *           type: string
 *           enum: ["true", "false", "1", "0"]
 *       - in: query
 *         name: departmentName
 *         required: false
 *         description: Match reviewee linked department name OR reviewee userDepartment (e.g. Finance). Required when organizationWide is not set.
 *         schema:
 *           type: string
 *       - in: query
 *         name: reviewPeriod
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Department rating distribution retrieved successfully
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
 *                   example: Department rating distribution retrieved successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     reviewPeriod:
 *                       type: string
 *                     departmentName:
 *                       type: string
 *                     distribution:
 *                       type: array
 *                       items:
 *                         type: object
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get("/reports/rating-distribution", authenticate, PerformanceReviewController.getDepartmentRatingDistribution);

/**
 * @swagger-disabled-legacy
 * /api/performance-reviews/{id}:
 *   get:
 *     summary: Get performance review by ID
 *     description: Retrieve a specific performance review by its ID
 *     tags: [Performance Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Performance review ID
 *     responses:
 *       200:
 *         description: Performance review retrieved successfully
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
 *                   example: Performance review retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/PerformanceReview'
 *       404:
 *         description: Performance review not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/:id", authenticate, PerformanceReviewController.getPerformanceReviewById);

/**
 * @swagger-disabled-legacy
 * /api/performance-reviews/{id}:
 *   put:
 *     summary: Update performance review
 *     description: Update an existing performance review
 *     tags: [Performance Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Performance review ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reviewType:
 *                 type: string
 *                 enum: [ANNUAL, QUARTERLY, MONTHLY, PROJECT_BASED, GOAL_BASED]
 *               reviewPeriod:
 *                 type: string
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               reviewerId:
 *                 type: string
 *               stakeholderId:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [DRAFT, IN_PROGRESS, COMPLETED, APPROVED, REJECTED]
 *               stage:
 *                 type: string
 *                 enum: [SELF_ASSESSMENT, MANAGER_REVIEW, PEER_REVIEW, FINAL_REVIEW]
 *               reviewStartDate:
 *                 type: string
 *                 format: date-time
 *               reviewEndDate:
 *                 type: string
 *                 format: date-time
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *               completedDate:
 *                 type: string
 *                 format: date-time
 *               criteria:
 *                 type: array
 *                 items:
 *                   type: object
 *               scores:
 *                 type: array
 *                 items:
 *                   type: object
 *               overallScore:
 *                 type: number
 *               rating:
 *                 type: string
 *                 enum: [EXCEEDS_EXPECTATIONS, MEETS_EXPECTATIONS, BELOW_EXPECTATIONS, NEEDS_IMPROVEMENT]
 *               strengths:
 *                 type: string
 *               areasForImprovement:
 *                 type: string
 *               achievements:
 *                 type: string
 *               goals:
 *                 type: string
 *               developmentPlan:
 *                 type: string
 *               managerFeedback:
 *                 type: string
 *               selfFeedback:
 *                 type: string
 *               peerFeedback:
 *                 type: string
 *               stakeholderFeedback:
 *                 type: string
 *               actionItems:
 *                 type: array
 *                 items:
 *                   type: object
 *               nextReviewDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       200:
 *         description: Performance review updated successfully
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
 *                   example: Performance review updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/PerformanceReview'
 *       404:
 *         description: Performance review not found
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put("/:id", authenticate, PerformanceReviewController.updatePerformanceReview);

/**
 * @swagger-disabled-legacy
 * /api/performance-reviews/{id}:
 *   delete:
 *     summary: Delete performance review
 *     description: Delete a performance review and all associated feedback
 *     tags: [Performance Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Performance review ID
 *     responses:
 *       200:
 *         description: Performance review deleted successfully
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
 *                   example: Performance review deleted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: Performance review deleted successfully
 *       404:
 *         description: Performance review not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete("/:id", authenticate, PerformanceReviewController.deletePerformanceReview);

// ===== PERFORMANCE REVIEW FEEDBACK ROUTES =====

/**
 * @swagger-disabled-legacy
 * /api/performance-reviews/feedback:
 *   post:
 *     summary: Create performance review feedback
 *     description: Create feedback for a performance review
 *     tags: [Performance Reviews]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reviewId
 *               - feedbackProviderId
 *               - feedbackProviderType
 *               - feedbackType
 *               - content
 *             properties:
 *               reviewId:
 *                 type: string
 *               feedbackProviderId:
 *                 type: string
 *               feedbackProviderType:
 *                 type: string
 *                 enum: [MANAGER, PEER, SELF, STAKEHOLDER, DIRECT_REPORT]
 *               feedbackType:
 *                 type: string
 *                 enum: [STRENGTHS, IMPROVEMENT_AREAS, GOALS, DEVELOPMENT, GENERAL]
 *               content:
 *                 type: string
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               isPrivate:
 *                 type: boolean
 *               isAnonymous:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Performance review feedback created successfully
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
 *                   example: Performance review feedback created successfully
 *                 data:
 *                   $ref: '#/components/schemas/PerformanceReviewFeedback'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/feedback", authenticate, PerformanceReviewController.createPerformanceReviewFeedback);

/**
 * @swagger-disabled-legacy
 * /api/performance-reviews/feedback/{id}:
 *   put:
 *     summary: Update performance review feedback
 *     description: Update existing performance review feedback
 *     tags: [Performance Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Feedback ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               feedbackType:
 *                 type: string
 *                 enum: [STRENGTHS, IMPROVEMENT_AREAS, GOALS, DEVELOPMENT, GENERAL]
 *               content:
 *                 type: string
 *               rating:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 5
 *               isPrivate:
 *                 type: boolean
 *               isAnonymous:
 *                 type: boolean
 *               status:
 *                 type: string
 *                 enum: [DRAFT, SUBMITTED, APPROVED]
 *     responses:
 *       200:
 *         description: Performance review feedback updated successfully
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
 *                   example: Performance review feedback updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/PerformanceReviewFeedback'
 *       404:
 *         description: Feedback not found
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put("/feedback/:id", authenticate, PerformanceReviewController.updatePerformanceReviewFeedback);

/**
 * @swagger-disabled-legacy
 * /api/performance-reviews/feedback/{id}:
 *   delete:
 *     summary: Delete performance review feedback
 *     description: Delete performance review feedback
 *     tags: [Performance Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Feedback ID
 *     responses:
 *       200:
 *         description: Performance review feedback deleted successfully
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
 *                   example: Performance review feedback deleted successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                       example: Performance review feedback deleted successfully
 *       404:
 *         description: Feedback not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete("/feedback/:id", authenticate, PerformanceReviewController.deletePerformanceReviewFeedback);

/**
 * @swagger-disabled-legacy
 * /api/performance-reviews/cycles/{cycleId}/initiate:
 *   post:
 *     summary: Run company review cycle reminders (email only)
 *     description: >
 *       Does not bulk-create reviews or tasks. Emails active employees who already
 *       have a manager-assigned review overlapping this cycle, still at self-assessment
 *       stage, not locked, and who have not started self-assessment (no self feedback / ratings yet).
 *       After each successful reviewee email, sends optional awareness emails to the assigned
 *       reviewer (manager) and to the linked stakeholder (external contact) when addresses exist.
 *       Reviews with no cycleId are linked to this cycle after a successful reviewee email.
 *     tags: [Performance Reviews]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cycleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Reminder run completed
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
 *                 data:
 *                   type: object
 *                   properties:
 *                     cycleId:
 *                       type: string
 *                     emailsSent:
 *                       type: integer
 *                     emailsFailed:
 *                       type: integer
 *                     reviewerEmailsSent:
 *                       type: integer
 *                     stakeholderEmailsSent:
 *                       type: integer
 *                     skippedIneligible:
 *                       type: integer
 *                     candidatesConsidered:
 *                       type: integer
 *                     activeEmployeesWithLogin:
 *                       type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.post("/cycles/:cycleId/initiate", authenticate, PerformanceReviewController.initiateCycleForAllEmployees);

/**
 * @swagger-disabled-legacy
 * /api/performance-reviews/{id}/autopopulate:
 *   post:
 *     summary: Auto-populate the quantitative review snapshot
 *     tags: [Performance Reviews]
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
 *         description: Review quantitative snapshot generated successfully
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
 *                   example: Review quantitative snapshot generated successfully
 *                 data:
 *                   type: object
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.post("/:id/autopopulate", authenticate, PerformanceReviewController.autopopulateQuantitativeSnapshot);

/**
 * @swagger-disabled-legacy
 * /api/performance-reviews/{id}/finalize:
 *   post:
 *     summary: Finalize and lock a performance review
 *     tags: [Performance Reviews]
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
 *         description: Performance review finalised successfully
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
 *                   example: Performance review finalised successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     isLocked:
 *                       type: boolean
 *                     documentPayload:
 *                       type: object
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
/**
 * @swagger-disabled-legacy
 * /api/performance-reviews/{id}/complete-stage:
 *   post:
 *     summary: Complete the current workflow stage and advance to the next (no body)
 *     description: >
 *       Uses the stored stage only — e.g. SELF_REVIEW → MANAGER_REVIEW → FINAL_REVIEW.
 *       After FINAL_REVIEW, call POST /{id}/finalize to lock and generate the document.
 *     tags: [Performance Reviews]
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
 *         description: Stage advanced successfully
 */
router.post(
  "/:id/complete-stage",
  authenticate,
  PerformanceReviewController.completePerformanceReviewStage
);

router.post("/:id/finalize", authenticate, PerformanceReviewController.finalizePerformanceReview);

/**
 * @swagger-disabled-legacy
 * /api/performance-reviews/{id}/document:
 *   get:
 *     summary: Get the saved performance review document payload
 *     tags: [Performance Reviews]
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
 *         description: Performance review document retrieved successfully
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
 *                   example: Performance review document retrieved successfully
 *                 data:
 *                   type: object
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       403:
 *         description: Forbidden
 */
router.get("/:id/document", authenticate, PerformanceReviewController.getPerformanceReviewDocument);

/**
 * @swagger-disabled-legacy
 * /api/performance-reviews/{id}/document.pdf:
 *   get:
 *     summary: Download the finalized performance review PDF
 *     description: Returns the generated PDF after the review has been finalized/locked.
 *     tags: [Performance Reviews]
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
 *         description: PDF stream
 *         content:
 *           application/pdf:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: PDF not available (finalize first)
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.get("/:id/document.pdf", authenticate, PerformanceReviewController.downloadPerformanceReviewPdf);

export default router;

