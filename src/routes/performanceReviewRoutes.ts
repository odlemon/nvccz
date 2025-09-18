// @ts-nocheck
import express from "express";
import { PerformanceReviewController } from "../controllers/PerformanceReviewController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = express.Router();

/**
 * @swagger
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
 *           enum: [SELF_ASSESSMENT, MANAGER_REVIEW, PEER_REVIEW, FINAL_REVIEW]
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
 * @swagger
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
router.post("/", authenticate, authorize(["ADMIN", "MANAGER"]), PerformanceReviewController.createPerformanceReview);

/**
 * @swagger
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
router.get("/", authenticate, authorize(["ADMIN", "MANAGER", "USER"]), PerformanceReviewController.getAllPerformanceReviews);

/**
 * @swagger
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
router.get("/analytics", authenticate, authorize(["ADMIN", "MANAGER"]), PerformanceReviewController.getPerformanceReviewAnalytics);

/**
 * @swagger
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
router.get("/completion-rates", authenticate, authorize(["ADMIN", "MANAGER"]), PerformanceReviewController.getPerformanceReviewCompletionRates);

/**
 * @swagger
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
router.get("/:id", authenticate, authorize(["ADMIN", "MANAGER", "USER"]), PerformanceReviewController.getPerformanceReviewById);

/**
 * @swagger
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
router.put("/:id", authenticate, authorize(["ADMIN", "MANAGER"]), PerformanceReviewController.updatePerformanceReview);

/**
 * @swagger
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
router.delete("/:id", authenticate, authorize(["ADMIN"]), PerformanceReviewController.deletePerformanceReview);

// ===== PERFORMANCE REVIEW FEEDBACK ROUTES =====

/**
 * @swagger
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
router.post("/feedback", authenticate, authorize(["ADMIN", "MANAGER", "USER"]), PerformanceReviewController.createPerformanceReviewFeedback);

/**
 * @swagger
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
router.put("/feedback/:id", authenticate, authorize(["ADMIN", "MANAGER", "USER"]), PerformanceReviewController.updatePerformanceReviewFeedback);

/**
 * @swagger
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
router.delete("/feedback/:id", authenticate, authorize(["ADMIN", "MANAGER"]), PerformanceReviewController.deletePerformanceReviewFeedback);

export default router;

