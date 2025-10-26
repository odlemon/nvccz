// @ts-nocheck
import express from "express";
import CashbookBatchImportController, { upload } from "../controllers/CashbookBatchImportController";
import { authenticate } from "../middleware/authenticate";

const router = express.Router();

router.use(authenticate);

/**
 * @swagger
 * /api/cashbook/batches/import:
 *   post:
 *     summary: Import CSV file and create batch
 *     description: Import CSV file with cashbook transactions and create a batch
 *     tags: [Cashbook]
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
 *                 description: CSV file with transactions
 *     responses:
 *       200:
 *         description: CSV imported successfully
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
 *                     totalTransactions:
 *                       type: number
 *                     validTransactions:
 *                       type: number
 *                     invalidTransactions:
 *                       type: number
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *                     fileUrl:
 *                       type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/import", upload.single('file'), CashbookBatchImportController.importCSV);

/**
 * @swagger
 * /api/cashbook/batches/{batchId}/post:
 *   post:
 *     summary: Post batch to GL
 *     description: Post a batch of transactions to the general ledger
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch ID
 *     responses:
 *       200:
 *         description: Batch posted successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
router.post("/:batchId/post", CashbookBatchImportController.postBatch);

/**
 * @swagger
 * /api/cashbook/batches:
 *   get:
 *     summary: List all batches
 *     description: Get a paginated list of all batches with filtering options
 *     tags: [Cashbook]
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
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, POSTED]
 *         description: Filter by batch status
 *     responses:
 *       200:
 *         description: Batches retrieved successfully
 *       401:
 *         description: Unauthorized
 */
router.get("/", CashbookBatchImportController.listBatches);

/**
 * @swagger
 * /api/cashbook/batches/{batchId}:
 *   get:
 *     summary: Get batch details
 *     description: Get detailed information about a specific batch
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch ID
 *     responses:
 *       200:
 *         description: Batch details retrieved successfully
 *       404:
 *         description: Batch not found
 *       401:
 *         description: Unauthorized
 */
router.get("/:batchId", CashbookBatchImportController.getBatch);

/**
 * @swagger
 * /api/cashbook/batches/{batchId}:
 *   put:
 *     summary: Update batch
 *     description: Update batch details (name, description, status)
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [DRAFT, POSTED]
 *     responses:
 *       200:
 *         description: Batch updated successfully
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
router.put("/:batchId", CashbookBatchImportController.updateBatch);

/**
 * @swagger
 * /api/cashbook/batches/{batchId}:
 *   delete:
 *     summary: Delete batch
 *     description: Delete a batch (only if not posted)
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch ID
 *     responses:
 *       200:
 *         description: Batch deleted successfully
 *       400:
 *         description: Cannot delete posted batch
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Batch not found
 */
router.delete("/:batchId", CashbookBatchImportController.deleteBatch);

/**
 * @swagger
 * /api/cashbook/batches/{batchId}/export:
 *   get:
 *     summary: Export single batch to CSV
 *     description: Export a specific batch to CSV format for backup or transfer
 *     tags: [Cashbook]
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch ID
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
 *                     batchId:
 *                       type: string
 *                     batchName:
 *                       type: string
 *                     totalTransactions:
 *                       type: number
 *                     exportUrl:
 *                       type: string
 *                     fileName:
 *                       type: string
 *                     exportedAt:
 *                       type: string
 *                     csvContent:
 *                       type: string
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Batch not found
 */
router.get("/:batchId/export", CashbookBatchImportController.exportBatch);

/**
 * @swagger
 * /api/cashbook/batches/export/all:
 *   get:
 *     summary: Export all batches to CSV
 *     description: Export all batches for the authenticated user to CSV format
 *     tags: [Cashbook]
 *     responses:
 *       200:
 *         description: All batches exported successfully
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
 *                     totalBatches:
 *                       type: number
 *                     totalTransactions:
 *                       type: number
 *                     exportUrl:
 *                       type: string
 *                     fileName:
 *                       type: string
 *                     exportedAt:
 *                       type: string
 *                     csvContent:
 *                       type: string
 *       400:
 *         description: No batches found
 *       401:
 *         description: Unauthorized
 */
router.get("/export/all", CashbookBatchImportController.exportAllBatches);

export default router;
