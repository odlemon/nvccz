// @ts-nocheck
// Contra Entry Routes
// Handles contra entry configuration endpoints

import express from "express";
import ContraEntryController from "../controllers/ContraEntryController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// ============================================================================
// CONTRA ENTRIES - Detailed contra management
// ============================================================================

/**
 * @swagger
 * tags:
 *   name: Contra Entries
 *   description: Detailed contra management
 */

/**
 * @swagger
 * /api/cashbook/contra/configure:
 *   post:
 *     summary: Configure contra entry settings
 *     description: Configure contra entry settings for specific entry types and GL accounts
     *     tags: [Contra Entries]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - entryType
 *               - glAccountId
 *               - contraType
 *             properties:
 *               entryType:
 *                 type: string
 *                 enum: [RECEIPT, PAYMENT]
 *                 description: Type of cashbook entry
 *               glAccountId:
 *                 type: string
 *                 description: GL Account ID for contra configuration
 *               contraType:
 *                 type: string
 *                 enum: [DETAILED, SUMMARY]
 *                 description: Type of contra entry (detailed or summary)
 *               isEnabled:
 *                 type: boolean
 *                 default: true
 *                 description: Whether contra entry is enabled
 *     responses:
 *       200:
 *         description: Contra entry configuration updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request - Missing required fields
 *       401:
 *         description: Unauthorized - Authentication required
 *       500:
 *         description: Internal server error
 */
router.post('/configure', ContraEntryController.configureContraEntry);

/**
 * @swagger
 * /api/cashbook/contra/configs:
 *   get:
 *     summary: Get contra entry configurations
 *     description: Retrieve contra entry configurations with optional filtering
     *     tags: [Contra Entries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: entryType
 *         schema:
 *           type: string
 *           enum: [RECEIPT, PAYMENT]
 *         description: Filter by entry type
 *       - in: query
 *         name: glAccountId
 *         schema:
 *           type: string
 *         description: Filter by GL Account ID
 *       - in: query
 *         name: isEnabled
 *         schema:
 *           type: boolean
 *         description: Filter by enabled status
 *     responses:
 *       200:
 *         description: Contra entry configurations retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/configs', ContraEntryController.getContraEntryConfigs);

/**
 * @swagger
 * /api/cashbook/contra/generate:
 *   post:
 *     summary: Generate contra entry for cashbook transaction
 *     description: Generate contra entry for a specific cashbook transaction
     *     tags: [Contra Entries]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - cashbookEntryId
 *             properties:
 *               cashbookEntryId:
 *                 type: string
 *                 description: ID of the cashbook entry
 *     responses:
 *       200:
 *         description: Contra entry generated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *       400:
 *         description: Bad request - Missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/generate', ContraEntryController.generateContraEntry);

/**
 * @swagger
 * /api/cashbook/contra/entries/{cashbookEntryId}:
 *   get:
 *     summary: Get contra entries for cashbook entry
 *     description: Retrieve all contra entries for a specific cashbook entry
     *     tags: [Contra Entries]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: cashbookEntryId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the cashbook entry
 *     responses:
 *       200:
 *         description: Contra entries retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/entries/:cashbookEntryId', ContraEntryController.getContraEntries);

export default router;

