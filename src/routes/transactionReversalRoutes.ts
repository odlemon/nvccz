// @ts-nocheck
import express from "express";
import { TransactionReversalController } from "../controllers/TransactionReversalController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * /api/cashbook/transactions/{transactionId}/reverse:
 *   post:
 *     summary: Reverse a posted transaction
 *     description: Create a reversal transaction for a posted cashbook entry
 *     tags: [Cashbook - Transaction Reversal]
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID to reverse
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for reversal
 *                 example: "Data entry error"
 *               description:
 *                 type: string
 *                 description: Additional description for reversal
 *               reverseDate:
 *                 type: string
 *                 format: date
 *                 description: Date for reversal (defaults to current date)
 *     responses:
 *       200:
 *         description: Transaction reversed successfully
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
 *                     originalTransactionId:
 *                       type: string
 *                     reversalTransactionId:
 *                       type: string
 *                     reversalAmount:
 *                       type: number
 *                     reversalDate:
 *                       type: string
 *                       format: date-time
 *                     reason:
 *                       type: string
 *       400:
 *         description: Bad request - transaction cannot be reversed
 *       401:
 *         description: Unauthorized
 */
router.post("/:transactionId/reverse", TransactionReversalController.reverseTransaction);

/**
 * @swagger
 * /api/cashbook/transactions/{transactionId}/reversal-history:
 *   get:
 *     summary: Get reversal history for a transaction
 *     description: Get all reversal transactions for a specific original transaction
 *     tags: [Cashbook - Transaction Reversal]
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Original transaction ID
 *     responses:
 *       200:
 *         description: Reversal history retrieved successfully
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
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       originalTransactionId:
 *                         type: string
 *                       amount:
 *                         type: number
 *                       description:
 *                         type: string
 *                       reversalReason:
 *                         type: string
 *                       reversalDescription:
 *                         type: string
 *                       transactionDate:
 *                         type: string
 *                         format: date-time
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       bank:
 *                         type: object
 *                       customer:
 *                         type: object
 *                       vendor:
 *                         type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/:transactionId/reversal-history", TransactionReversalController.getReversalHistory);

/**
 * @swagger
 * /api/cashbook/reversals:
 *   get:
 *     summary: Get all reversals for a user
 *     description: Get paginated list of all reversal transactions created by the user
 *     tags: [Cashbook - Transaction Reversal]
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
 *           default: 50
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Reversals retrieved successfully
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
 *                     reversals:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           originalTransactionId:
 *                             type: string
 *                           amount:
 *                             type: number
 *                           description:
 *                             type: string
 *                           reversalReason:
 *                             type: string
 *                           reversalDescription:
 *                             type: string
 *                           transactionDate:
 *                             type: string
 *                             format: date-time
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           bank:
 *                             type: object
 *                           customer:
 *                             type: object
 *                           vendor:
 *                             type: object
 *                           originalTransaction:
 *                             type: object
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: number
 *                         limit:
 *                           type: number
 *                         total:
 *                           type: number
 *                         pages:
 *                           type: number
 *       401:
 *         description: Unauthorized
 */
router.get("/", TransactionReversalController.getAllReversals);

/**
 * @swagger
 * /api/cashbook/transactions/{transactionId}/can-reverse:
 *   get:
 *     summary: Check if transaction can be reversed
 *     description: Check if a transaction is eligible for reversal
 *     tags: [Cashbook - Transaction Reversal]
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID to check
 *     responses:
 *       200:
 *         description: Reversal eligibility checked successfully
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
 *                     canReverse:
 *                       type: boolean
 *                     reason:
 *                       type: string
 *                       enum: [OK, Not posted, Already reversed, Period locked]
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/:transactionId/can-reverse", TransactionReversalController.canReverseTransaction);

export default router;

