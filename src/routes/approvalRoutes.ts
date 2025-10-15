import express from "express";
import { ApprovalController } from "../controllers/ApprovalController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /api/approvals/my-pending:
 *   get:
 *     summary: Get my pending approvals
 *     tags: [Approvals]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending approvals assigned to the logged-in user
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
 *                 count:
 *                   type: number
 *       401:
 *         description: Unauthorized
 */
router.get("/my-pending", ApprovalController.getMyPendingApprovals);

/**
 * @swagger
 * /api/approvals/{id}/approve:
 *   post:
 *     summary: Approve an approval
 *     tags: [Approvals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Approval ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               comments:
 *                 type: string
 *                 description: Optional comments for the approval
 *               signatureData:
 *                 type: string
 *                 description: Optional base64 encoded signature image
 *     responses:
 *       200:
 *         description: Approval approved successfully
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
 *       400:
 *         description: Bad request (e.g., approval already processed)
 *       401:
 *         description: Unauthorized
 */
router.post("/:id/approve", ApprovalController.approveApproval);

/**
 * @swagger
 * /api/approvals/{id}/reject:
 *   post:
 *     summary: Reject an approval
 *     tags: [Approvals]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Approval ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - comments
 *             properties:
 *               comments:
 *                 type: string
 *                 description: Required comments explaining the rejection
 *     responses:
 *       200:
 *         description: Approval rejected successfully
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
 *       400:
 *         description: Bad request (e.g., comments not provided)
 *       401:
 *         description: Unauthorized
 */
router.post("/:id/reject", ApprovalController.rejectApproval);

export default router;


