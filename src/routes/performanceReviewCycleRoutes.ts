// @ts-nocheck
import express from "express";
import { PerformanceReviewCycleController } from "../controllers/PerformanceReviewCycleController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     PerformanceReviewCycle:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           description: Cycle ID
 *         title:
 *           type: string
 *           description: Cycle title
 *         reviewPeriodStart:
 *           type: string
 *           format: date-time
 *           description: Review period start date
 *         reviewPeriodEnd:
 *           type: string
 *           format: date-time
 *           description: Review period end date
 *         selfAssessmentDeadline:
 *           type: string
 *           format: date-time
 *           description: Self-assessment deadline
 *         peerReviewDeadline:
 *           type: string
 *           format: date-time
 *           description: Peer review deadline
 *         managerReviewDeadline:
 *           type: string
 *           format: date-time
 *           description: Manager review deadline
 *         availableReviewTypes:
 *           type: array
 *           items:
 *             type: string
 *           description: Available review types
 *         reviewRatingScale:
 *           type: string
 *           description: Review rating scale
 *         isActive:
 *           type: boolean
 *           description: Whether cycle is active
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Creation date
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update date
 *         reviews:
 *           type: array
 *           items:
 *             type: object
 *           description: Associated reviews
 */

/**
 * @swagger
 * /api/performance/review-cycles:
 *   post:
 *     summary: Create a new performance review cycle
 *     tags: [Performance Review Cycles]
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
 *               - reviewPeriodStart
 *               - reviewPeriodEnd
 *               - selfAssessmentDeadline
 *               - peerReviewDeadline
 *               - managerReviewDeadline
 *               - availableReviewTypes
 *               - reviewRatingScale
 *             properties:
 *               title:
 *                 type: string
 *                 description: Cycle title
 *                 example: "Q4 2024 Performance Review Cycle"
 *               reviewPeriodStart:
 *                 type: string
 *                 format: date-time
 *                 description: Review period start date
 *               reviewPeriodEnd:
 *                 type: string
 *                 format: date-time
 *                 description: Review period end date
 *               selfAssessmentDeadline:
 *                 type: string
 *                 format: date-time
 *                 description: Self-assessment deadline
 *               peerReviewDeadline:
 *                 type: string
 *                 format: date-time
 *                 description: Peer review deadline
 *               managerReviewDeadline:
 *                 type: string
 *                 format: date-time
 *                 description: Manager review deadline
 *               availableReviewTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Available review types
 *                 example: ["Self", "Manager", "Peer"]
 *               reviewRatingScale:
 *                 type: string
 *                 description: Review rating scale
 *                 example: "1-5 Scale"
 *     responses:
 *       201:
 *         description: Performance review cycle created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/PerformanceReviewCycle'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/", authenticate, PerformanceReviewCycleController.createReviewCycle);

/**
 * @swagger
 * /api/performance/review-cycles:
 *   get:
 *     summary: Get all performance review cycles
 *     tags: [Performance Review Cycles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
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
 *     responses:
 *       200:
 *         description: Performance review cycles retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     cycles:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/PerformanceReviewCycle'
 *                     total:
 *                       type: number
 *                     page:
 *                       type: number
 *                     limit:
 *                       type: number
 *                     totalPages:
 *                       type: number
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/", authenticate, PerformanceReviewCycleController.getAllReviewCycles);

/**
 * @swagger
 * /api/performance/review-cycles/{cycleId}:
 *   get:
 *     summary: Get review cycle by ID
 *     tags: [Performance Review Cycles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cycleId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cycle ID
 *     responses:
 *       200:
 *         description: Performance review cycle retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/PerformanceReviewCycle'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/:cycleId", authenticate, PerformanceReviewCycleController.getReviewCycleById);

/**
 * @swagger
 * /api/performance/review-cycles/{cycleId}:
 *   put:
 *     summary: Update performance review cycle
 *     tags: [Performance Review Cycles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cycleId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cycle ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Cycle title
 *               reviewPeriodStart:
 *                 type: string
 *                 format: date-time
 *                 description: Review period start date
 *               reviewPeriodEnd:
 *                 type: string
 *                 format: date-time
 *                 description: Review period end date
 *               selfAssessmentDeadline:
 *                 type: string
 *                 format: date-time
 *                 description: Self-assessment deadline
 *               peerReviewDeadline:
 *                 type: string
 *                 format: date-time
 *                 description: Peer review deadline
 *               managerReviewDeadline:
 *                 type: string
 *                 format: date-time
 *                 description: Manager review deadline
 *               availableReviewTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Available review types
 *               reviewRatingScale:
 *                 type: string
 *                 description: Review rating scale
 *               isActive:
 *                 type: boolean
 *                 description: Whether cycle is active
 *     responses:
 *       200:
 *         description: Performance review cycle updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/PerformanceReviewCycle'
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.put("/:cycleId", authenticate, PerformanceReviewCycleController.updateReviewCycle);

/**
 * @swagger
 * /api/performance/review-cycles/{cycleId}:
 *   delete:
 *     summary: Delete performance review cycle
 *     tags: [Performance Review Cycles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cycleId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cycle ID
 *     responses:
 *       200:
 *         description: Performance review cycle deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.delete("/:cycleId", authenticate, PerformanceReviewCycleController.deleteReviewCycle);

/**
 * @swagger
 * /api/performance/review-cycles/active:
 *   get:
 *     summary: Get active review cycle
 *     tags: [Performance Review Cycles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Active review cycle retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/PerformanceReviewCycle'
 *       404:
 *         description: No active review cycle found
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/active", authenticate, PerformanceReviewCycleController.getActiveReviewCycle);

/**
 * @swagger
 * /api/performance/review-cycles/check-deadlines:
 *   post:
 *     summary: Check review cycle deadlines
 *     tags: [Performance Review Cycles]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Review cycle deadlines checked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/check-deadlines", authenticate, PerformanceReviewCycleController.checkReviewCycleDeadlines);

/**
 * @swagger
 * /api/performance/review-cycles/{cycleId}/stats:
 *   get:
 *     summary: Get review cycle statistics
 *     tags: [Performance Review Cycles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cycleId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cycle ID
 *     responses:
 *       200:
 *         description: Review cycle statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     totalReviews:
 *                       type: number
 *                     completedReviews:
 *                       type: number
 *                     completionRate:
 *                       type: number
 *                     selfAssessments:
 *                       type: number
 *                     peerReviews:
 *                       type: number
 *                     managerReviews:
 *                       type: number
 *                     reviewPeriod:
 *                       type: object
 *                       properties:
 *                         start:
 *                           type: string
 *                           format: date-time
 *                         end:
 *                           type: string
 *                           format: date-time
 *                     deadlines:
 *                       type: object
 *                       properties:
 *                         selfAssessment:
 *                           type: string
 *                           format: date-time
 *                         peerReview:
 *                           type: string
 *                           format: date-time
 *                         managerReview:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/:cycleId/stats", authenticate, PerformanceReviewCycleController.getReviewCycleStats);

/**
 * @swagger
 * /api/performance/review-cycles/{cycleId}/close:
 *   post:
 *     summary: Close review cycle
 *     tags: [Performance Review Cycles]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cycleId
 *         required: true
 *         schema:
 *           type: string
 *         description: Cycle ID
 *     responses:
 *       200:
 *         description: Review cycle closed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/:cycleId/close", authenticate, PerformanceReviewCycleController.closeReviewCycle);

export default router;
