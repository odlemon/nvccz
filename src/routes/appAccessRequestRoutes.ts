// @ts-nocheck
import express from "express";
import { appAccessRequestController } from "../controllers/AppAccessRequestController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * /app-access-requests:
 *   get:
 *     summary: List the signed-in user's own app access requests
 *     tags: [AppAccessRequests]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Requests retrieved successfully
 *   post:
 *     summary: Request access to another Matanho module
 *     tags: [AppAccessRequests]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [appId]
 *             properties:
 *               appId:
 *                 type: string
 *                 description: The Home hub's connected-apps catalog id, e.g. portfolio-v11
 *               reason:
 *                 type: string
 *     responses:
 *       201:
 *         description: Request created successfully
 *       200:
 *         description: A pending request for this app already existed
 *       400:
 *         description: Missing or invalid appId/reason
 */
router.get("/", appAccessRequestController.listMine);
router.post("/", appAccessRequestController.create);

export default router;
