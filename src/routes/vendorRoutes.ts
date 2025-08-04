// @ts-nocheck
import express from "express";
import { vendorController } from "../controllers/VendorController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /vendors:
 *   post:
 *     summary: Create a new vendor
 *     description: Create a new vendor for expense tracking
 *     tags: [Vendors]
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
 *                 description: Vendor name
 *                 example: "Legal Associates"
 *               taxNumber:
 *                 type: string
 *                 description: Vendor tax number
 *                 example: "123456789"
 *               contactPerson:
 *                 type: string
 *                 description: Contact person name
 *                 example: "John Doe"
 *               email:
 *                 type: string
 *                 description: Vendor email
 *                 example: "contact@legalassociates.com"
 *               phone:
 *                 type: string
 *                 description: Vendor phone number
 *                 example: "+263 77 123 4567"
 *               address:
 *                 type: string
 *                 description: Vendor address
 *                 example: "123 Main Street, Harare"
 *               paymentTerms:
 *                 type: string
 *                 description: Payment terms
 *                 example: "Net 30"
 *     responses:
 *       201:
 *         description: Vendor created successfully
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
 *                   example: Vendor created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Vendor'
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 */
router.post("/", vendorController.createVendor);

/**
 * @swagger
 * /vendors:
 *   get:
 *     summary: Get all vendors
 *     description: Retrieve all vendors with optional filters
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search vendors by name, contact person, or email
 *     responses:
 *       200:
 *         description: Vendors retrieved successfully
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
 *                     $ref: '#/components/schemas/Vendor'
 *       401:
 *         description: Unauthorized
 */
router.get("/", vendorController.getVendors);

/**
 * @swagger
 * /vendors/{id}:
 *   get:
 *     summary: Get vendor by ID
 *     description: Retrieve a specific vendor by ID with recent expenses
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
 *     responses:
 *       200:
 *         description: Vendor retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Vendor'
 *       404:
 *         description: Vendor not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", vendorController.getVendorById);

/**
 * @swagger
 * /vendors/{id}:
 *   put:
 *     summary: Update vendor
 *     description: Update a vendor
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Vendor name
 *               taxNumber:
 *                 type: string
 *                 description: Vendor tax number
 *               contactPerson:
 *                 type: string
 *                 description: Contact person name
 *               email:
 *                 type: string
 *                 description: Vendor email
 *               phone:
 *                 type: string
 *                 description: Vendor phone number
 *               address:
 *                 type: string
 *                 description: Vendor address
 *               paymentTerms:
 *                 type: string
 *                 description: Payment terms
 *               isActive:
 *                 type: boolean
 *                 description: Whether vendor is active
 *     responses:
 *       200:
 *         description: Vendor updated successfully
 *       404:
 *         description: Vendor not found
 *       401:
 *         description: Unauthorized
 */
router.put("/:id", vendorController.updateVendor);

/**
 * @swagger
 * /vendors/{id}:
 *   delete:
 *     summary: Delete vendor
 *     description: Soft delete a vendor (sets isActive to false)
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
 *     responses:
 *       200:
 *         description: Vendor deleted successfully
 *       404:
 *         description: Vendor not found
 *       400:
 *         description: Cannot delete vendor with associated expenses
 *       401:
 *         description: Unauthorized
 */
router.delete("/:id", vendorController.deleteVendor);

/**
 * @swagger
 * /vendors/{id}/expenses:
 *   get:
 *     summary: Get vendor expenses
 *     description: Retrieve expenses for a specific vendor
 *     tags: [Vendors]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor ID
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
 *         description: Vendor expenses retrieved successfully
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
 *         description: Vendor not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id/expenses", vendorController.getVendorExpenses);

export default router; 