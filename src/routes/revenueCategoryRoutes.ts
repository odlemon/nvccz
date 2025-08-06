// @ts-nocheck
import { Router } from "express";
import RevenueCategoryController from "../controllers/RevenueCategoryController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

const router = Router();

/**
 * @swagger
 * /api/accounting/revenue-categories:
 *   post:
 *     summary: Create a new revenue category
 *     description: Create a new revenue category for organizing revenue transactions
 *     tags: [Accounting - Revenue Categories]
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
 *                 description: Name of the revenue category
 *                 example: "Management Fees"
 *               description:
 *                 type: string
 *                 description: Description of the revenue category
 *                 example: "Fund management and advisory fees"
 *               parentId:
 *                 type: string
 *                 description: ID of the parent category (optional for hierarchical structure)
 *                 example: "clx1234567890abcdef"
 *     responses:
 *       201:
 *         description: Revenue category created successfully
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
 *                   example: Revenue category created successfully
 *                 data:
 *                   $ref: '#/components/schemas/RevenueCategory'
 *       400:
 *         description: Bad request - missing required fields or invalid parent category
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Conflict - revenue category with this name already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/", authenticate, authorize(["admin", "accountant"]), RevenueCategoryController.createRevenueCategory);

/**
 * @swagger
 * /api/accounting/revenue-categories:
 *   get:
 *     summary: Get all revenue categories
 *     description: Retrieve all revenue categories with optional filtering
 *     tags: [Accounting - Revenue Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: parentId
 *         schema:
 *           type: string
 *         description: Filter by parent category ID
 *     responses:
 *       200:
 *         description: Revenue categories retrieved successfully
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
 *                   example: Revenue categories retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/RevenueCategory'
 */
router.get("/", authenticate, authorize(["admin", "accountant"]), RevenueCategoryController.getAllRevenueCategories);

/**
 * @swagger
 * /api/accounting/revenue-categories/{id}:
 *   get:
 *     summary: Get revenue category by ID
 *     description: Retrieve a single revenue category by its ID
 *     tags: [Accounting - Revenue Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Revenue category ID
 *     responses:
 *       200:
 *         description: Revenue category retrieved successfully
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
 *                   example: Revenue category retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/RevenueCategory'
 *       404:
 *         description: Revenue category not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/:id", authenticate, authorize(["admin", "accountant"]), RevenueCategoryController.getRevenueCategoryById);

/**
 * @swagger
 * /api/accounting/revenue-categories/{id}:
 *   put:
 *     summary: Update revenue category
 *     description: Update an existing revenue category
 *     tags: [Accounting - Revenue Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Revenue category ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Name of the revenue category
 *               description:
 *                 type: string
 *                 description: Description of the revenue category
 *               parentId:
 *                 type: string
 *                 description: ID of the parent category
 *               isActive:
 *                 type: boolean
 *                 description: Whether the revenue category is active
 *     responses:
 *       200:
 *         description: Revenue category updated successfully
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
 *                   example: Revenue category updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/RevenueCategory'
 *       404:
 *         description: Revenue category not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       409:
 *         description: Conflict - revenue category with this name already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put("/:id", authenticate, authorize(["admin", "accountant"]), RevenueCategoryController.updateRevenueCategory);

/**
 * @swagger
 * /api/accounting/revenue-categories/{id}:
 *   delete:
 *     summary: Delete revenue category
 *     description: Soft delete a revenue category by setting isActive to false
 *     tags: [Accounting - Revenue Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Revenue category ID
 *     responses:
 *       200:
 *         description: Revenue category deleted successfully
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
 *                   example: Revenue category deleted successfully
 *                 data:
 *                   $ref: '#/components/schemas/RevenueCategory'
 *       404:
 *         description: Revenue category not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       400:
 *         description: Bad request - revenue category is being used or has children
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete("/:id", authenticate, authorize(["admin", "accountant"]), RevenueCategoryController.deleteRevenueCategory);

export default router; 