//@ts-nocheck
import express from 'express';
import { BoardReviewController } from '../controllers/BoardReviewController';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';

const router = express.Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     BoardReview:
 *       type: object
 *       required:
 *         - applicationId
 *         - reviewerId
 *       properties:
 *         id:
 *           type: string
 *           description: Unique identifier for the board review
 *         applicationId:
 *           type: string
 *           description: ID of the application being reviewed
 *         reviewerId:
 *           type: string
 *           description: ID of the reviewer
 *         investmentApproved:
 *           type: boolean
 *           description: Whether the investment is approved
 *         investmentRejected:
 *           type: boolean
 *           description: Whether the investment is rejected
 *         conditionalApproval:
 *           type: boolean
 *           description: Whether conditional approval is granted
 *         recommendationReport:
 *           type: string
 *           description: Condensed proposal/recommendation report
 *         additionalInformation:
 *           type: string
 *           description: Additional information requested
 *         decisionReason:
 *           type: string
 *           description: Reason for the board decision
 *         conditions:
 *           type: string
 *           description: Conditions for conditional approval
 *         nextSteps:
 *           type: string
 *           description: Next steps after board decision
 *         overallScore:
 *           type: number
 *           format: float
 *           minimum: 0
 *           maximum: 100
 *           description: Overall score (0-100%)
 *         finalComments:
 *           type: string
 *           description: Final comments and assessment
 *         status:
 *           type: string
 *           enum: [IN_PROGRESS, COMPLETED]
 *           description: Status of the board review
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 *         completedAt:
 *           type: string
 *           format: date-time
 *         reviewer:
 *           $ref: '#/components/schemas/User'
 *         application:
 *           $ref: '#/components/schemas/Application'
 *     
 *     CreateBoardReviewRequest:
 *       type: object
 *       properties:
 *         investmentApproved:
 *           type: boolean
 *           description: Whether to approve the investment
 *         investmentRejected:
 *           type: boolean
 *           description: Whether to reject the investment
 *         conditionalApproval:
 *           type: boolean
 *           description: Whether to grant conditional approval
 *         recommendationReport:
 *           type: string
 *           description: Condensed proposal/recommendation report
 *         additionalInformation:
 *           type: string
 *           description: Additional information requested
 *         decisionReason:
 *           type: string
 *           description: Reason for the board decision
 *         conditions:
 *           type: string
 *           description: Conditions for conditional approval
 *         nextSteps:
 *           type: string
 *           description: Next steps after board decision
 *         overallScore:
 *           type: number
 *           format: float
 *           minimum: 0
 *           maximum: 100
 *           description: Overall score (0-100%)
 *         finalComments:
 *           type: string
 *           description: Final comments and assessment
 *     
 *     UpdateBoardReviewRequest:
 *       type: object
 *       properties:
 *         investmentApproved:
 *           type: boolean
 *         investmentRejected:
 *           type: boolean
 *         conditionalApproval:
 *           type: boolean
 *         recommendationReport:
 *           type: string
 *         additionalInformation:
 *           type: string
 *         decisionReason:
 *           type: string
 *         conditions:
 *           type: string
 *         nextSteps:
 *           type: string
 *         overallScore:
 *           type: number
 *           format: float
 *           minimum: 0
 *           maximum: 100
 *           description: Overall score (0-100%)
 *         finalComments:
 *           type: string
 *           description: Final comments and assessment
 *     
 *     BoardReviewSummary:
 *       type: object
 *       properties:
 *         total:
 *           type: integer
 *           description: Total number of board reviews
 *         completed:
 *           type: integer
 *           description: Number of completed reviews
 *         pending:
 *           type: integer
 *           description: Number of pending reviews
 *         myReviews:
 *           type: integer
 *           description: Number of reviews by current user
 *         completionRate:
 *           type: integer
 *           description: Completion rate percentage
 */

/**
 * @swagger
 * /api/board-reviews/voting-members:
 *   get:
 *     summary: List board voting members
 *     description: Retrieve board members eligible to vote along with their current voting power configuration
 *     tags: [Voting Process]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Board voting members retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */
router.get('/voting-members', authenticate, authorize(["admin", "fund_manager", "BOARD_CHAIR"]), BoardReviewController.getBoardVotingMembers);

/**
 * @swagger
 * /api/board-reviews/voting-members/{userId}/voting-power:
 *   put:
 *     summary: Configure voting power for a board member
 *     description: Set or update the weighted voting percentage for a board member. The total voting power across members cannot exceed 100%.
 *     tags: [Voting Process]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: Board member user ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               votingPower:
 *                 type: number
 *                 format: double
 *                 nullable: true
 *                 minimum: 0
 *                 maximum: 100
 *                 example: 25
 *                 description: "Percentage to assign. Provide null to clear voting power."
 *     responses:
 *       200:
 *         description: Voting power updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: User not found
 */
router.put('/voting-members/:userId/voting-power', authenticate, authorize(["admin", "fund_manager", "BOARD_CHAIR"]), BoardReviewController.updateVotingPower);

/**
 * @swagger
 * /api/board-reviews/{applicationId}:
 *   post:
 *     summary: Create a new board review
 *     description: Create a board review for an application that has completed due diligence
 *     tags: [Voting Process]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateBoardReviewRequest'
 *           example:
 *             investmentApproved: true
 *             recommendationReport: "Based on our analysis, we recommend approving this investment..."
 *             decisionReason: "Strong market potential and solid financial projections"
 *             nextSteps: "Proceed to term sheet negotiation"
 *     responses:
 *       201:
 *         description: Board review created successfully
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
 *                   $ref: '#/components/schemas/BoardReview'
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/:applicationId', authenticate, BoardReviewController.createBoardReview);

/**
 * @swagger
 * /api/board-reviews/{applicationId}:
 *   get:
 *     summary: Get board review by application ID
 *     description: Retrieve board review details for a specific application
 *     tags: [Voting Process]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     responses:
 *       200:
 *         description: Board review retrieved successfully
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
 *                   $ref: '#/components/schemas/BoardReview'
 *       404:
 *         description: Board review not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/:applicationId', authenticate, BoardReviewController.getBoardReviewByApplicationId);

/**
 * @swagger
 * /api/board-reviews/{applicationId}:
 *   put:
 *     summary: Update board review
 *     description: Update an existing board review
 *     tags: [Voting Process]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateBoardReviewRequest'
 *           example:
 *             investmentApproved: true
 *             recommendationReport: "Updated recommendation report..."
 *             decisionReason: "Updated decision reason"
 *     responses:
 *       200:
 *         description: Board review updated successfully
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
 *                   $ref: '#/components/schemas/BoardReview'
 *       404:
 *         description: Board review not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put('/:applicationId', authenticate, BoardReviewController.updateBoardReview);

/**
 * @swagger
 * /api/board-reviews/{applicationId}/votes:
 *   post:
 *     summary: Cast a board review vote
 *     description: Submit a yes/no vote for a board review. Only eligible board members can vote.
 *     tags: [Voting Process]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
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
 *             required: [vote]
 *             properties:
 *               vote:
 *                 type: string
 *                 enum: [APPROVE, REJECT]
 *               comment:
 *                 type: string
 *                 description: Optional comment to accompany the vote
 *     responses:
 *       200:
 *         description: Vote recorded successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */
router.post('/:applicationId/votes', authenticate, BoardReviewController.submitBoardVote);

/**
 * @swagger
 * /api/board-reviews/{applicationId}/votes/summary:
 *   get:
 *     summary: Get board vote summary
 *     description: Retrieve the weighted vote summary for a board review. Votes remain anonymous until the review is completed.
 *     tags: [Voting Process]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     responses:
 *       200:
 *         description: Vote summary retrieved successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */
router.get('/:applicationId/votes/summary', authenticate, BoardReviewController.getBoardVoteSummary);

/**
 * @swagger
 * /api/board-reviews/{applicationId}/complete:
 *   post:
 *     summary: Complete board review
 *     description: Complete a board review and update application stage
 *     tags: [Voting Process]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Application ID
 *     responses:
 *       200:
 *         description: Board review completed successfully
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
 *                   $ref: '#/components/schemas/BoardReview'
 *       404:
 *         description: Board review not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/:applicationId/complete', authenticate, BoardReviewController.completeBoardReview);

/**
 * @swagger
 * /api/board-reviews:
 *   get:
 *     summary: Get all board reviews
 *     description: Retrieve all board reviews with pagination and filtering
 *     tags: [Board Reviews]
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
 *           enum: [IN_PROGRESS, COMPLETED]
 *         description: Filter by status
 *     responses:
 *       200:
 *         description: Board reviews retrieved successfully
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
 *                     boardReviews:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/BoardReview'
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticate, BoardReviewController.getAllBoardReviews);

/**
 * @swagger
 * /api/board-reviews/my:
 *   get:
 *     summary: Get my board reviews
 *     description: Retrieve board reviews assigned to the current user
 *     tags: [Board Reviews]
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
 *     responses:
 *       200:
 *         description: My board reviews retrieved successfully
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
 *                     boardReviews:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/BoardReview'
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     totalPages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/my', authenticate, BoardReviewController.getMyBoardReviews);

/**
 * @swagger
 * /api/board-reviews/summary:
 *   get:
 *     summary: Get board review summary
 *     description: Get summary statistics for board reviews
 *     tags: [Board Reviews]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Board review summary retrieved successfully
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
 *                   $ref: '#/components/schemas/BoardReviewSummary'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/summary', authenticate, BoardReviewController.getBoardReviewSummary);

export default router;
