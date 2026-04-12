//@ts-nocheck
import express from 'express';
import multer from 'multer';
import { BoardReviewController } from '../controllers/BoardReviewController';
import { authenticate } from '../middleware/authenticate';

const router = express.Router();

const imUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const okMime =
      [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/msword',
        'application/vnd.ms-excel'
      ].includes(file.mimetype) ||
      /\.(pdf|doc|docx|xls|xlsx)$/i.test(file.originalname || '');
    if (okMime) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Word, or Excel files are allowed for the Investment Memorandum'));
    }
  }
});

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
 * /board-reviews/voting-members:
 *   get:
 *     summary: List board voting members
 *     description: |
 *       Role codes BOARD_CHAIR, BOARD_MEMBER, INV_COMM_MEM, CIO. Investments-only filter when NVCCZ_STRICT_BOARD_VOTE=true.
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
router.get('/voting-members', authenticate, BoardReviewController.getBoardVotingMembers);

/**
 * @swagger
 * /board-reviews/voting-members/{userId}/voting-power:
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
router.put('/voting-members/:userId/voting-power', authenticate, BoardReviewController.updateVotingPower);

/**
 * @swagger
 * /board-reviews/{applicationId}/investment-memorandum:
 *   post:
 *     summary: Upload Investment Memorandum and open vote (same multipart body as create board review)
 *     description: |
 *       **multipart/form-data** only. Same optional text/boolean fields as `POST /board-reviews/{applicationId}`.
 *       Required file field **`document`**. Booleans as strings `true` / `false`. Omitted booleans default to false when **creating** a new board review; when a review already exists, only fields you include in the form are patched.
 *       Extra field **`resendNotifications`** (optional): `true` to resend IC vote emails if already READY_FOR_VOTE.
 *       If no board review row exists: creates it, uploads IM, call-to-vote + IC emails. If it exists: patch (optional), upload IM, call-to-vote.
 *     tags: [Voting Process]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: applicationId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - document
 *             properties:
 *               document:
 *                 type: string
 *                 format: binary
 *               recommendationReport:
 *                 type: string
 *               additionalInformation:
 *                 type: string
 *               decisionReason:
 *                 type: string
 *               conditions:
 *                 type: string
 *               nextSteps:
 *                 type: string
 *               overallScore:
 *                 type: string
 *                 description: Numeric score as text (e.g. 85.5)
 *               finalComments:
 *                 type: string
 *               investmentApproved:
 *                 type: string
 *                 description: "true" or "false"
 *               investmentRejected:
 *                 type: string
 *               conditionalApproval:
 *                 type: string
 *               resendNotifications:
 *                 type: string
 *                 description: Optional. "true" to force resending vote invite emails.
 *     responses:
 *       200:
 *         description: Existing board review — IM uploaded and call to vote completed
 *       201:
 *         description: New board review created — IM uploaded and call to vote completed
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/:applicationId/investment-memorandum',
  authenticate,
  (req, res, next) => {
    imUpload.single('document')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message || 'Invalid upload' });
      }
      next();
    });
  },
  BoardReviewController.uploadInvestmentMemorandum
);

/**
 * Call to vote — sets IM to READY_FOR_VOTE, emails IC members (idempotent). Body optional: { "resendNotifications": true }
 */
router.post('/:applicationId/call-to-vote', authenticate, BoardReviewController.callToVote);

/**
 * Returns IM metadata + URL; writes audit log row BOARD_IM_VIEWED.
 */
router.get('/:applicationId/investment-memorandum', authenticate, BoardReviewController.getInvestmentMemorandumAccess);

/**
 * @swagger
 * /board-reviews/{applicationId}:
 *   post:
 *     summary: Create board review and upload final Investment Memorandum
 *     description: |
 *       **multipart/form-data** only. Required file field **`document`** (PDF/DOC/XLSX). Optional text fields: recommendationReport, finalComments, decisionReason, nextSteps, conditions, additionalInformation, overallScore, investmentApproved, investmentRejected, conditionalApproval (booleans as true/false strings).
 *       After success: IM stored, status READY_FOR_VOTE, IC members emailed automatically (no separate call-to-vote).
 *     tags: [Voting Process, Updated investment flow]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - document
 *             properties:
 *               document:
 *                 type: string
 *                 format: binary
 *                 description: Final Investment Memorandum
 *               recommendationReport:
 *                 type: string
 *               additionalInformation:
 *                 type: string
 *               decisionReason:
 *                 type: string
 *               conditions:
 *                 type: string
 *               nextSteps:
 *                 type: string
 *               overallScore:
 *                 type: string
 *                 description: Numeric score as text (e.g. 85.5)
 *               finalComments:
 *                 type: string
 *               investmentApproved:
 *                 type: string
 *                 description: "true" or "false" (omit defaults to false)
 *               investmentRejected:
 *                 type: string
 *               conditionalApproval:
 *                 type: string
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
router.post(
  '/:applicationId',
  authenticate,
  (req, res, next) => {
    imUpload.single('document')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message || 'Invalid upload' });
      }
      next();
    });
  },
  BoardReviewController.createBoardReview
);

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
 * /board-reviews/{applicationId}/votes:
 *   post:
 *     summary: Cast a board review vote
 *     description: |
 *       `comment` is **required** when `vote` is APPROVE. When `NVCCZ_STRICT_BOARD_VOTE=true`, only eligible Investments board/IC users may vote; otherwise any authenticated user (UAT). Quorum auto-complete uses env `BOARD_VOTE_QUORUM_YES_COUNT` (default 3).
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
 *                 description: Required for APPROVE; optional for REJECT
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
 * /board-reviews/{applicationId}/votes/summary:
 *   get:
 *     summary: Get board vote summary
 *     description: |
 *       Weighted vote summary; votes hidden until review is completed. When `NVCCZ_STRICT_BOARD_VOTE=true`, restricted to admin/fund_manager or Investments BOARD_MEMBER/BOARD_CHAIR; otherwise any authenticated user (UAT).
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
 * /board-reviews/{applicationId}/complete:
 *   post:
 *     summary: Complete board review
 *     description: |
 *       Finalize voting and move application stage. When `NVCCZ_STRICT_BOARD_VOTE=true`, only Board Chair (Investments) may call; otherwise any authenticated user (UAT).
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
 * /board-reviews:
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
 * /board-reviews/my:
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
 * /board-reviews/summary:
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
