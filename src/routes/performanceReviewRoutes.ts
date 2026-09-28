// @ts-nocheck
import express from "express";
import { PerformanceReviewController } from "../controllers/PerformanceReviewController";
import { authenticate } from "../middleware/authenticate";
import { methodGuard } from "../middleware/methodGuard"
import { requireAnyPermission } from "../middleware/permissionAuth"
import { PerformanceReviewService } from "../services/PerformanceReviewService"
import { prisma } from "../utils/database"
import { prisma } from "../utils/database";
import { scoped, orgOnly, personInScope, departmentInScope } from "../services/PerformanceScope";

const router = express.Router();
const READ_KEYS = ["performance.reviews.view", "performance.reviews.manage"]
const WRITE_KEYS = ["performance.reviews.manage"]
const guard = methodGuard(READ_KEYS, WRITE_KEYS)

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
 *           maximum: 6
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
// row scope (PerformanceScope): a review is set up for someone in the caller's reach, with a reviewer in their reach
const reviewPlacement = scoped(async (req, a) => {
  const b = req.body || {};
  if (b.revieweeId && !(await personInScope(a, b.revieweeId))) return "You can only set up reviews for people in your department.";
  if (b.reviewerId && !(await personInScope(a, b.reviewerId))) return "The reviewer must be someone in your department.";
  return null;
});
// feedback belongs to a review: whoever may see the review may add to it; only its author (or the organisation scope) changes it
const feedbackOnReview = scoped(async (req, a) => {
  const r = req.body?.reviewId ? await prisma.performanceReview.findUnique({ where: { id: String(req.body.reviewId) }, select: { revieweeId: true, reviewerId: true } }) : null;
  if (!r) return null;
  if (a.org || r.revieweeId === a.id || r.reviewerId === a.id || (await personInScope(a, r.revieweeId))) return null;
  return "This review is outside what your role can see.";
});
const feedbackAuthor = scoped(async (req, a) => {
  const f = await prisma.performanceReviewFeedback.findUnique({ where: { id: String(req.params.id) }, select: { feedbackProviderId: true } });
  if (!f) return null;
  return a.org || f.feedbackProviderId === a.id ? null : "Only the person who wrote this feedback can change it.";
});
router.post("/", authenticate, guard, reviewPlacement, PerformanceReviewController.createPerformanceReview);

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
router.get("/", authenticate, guard, PerformanceReviewController.getAllPerformanceReviews);

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
router.get("/analytics", authenticate, guard, orgOnly("Review analytics across the organisation are for organisation-wide roles."), PerformanceReviewController.getPerformanceReviewAnalytics);

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
router.get("/completion-rates", authenticate, guard, orgOnly("Review completion across the organisation is for organisation-wide roles."), PerformanceReviewController.getPerformanceReviewCompletionRates);

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
router.get("/reports/rating-distribution", authenticate, guard, scoped(async (req, a) => (a.org || String(req.query.organizationWide) === "true" || departmentInScope(a, req.query.departmentName) ? null : "You can only see your own department's ratings.")), PerformanceReviewController.getDepartmentRatingDistribution);

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
router.get("/:id", authenticate, guard, PerformanceReviewController.getPerformanceReviewById);

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
router.put("/:id", authenticate, guard, PerformanceReviewController.updatePerformanceReview);

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
router.delete("/:id", authenticate, guard, PerformanceReviewController.deletePerformanceReview);

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
 *                 maximum: 6
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
router.post("/feedback", authenticate, guard, feedbackOnReview, PerformanceReviewController.createPerformanceReviewFeedback);

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
 *                 maximum: 6
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
router.put("/feedback/:id", authenticate, guard, feedbackAuthor, PerformanceReviewController.updatePerformanceReviewFeedback);

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
router.delete("/feedback/:id", authenticate, guard, feedbackAuthor, PerformanceReviewController.deletePerformanceReviewFeedback);

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
router.post("/cycles/:cycleId/initiate", authenticate, guard, orgOnly("Starting a review cycle for everyone is for organisation-wide roles."), PerformanceReviewController.initiateCycleForAllEmployees);

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
router.post("/:id/autopopulate", authenticate, guard, PerformanceReviewController.autopopulateQuantitativeSnapshot);

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
  guard,
  PerformanceReviewController.completePerformanceReviewStage
);

router.post("/:id/finalize", authenticate, guard, PerformanceReviewController.finalizePerformanceReview);

// The reviewee's own steps need only the view permission; the service checks that the caller IS the reviewee.
const selfGuard = requireAnyPermission(READ_KEYS);
const selfRun = (fn) => async (req: any, res: any) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (e: any) {
    const m = String(e?.message || "Error").replace(/^Failed to advance performance review stage: /, "");
    res.status(/not found/i.test(m) ? 404 : /Only the person|Access denied/i.test(m) ? 403 : 400).json({ success: false, message: m });
  }
};
router.put("/:id/self-assessment", authenticate, selfGuard, selfRun((req) => PerformanceReviewService.saveSelfAssessment(req.params.id, req.body || {}, req.user)));
router.post("/:id/submit-self-assessment", authenticate, selfGuard, selfRun(async (req) => {
  const r = await prisma.performanceReview.findUnique({ where: { id: req.params.id }, select: { revieweeId: true } });
  if (!r) throw new Error("Performance review not found");
  if (r.revieweeId !== req.user.id) throw new Error("Only the person being reviewed submits the self-assessment.");
  return PerformanceReviewService.completeCurrentPerformanceReviewStage(req.params.id, req.user);
}));

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
router.get("/:id/document", authenticate, guard, PerformanceReviewController.getPerformanceReviewDocument);

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
router.get("/:id/document.pdf", authenticate, guard, PerformanceReviewController.downloadPerformanceReviewPdf);

export default router;

