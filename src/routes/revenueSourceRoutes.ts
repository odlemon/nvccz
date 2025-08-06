// @ts-nocheck
import { Router } from "express";
import RevenueSourceController from "../controllers/RevenueSourceController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = Router();

/**
 * @swagger
 * /api/accounting/revenue-sources:
 *   post:
 *     summary: Create a new revenue source
 *     description: Create a new revenue source for categorizing revenue transactions
 *     tags: [Accounting - Revenue Sources]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the revenue source
 *                 example: "Consulting Services"
 *               description:
 *                 type: string
 *                 description: Description of the revenue source
 *                 example: "Professional consulting and advisory services"
 *     responses:
 *       201:
 *         description: Revenue source created successfully
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
 *                   example: Revenue source created successfully
 *                 data:
 *                   $ref: '#/components/schemas/RevenueSource'
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Conflict - revenue source with this name already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/", authenticate, authorize(["admin", "accountant"]), RevenueSourceController.createRevenueSource);

/**
 * @swagger
 * /api/accounting/revenue-sources:
 *   get:
 *     summary: Get all revenue sources
 *     description: Retrieve all revenue sources with optional filtering
 *     tags: [Accounting - Revenue Sources]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Revenue sources retrieved successfully
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
 *                   example: Revenue sources retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/RevenueSource'
 */
router.get("/", authenticate, authorize(["admin", "accountant"]), RevenueSourceController.getAllRevenueSources);

/**
 * @swagger
 * /api/accounting/revenue-sources/{id}:
 *   get:
 *     summary: Get revenue source by ID
 *     description: Retrieve a single revenue source by its ID
 *     tags: [Accounting - Revenue Sources]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Revenue source ID
 *     responses:
 *       200:
 *         description: Revenue source retrieved successfully
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
 *                   example: Revenue source retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/RevenueSource'
 *       404:
 *         description: Revenue source not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/:id", authenticate, authorize(["admin", "accountant"]), RevenueSourceController.getRevenueSourceById);

/**
 * @swagger
 * /api/accounting/revenue-sources/{id}:
 *   put:
 *     summary: Update revenue source
 *     description: Update an existing revenue source
 *     tags: [Accounting - Revenue Sources]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Revenue source ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the revenue source
 *               description:
 *                 type: string
 *                 description: Description of the revenue source
 *               isActive:
 *                 type: boolean
 *                 description: Whether the revenue source is active
 *     responses:
 *       200:
 *         description: Revenue source updated successfully
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
 *                   example: Revenue source updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/RevenueSource'
 *       404:
 *         description: Revenue source not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Conflict - revenue source with this name already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put("/:id", authenticate, authorize(["admin", "accountant"]), RevenueSourceController.updateRevenueSource);

/**
 * @swagger
 * /api/accounting/revenue-sources/{id}:
 *   delete:
 *     summary: Delete revenue source
 *     description: Soft delete a revenue source by setting isActive to false
 *     tags: [Accounting - Revenue Sources]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Revenue source ID
 *     responses:
 *       200:
 *         description: Revenue source deleted successfully
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
 *                   example: Revenue source deleted successfully
 *                 data:
 *                   $ref: '#/components/schemas/RevenueSource'
 *       404:
 *         description: Revenue source not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       400:
 *         description: Bad request - revenue source is being used
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete("/:id", authenticate, authorize(["admin", "accountant"]), RevenueSourceController.deleteRevenueSource);

export default router; 