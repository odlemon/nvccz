// @ts-nocheck
import { Router } from "express";
import RevenueController from "../controllers/RevenueController";
import { authenticate } from "../middleware/authenticate";
import { authorize } from "../middleware/permissionAuth";

// Who may use these routes is decided by the Accounting access guard in front of every accounting router
// (src/middleware/accountingAccessGuard.ts); the role-name lists that stood here refused the Finance Manager and auditors.
const router = Router();

/**
 * @swagger
 * /api/accounting/revenues:
 *   post:
 *     summary: Create a new revenue
 *     description: Create a new revenue transaction with automatic VAT calculation and journal entry creation
 *     tags: [Accounting - Revenue]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - sourceId
 *               - amount
 *               - currencyId
 *               - transactionDate
 *               - description
 *             properties:
 *               sourceId:
 *                 type: string
 *                 description: ID of the revenue source
 *                 example: "clx1234567890abcdef"
 *               categoryId:
 *                 type: string
 *                 description: ID of the revenue category (optional)
 *                 example: "clx1234567890abcdef"
 *               amount:
 *                 type: number
 *                 description: Revenue amount (excluding VAT)
 *                 example: 1000.00
 *               currencyId:
 *                 type: string
 *                 description: ID of the currency
 *                 example: "clx1234567890abcdef"
 *               transactionDate:
 *                 type: string
 *                 format: date
 *                 description: Date of the revenue transaction
 *                 example: "2024-01-15"
 *               description:
 *                 type: string
 *                 description: Description of the revenue
 *                 example: "Consulting services for Q1"
 *               isTaxable:
 *                 type: boolean
 *                 description: Whether the revenue is subject to VAT
 *                 example: true
 *               paymentMethod:
 *                 type: string
 *                 enum: [CASH, BANK, CREDIT]
 *                 description: Payment method used
 *                 default: BANK
 *                 example: "BANK"
 *     responses:
 *       201:
 *         description: Revenue created successfully
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
 *                   example: Revenue created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Revenue'
 *       400:
 *         description: Bad request - missing required fields
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post("/", authenticate, RevenueController.prototype.createRevenue);

/**
 * @swagger
 * /api/accounting/revenues:
 *   get:
 *     summary: Get all revenues
 *     description: Retrieve all revenues with optional filtering
 *     tags: [Accounting - Revenue]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: sourceId
 *         schema:
 *           type: string
 *         description: Filter by revenue source ID
 *       - in: query
 *         name: categoryId
 *         schema:
 *           type: string
 *         description: Filter by revenue category ID
 *       - in: query
 *         name: currencyId
 *         schema:
 *           type: string
 *         description: Filter by currency ID
 *       - in: query
 *         name: isTaxable
 *         schema:
 *           type: boolean
 *         description: Filter by taxable status
 *       - in: query
 *         name: paymentMethod
 *         schema:
 *           type: string
 *           enum: [CASH, BANK, CREDIT]
 *         description: Filter by payment method
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by start date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by end date
 *     responses:
 *       200:
 *         description: Revenues retrieved successfully
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
 *                   example: Revenues retrieved successfully
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Revenue'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/", authenticate, RevenueController.prototype.getRevenues);

/**
 * @swagger
 * /api/accounting/revenues/{id}:
 *   get:
 *     summary: Get revenue by ID
 *     description: Retrieve a single revenue by its ID
 *     tags: [Accounting - Revenue]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Revenue ID
 *     responses:
 *       200:
 *         description: Revenue retrieved successfully
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
 *                   example: Revenue retrieved successfully
 *                 data:
 *                   $ref: '#/components/schemas/Revenue'
 *       404:
 *         description: Revenue not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get("/:id", authenticate, RevenueController.prototype.getRevenueById);

/**
 * @swagger
 * /api/accounting/revenues/{id}:
 *   put:
 *     summary: Update revenue
 *     description: Update an existing revenue
 *     tags: [Accounting - Revenue]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Revenue ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               sourceId:
 *                 type: string
 *                 description: ID of the revenue source
 *               categoryId:
 *                 type: string
 *                 description: ID of the revenue category
 *               amount:
 *                 type: number
 *                 description: Revenue amount (excluding VAT)
 *               currencyId:
 *                 type: string
 *                 description: ID of the currency
 *               transactionDate:
 *                 type: string
 *                 format: date
 *                 description: Date of the revenue transaction
 *               description:
 *                 type: string
 *                 description: Description of the revenue
 *               isTaxable:
 *                 type: boolean
 *                 description: Whether the revenue is subject to VAT
 *               paymentMethod:
 *                 type: string
 *                 enum: [CASH, BANK, CREDIT]
 *                 description: Payment method used
 *               isActive:
 *                 type: boolean
 *                 description: Whether the revenue is active
 *     responses:
 *       200:
 *         description: Revenue updated successfully
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
 *                   example: Revenue updated successfully
 *                 data:
 *                   $ref: '#/components/schemas/Revenue'
 *       404:
 *         description: Revenue not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.put("/:id", authenticate, RevenueController.prototype.updateRevenue);

/**
 * @swagger
 * /api/accounting/revenues/{id}:
 *   delete:
 *     summary: Delete revenue
 *     description: Soft delete a revenue by setting isActive to false
 *     tags: [Accounting - Revenue]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Revenue ID
 *     responses:
 *       200:
 *         description: Revenue deleted successfully
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
 *                   example: Revenue deleted successfully
 *                 data:
 *                   $ref: '#/components/schemas/Revenue'
 *       404:
 *         description: Revenue not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       401:
 *         description: Unauthorized
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.delete("/:id", authenticate, RevenueController.prototype.deleteRevenue);

export default router; 