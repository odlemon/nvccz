// @ts-nocheck
import express from "express";
import { serviceRequestController } from "../controllers/ServiceRequestController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * /service-requests:
 *   get:
 *     summary: List the signed-in user's own service requests
 *     tags: [ServiceRequests]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Requests retrieved successfully
 *   post:
 *     summary: Create a service request (leave, expense claim, IT, travel, facilities, etc.)
 *     tags: [ServiceRequests]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, summary]
 *             properties:
 *               type:
 *                 type: string
 *                 description: The Home hub's service-catalog id, e.g. leave, expenses, payroll, learning, travel, facilities, support
 *               summary:
 *                 type: string
 *               amount:
 *                 type: number
 *                 description: Only meaningful for type=expense
 *     responses:
 *       201:
 *         description: Request created successfully
 *       400:
 *         description: Invalid type, missing summary, or invalid amount
 */
router.get("/", serviceRequestController.listMine);
router.post("/", serviceRequestController.create);

export default router;
