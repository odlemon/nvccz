// @ts-nocheck
import express from "express";
import { currencyController } from "../controllers/CurrencyController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// All routes require authentication
router.use(authenticate);

/**
 * @swagger
 * /currencies:
 *   post:
 *     summary: Create a new currency
 *     description: Create a new currency for the accounting system
 *     tags: [Currencies]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *               - name
 *               - symbol
 *             properties:
 *               code:
 *                 type: string
 *                 description: Currency code (e.g., ZWL, USD, EUR)
 *                 example: "ZWL"
 *               name:
 *                 type: string
 *                 description: Currency name
 *                 example: "Zimbabwe Dollar"
 *               symbol:
 *                 type: string
 *                 description: Currency symbol
 *                 example: "$"
 *               isDefault:
 *                 type: boolean
 *                 description: Whether this is the default currency
 *                 example: false
 *     responses:
 *       201:
 *         description: Currency created successfully
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
 *                   example: Currency created successfully
 *                 data:
 *                   $ref: '#/components/schemas/Currency'
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 */
router.post("/", currencyController.createCurrency);

/**
 * @swagger
 * /currencies:
 *   get:
 *     summary: Get all currencies
 *     description: Retrieve all currencies with optional filters
 *     tags: [Currencies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *       - in: query
 *         name: isDefault
 *         schema:
 *           type: boolean
 *         description: Filter by default status
 *     responses:
 *       200:
 *         description: Currencies retrieved successfully
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
 *                     $ref: '#/components/schemas/Currency'
 *       401:
 *         description: Unauthorized
 */
router.get("/", currencyController.getCurrencies);

/**
 * @swagger
 * /currencies/{id}:
 *   get:
 *     summary: Get currency by ID
 *     description: Retrieve a specific currency by ID
 *     tags: [Currencies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Currency ID
 *     responses:
 *       200:
 *         description: Currency retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Currency'
 *       404:
 *         description: Currency not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:id", currencyController.getCurrencyById);

/**
 * @swagger
 * /currencies/{id}:
 *   put:
 *     summary: Update currency
 *     description: Update a currency
 *     tags: [Currencies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Currency ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               code:
 *                 type: string
 *                 description: Currency code
 *               name:
 *                 type: string
 *                 description: Currency name
 *               symbol:
 *                 type: string
 *                 description: Currency symbol
 *               isActive:
 *                 type: boolean
 *                 description: Whether currency is active
 *               isDefault:
 *                 type: boolean
 *                 description: Whether this is the default currency
 *     responses:
 *       200:
 *         description: Currency updated successfully
 *       404:
 *         description: Currency not found
 *       401:
 *         description: Unauthorized
 */
router.put("/:id", currencyController.updateCurrency);

/**
 * @swagger
 * /currencies/{id}:
 *   delete:
 *     summary: Delete currency
 *     description: Soft delete a currency (sets isActive to false)
 *     tags: [Currencies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Currency ID
 *     responses:
 *       200:
 *         description: Currency deleted successfully
 *       404:
 *         description: Currency not found
 *       400:
 *         description: Cannot delete currency in use
 *       401:
 *         description: Unauthorized
 */
router.delete("/:id", currencyController.deleteCurrency);

/**
 * @swagger
 * /currencies/default:
 *   get:
 *     summary: Get default currency
 *     description: Retrieve the default currency
 *     tags: [Currencies]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Default currency retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   $ref: '#/components/schemas/Currency'
 *       404:
 *         description: No default currency found
 *       401:
 *         description: Unauthorized
 */
router.get("/default", currencyController.getDefaultCurrency);

/**
 * @swagger
 * /currencies/{id}/set-default:
 *   post:
 *     summary: Set default currency
 *     description: Set a currency as the default currency
 *     tags: [Currencies]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Currency ID
 *     responses:
 *       200:
 *         description: Default currency updated successfully
 *       404:
 *         description: Currency not found
 *       401:
 *         description: Unauthorized
 */
router.post("/:id/set-default", currencyController.setDefaultCurrency);

export default router; 