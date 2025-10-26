// @ts-nocheck
import express from "express";
import { CashbookTransferController } from "../controllers/CashbookTransferController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// ============================================================================
// CASHBOOK TRANSFERS - Between different bank accounts
// ============================================================================

/**
 * @swagger
 * tags:
 *   name: Cashbook Transfers
 *   description: Between different bank accounts
 */

/**
 * @swagger
 * /api/cashbook/transfers:
 *   post:
 *     summary: Create cashbook transfer
 *     description: Create a transfer between two bank accounts
     *     tags: [Cashbook Transfers]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fromBankId
 *               - toBankId
 *               - amount
 *               - description
 *             properties:
 *               fromBankId:
 *                 type: string
 *                 description: Source bank account ID
 *               toBankId:
 *                 type: string
 *                 description: Destination bank account ID
 *               amount:
 *                 type: number
 *                 description: Transfer amount
 *               transferDate:
 *                 type: string
 *                 format: date
 *                 description: Transfer date (defaults to current date)
 *               description:
 *                 type: string
 *                 description: Transfer description
 *               reference:
 *                 type: string
 *                 description: Transfer reference (auto-generated if not provided)
 *               projectCode:
 *                 type: string
 *                 description: Project code
 *     responses:
 *       200:
 *         description: Transfer created successfully
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
 *                     transferId:
 *                       type: string
 *                     fromTransactionId:
 *                       type: string
 *                     toTransactionId:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     transferDate:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/", CashbookTransferController.createTransfer);

/**
 * @swagger
 * /api/cashbook/transfers/{transferId}:
 *   get:
 *     summary: Get transfer details
 *     description: Get detailed information about a specific transfer
     *     tags: [Cashbook Transfers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transferId
 *         required: true
 *         schema:
 *           type: string
 *         description: Transfer ID
 *     responses:
 *       200:
 *         description: Transfer details retrieved successfully
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
 *                     id:
 *                       type: string
 *                     fromBankId:
 *                       type: string
 *                     toBankId:
 *                       type: string
 *                     amount:
 *                       type: number
 *                     transferDate:
 *                       type: string
 *                       format: date-time
 *                     description:
 *                       type: string
 *                     reference:
 *                       type: string
 *                     projectCode:
 *                       type: string
 *                     status:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     fromBank:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         accountNumber:
 *                           type: string
 *                     toBank:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         accountNumber:
 *                           type: string
 *                     createdBy:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         firstName:
 *                           type: string
 *                         lastName:
 *                           type: string
 *                         email:
 *                           type: string
 *                     transactions:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.get("/:transferId", CashbookTransferController.getTransfer);

/**
 * @swagger
 * /api/cashbook/transfers:
 *   get:
 *     summary: List transfers
 *     description: Get paginated list of transfers for the authenticated user
     *     tags: [Cashbook Transfers]
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
 *           default: 50
 *         description: Number of items per page
 *       - in: query
 *         name: fromBankId
 *         schema:
 *           type: string
 *         description: Filter by source bank ID
 *       - in: query
 *         name: toBankId
 *         schema:
 *           type: string
 *         description: Filter by destination bank ID
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter from date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter to date
 *     responses:
 *       200:
 *         description: Transfers retrieved successfully
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
 *                     transfers:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           fromBankId:
 *                             type: string
 *                           toBankId:
 *                             type: string
 *                           amount:
 *                             type: number
 *                           transferDate:
 *                             type: string
 *                             format: date-time
 *                           description:
 *                             type: string
 *                           reference:
 *                             type: string
 *                           status:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           fromBank:
 *                             type: object
 *                           toBank:
 *                             type: object
 *                           createdBy:
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
router.get("/", CashbookTransferController.listTransfers);

/**
 * @swagger
 * /api/cashbook/transfers/summary:
 *   get:
 *     summary: Get transfer summary
 *     description: Get summary statistics for transfers
     *     tags: [Cashbook Transfers]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter from date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter to date
 *     responses:
 *       200:
 *         description: Transfer summary retrieved successfully
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
 *                     totalTransfers:
 *                       type: number
 *                     totalAmount:
 *                       type: number
 *                     bankSummary:
 *                       type: object
 *                       additionalProperties:
 *                         type: object
 *                         properties:
 *                           out:
 *                             type: number
 *                           in:
 *                             type: number
 *       401:
 *         description: Unauthorized
 */
router.get("/summary", CashbookTransferController.getTransferSummary);

export default router;

