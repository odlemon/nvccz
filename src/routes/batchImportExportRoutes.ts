// @ts-nocheck
// Batch Import/Export Routes
// Handles batch import and export endpoints

import express from "express";
import BatchImportExportController from "../controllers/BatchImportExportController";
import { authenticate } from "../middleware/authenticate";
import multer from "multer";

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @swagger
 * /api/cashbook/batches/import:
 *   post:
 *     summary: Import batch from CSV file
 *     description: Import cashbook entries from a CSV file with field mapping
 *     tags: [Batch Import/Export]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - mapping
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: CSV file to import
 *               mapping:
 *                 type: string
 *                 description: JSON string mapping CSV columns to cashbook fields
 *                 example: '{"date":"transactionDate","description":"description","amount":"amount","customer":"customerId"}'
 *     responses:
 *       200:
 *         description: Batch imported successfully
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
 *                     totalRows:
 *                       type: number
 *                     validRows:
 *                       type: number
 *                     errorRows:
 *                       type: number
 *       400:
 *         description: Bad request - Invalid file or mapping
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/import', upload.single('file'), BatchImportExportController.importBatch);

/**
 * @swagger
 * /api/cashbook/batches/{batchId}/export:
 *   get:
 *     summary: Export batch to CSV/JSON
 *     description: Export cashbook batch entries to CSV or JSON format
 *     tags: [Batch Import/Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the batch to export
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [CSV, JSON]
 *           default: CSV
 *         description: Export format (CSV or JSON)
 *     responses:
 *       200:
 *         description: Batch exported successfully
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
 *                     exportId:
 *                       type: string
 *                     fileName:
 *                       type: string
 *                     downloadUrl:
 *                       type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/:batchId/export', BatchImportExportController.exportBatch);

/**
 * @swagger
 * /api/cashbook/batches/import/{batchId}/status:
 *   get:
 *     summary: Get import status
 *     description: Get the status of a batch import operation
 *     tags: [Batch Import/Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the import batch
 *     responses:
 *       200:
 *         description: Import status retrieved successfully
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
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/import/:batchId/status', BatchImportExportController.getImportStatus);

/**
 * @swagger
 * /api/cashbook/batches/{batchId}/exports:
 *   get:
 *     summary: Get export history
 *     description: Get the export history for a specific batch
 *     tags: [Batch Import/Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the batch
 *     responses:
 *       200:
 *         description: Export history retrieved successfully
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
router.get('/:batchId/exports', BatchImportExportController.getExportHistory);

/**
 * @swagger
 * /api/cashbook/batches/{batchId}:
 *   delete:
 *     summary: Delete unposted batch
 *     description: Delete an unposted batch and all its entries
 *     tags: [Batch Import/Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the batch to delete
 *     responses:
 *       200:
 *         description: Batch deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Bad request - Cannot delete posted batch
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.delete('/:batchId', BatchImportExportController.deleteBatch);

/**
 * @swagger
 * /api/cashbook/batches/{batchId}/export/{exportId}/download:
 *   get:
 *     summary: Download exported file
 *     description: Get download URL for an exported batch file
 *     tags: [Batch Import/Export]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the batch
 *       - in: path
 *         name: exportId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the export
 *     responses:
 *       200:
 *         description: Download URL generated successfully
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
 *                     downloadUrl:
 *                       type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Export not found
 *       410:
 *         description: Export has expired
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/:batchId/export/:exportId/download', BatchImportExportController.downloadExport);

export default router;

