import express from "express";
import { assistantController } from "../controllers/AssistantController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /assistant/chat:
 *   post:
 *     summary: Ask Matanho Assistant a question
 *     description: |
 *       Sends the message (plus a client-managed conversation history — no thread is persisted
 *       server-side) to the configured LLM (see LlmChatService) and returns its reply.
 *     tags: [Assistant]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - prompt
 *             properties:
 *               prompt:
 *                 type: string
 *                 description: The user's message
 *               history:
 *                 type: array
 *                 description: Prior turns in this conversation, oldest first
 *                 items:
 *                   type: object
 *                   properties:
 *                     role:
 *                       type: string
 *                       enum: [user, assistant]
 *                     content:
 *                       type: string
 *     responses:
 *       200:
 *         description: Assistant replied successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     reply:
 *                       type: string
 *       400:
 *         description: Bad request - prompt is required
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: The LLM call failed
 */
router.post("/chat", assistantController.chat);

export default router;
