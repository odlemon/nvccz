// @ts-nocheck
// Cashbook Import Routes
// API endpoints for cashbook import functionality

import express from "express";
import multer from "multer";
import CashbookImportController from "../controllers/CashbookImportController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authenticate);

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow CSV files
    if (file.mimetype.includes('csv') || file.mimetype.includes('text/csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

/**
 * @swagger
 * /api/cashbook/import/upload:
 *   post:
 *     summary: Upload and process CSV import file
 *     description: Upload a CSV file containing cashbook transactions and process them
 *     tags: [Cashbook Import]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: CSV file containing cashbook transactions
 *               mappings:
 *                 type: object
 *                 description: Column mapping configuration
 *     responses:
 *       200:
 *         description: Import file processed successfully
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
 *                   properties:
 *                     batchId:
 *                       type: string
 *                     totalRecords:
 *                       type: number
 *                     validRecords:
 *                       type: number
 *                     errorRecords:
 *                       type: number
 *                     transactions:
 *                       type: array
 *                     errors:
 *                       type: array
 *       400:
 *         description: Bad request - invalid file or data
 *       401:
 *         description: Unauthorized - user not authenticated
 *       500:
 *         description: Internal server error
 */
router.post("/upload", upload.single('file'), CashbookImportController.uploadImportFile);

/**
 * @swagger
 * /api/cashbook/import/batch/{batchId}:
 *   get:
 *     summary: Get import batch details
 *     description: Get detailed information about a specific import batch
 *     tags: [Cashbook Import]
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Import batch ID
 *     responses:
 *       200:
 *         description: Import batch retrieved successfully
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
 *                   properties:
 *                     id:
 *                       type: string
 *                     fileName:
 *                       type: string
 *                     status:
 *                       type: string
 *                     totalRecords:
 *                       type: number
 *                     validRecords:
 *                       type: number
 *                     errorRecords:
 *                       type: number
 *                     transactions:
 *                       type: array
 *                     importErrors:
 *                       type: array
 *       404:
 *         description: Import batch not found
 *       403:
 *         description: Access denied to this import batch
 *       401:
 *         description: Unauthorized - user not authenticated
 */
router.get("/batch/:batchId", CashbookImportController.getImportBatch);

/**
 * @swagger
 * /api/cashbook/import/batches:
 *   get:
 *     summary: List user's import batches
 *     description: Get a list of all import batches for the authenticated user
 *     tags: [Cashbook Import]
 *     responses:
 *       200:
 *         description: Import batches retrieved successfully
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
 *                     properties:
 *                       id:
 *                         type: string
 *                       fileName:
 *                         type: string
 *                       status:
 *                         type: string
 *                       totalRecords:
 *                         type: number
 *                       validRecords:
 *                         type: number
 *                       errorRecords:
 *                         type: number
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Unauthorized - user not authenticated
 */
router.get("/batches", CashbookImportController.listImportBatches);

/**
 * @swagger
 * /api/cashbook/import/download/{batchId}:
 *   get:
 *     summary: Download import file
 *     description: Download the original CSV file for an import batch
 *     tags: [Cashbook Import]
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Import batch ID
 *     responses:
 *       200:
 *         description: Import file downloaded successfully
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: Import batch or file not found
 *       403:
 *         description: Access denied to this import batch
 *       401:
 *         description: Unauthorized - user not authenticated
 */
router.get("/download/:batchId", CashbookImportController.downloadImportFile);

/**
 * @swagger
 * /api/cashbook/import/cleanup:
 *   delete:
 *     summary: Clean up old import files
 *     description: Delete old import files and batches older than specified days
 *     tags: [Cashbook Import]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               daysOld:
 *                 type: number
 *                 default: 7
 *                 description: Number of days old to clean up
 *     responses:
 *       200:
 *         description: Old imports cleaned up successfully
 *       401:
 *         description: Unauthorized - user not authenticated
 */
router.delete("/cleanup", CashbookImportController.cleanupOldImports);

/**
 * @swagger
 * /api/cashbook/import/template:
 *   get:
 *     summary: Get import template
 *     description: Download a CSV template for cashbook imports
 *     tags: [Cashbook Import]
 *     responses:
 *       200:
 *         description: Import template downloaded successfully
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 */
router.get("/template", CashbookImportController.getImportTemplate);

export default router;


