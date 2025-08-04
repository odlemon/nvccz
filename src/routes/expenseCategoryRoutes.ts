// @ts-nocheck
import express from "express";
import { expenseCategoryController } from "../controllers/ExpenseCategoryController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /expense-categories:
 *   post:
 *     summary: Create a new expense category
 *     description: Create a new expense category for organizing expenses
 *     tags: [Expense Categories]
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
 *                 example: "Legal Fees"
 *               description:
 *                 type: string
 *                 description: Category description
 *                 example: "Legal consultation and services"
 *               parentId:
 *                 type: string
 *                 description: Parent category ID (for subcategories)
 *                 example: "clx1234567890abcdef"
 *     responses:
 *       201:
 *         description: Category created successfully
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
 *                   example: Category created successfully
 *                 data:
 *                   $ref: '#/components/schemas/ExpenseCategory'
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 */
router.post("/", expenseCategoryController.createCategory);

/**
 * @swagger
 * /expense-categories:
 *   get:
 *     summary: Get all expense categories
 *     description: Retrieve all expense categories with optional filters
 *     tags: [Expense Categories]
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
 *         description: Filter by parent category (use 'null' for root categories)
 *       - in: query
 *         name: includeChildren
 *         schema:
 *           type: boolean
 *         description: Include child categories in response
 *     responses:
 *       200:
 *         description: Categories retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ExpenseCategory'
 *       401:
 *         description: Unauthorized
 */
router.get("/", expenseCategoryController.getCategories);

/**
 * @swagger
 * /expense-categories/{id}:
 *   get:
 *     summary: Get category by ID
 *     description: Retrieve a specific category by ID with parent, children, and recent expenses
 *     tags: [Expense Categories]
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
 *         description: Category retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/ExpenseCategory'
 *       404:
 *         description: Category not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", expenseCategoryController.getCategoryById);

/**
 * @swagger
 * /expense-categories/{id}:
 *   put:
 *     summary: Update category
 *     description: Update a category
 *     tags: [Expense Categories]
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
 *               isActive:
 *                 type: boolean
 *                 description: Whether category is active
 *     responses:
 *       200:
 *         description: Category updated successfully
 *       404:
 *         description: Category not found
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 */
router.put("/:id", expenseCategoryController.updateCategory);

/**
 * @swagger
 * /expense-categories/{id}:
 *   delete:
 *     summary: Delete category
 *     description: Soft delete a category (sets isActive to false)
 *     tags: [Expense Categories]
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
 *         description: Category deleted successfully
 *       404:
 *         description: Category not found
 *       400:
 *         description: Cannot delete category with associated expenses or subcategories
 *       401:
 *         description: Unauthorized
 */
router.delete("/:id", expenseCategoryController.deleteCategory);

/**
 * @swagger
 * /expense-categories/{id}/expenses:
 *   get:
 *     summary: Get category expenses
 *     description: Retrieve expenses for a specific category
 *     tags: [Expense Categories]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Category ID
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
 *         description: Category expenses retrieved successfully
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
 *                     expenses:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Expense'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       404:
 *         description: Category not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id/expenses", expenseCategoryController.getCategoryExpenses);

export default router; 