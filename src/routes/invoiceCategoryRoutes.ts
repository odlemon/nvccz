// @ts-nocheck
import express from "express";
import { InvoiceCategoryController } from "../controllers/InvoiceCategoryController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * /api/accounting/invoice-categories:
 *   post:
 *     summary: Create a new invoice category
 *     tags: [Invoice Categories]
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
 *                 description: Category name
 *               description:
 *                 type: string
 *                 description: Category description
 *               parentId:
 *                 type: string
 *                 description: Parent category ID (optional)
 *     responses:
 *       201:
 *         description: Invoice category created successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post("/", InvoiceCategoryController.createInvoiceCategory);

/**
 * @swagger
 * /api/accounting/invoice-categories:
 *   get:
 *     summary: Get invoice categories with filtering and pagination
 *     tags: [Invoice Categories]
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Search term for category name
 *       - in: query
 *         name: parentId
 *         schema:
 *           type: string
 *         description: Filter by parent category ID
 *     responses:
 *       200:
 *         description: Invoice categories retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/", InvoiceCategoryController.getInvoiceCategories);

/**
 * @swagger
 * /api/accounting/invoice-categories/{id}:
 *   get:
 *     summary: Get invoice category by ID
 *     tags: [Invoice Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID
 *     responses:
 *       200:
 *         description: Invoice category retrieved successfully
 *       404:
 *         description: Invoice category not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get("/:id", InvoiceCategoryController.getInvoiceCategoryById);

/**
 * @swagger
 * /api/accounting/invoice-categories/{id}:
 *   put:
 *     summary: Update an invoice category
 *     tags: [Invoice Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Category name
 *               description:
 *                 type: string
 *                 description: Category description
 *               parentId:
 *                 type: string
 *                 description: Parent category ID
 *     responses:
 *       200:
 *         description: Invoice category updated successfully
 *       404:
 *         description: Invoice category not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put("/:id", InvoiceCategoryController.updateInvoiceCategory);

/**
 * @swagger
 * /api/accounting/invoice-categories/{id}:
 *   delete:
 *     summary: Delete an invoice category
 *     tags: [Invoice Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID
 *     responses:
 *       200:
 *         description: Invoice category deleted successfully
 *       404:
 *         description: Invoice category not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete("/:id", InvoiceCategoryController.deleteInvoiceCategory);

export default router; 